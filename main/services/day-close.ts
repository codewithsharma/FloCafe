/**
 * M5-G — Business-day close snapshot across closed terminal shifts.
 *
 * Business date uses settings.timezone (OD-M5-5), not UTC.
 * Open shifts warn but do not block (OD-M5-6). Does not require shifts_enabled.
 */

import {
  businessDateInTimezone,
  getDatabase,
  getSettingValue,
  localDayBoundsUtc,
  now,
  withTxn,
} from '../db';
import { aggregatePaymentsFromPaymentDetailsJson } from './payment-cash';
import { logAuditEvent, type AuditContext } from './audit-log';

const DAY_CLOSE_ROLES = new Set(['owner', 'manager']);
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class DayCloseServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = 'DayCloseServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface DayCloseRecord {
  id: number;
  business_date: string;
  closed_by_user_id: string;
  summary_json: string;
  created_at: string;
}

export interface DayCloseShiftSummary {
  id: number;
  terminal_id: string;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  opening_float_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface DayCloseSummary {
  business_date: string;
  timezone: string;
  shift_count: number;
  open_shift_count: number;
  open_shifts_warning: boolean;
  opening_float_cents_total: number;
  expected_cash_cents_total: number;
  counted_cash_cents_total: number | null;
  variance_cents_total: number | null;
  cash_payment_total_cents: number;
  cash_payment_count: number;
  shifts: DayCloseShiftSummary[];
}

interface ClosedShiftRow {
  id: number;
  terminal_id: string;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  opening_float_cents: number;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  opened_at: string;
  closed_at: string | null;
}

function assertDayCloseRole(role: string): void {
  if (!DAY_CLOSE_ROLES.has(role)) {
    throw new DayCloseServiceError(403, 'Insufficient permissions', 'FORBIDDEN');
  }
}

function resolveTimezone(): string {
  return (getSettingValue('timezone') || 'Asia/Kolkata').trim() || 'Asia/Kolkata';
}

function parseBusinessDate(value: string | null | undefined, timezone: string): string {
  if (value === undefined || value === null || value === '') {
    return businessDateInTimezone(timezone);
  }
  if (typeof value !== 'string' || !BUSINESS_DATE_RE.test(value)) {
    throw new DayCloseServiceError(400, 'business_date must be YYYY-MM-DD', 'VALIDATION');
  }
  return value;
}

function mapDayCloseRow(row: Record<string, unknown>): DayCloseRecord {
  return {
    id: Number(row.id),
    business_date: String(row.business_date),
    closed_by_user_id: String(row.closed_by_user_id),
    summary_json: String(row.summary_json),
    created_at: String(row.created_at),
  };
}

export function getDayClose(businessDate: string): DayCloseRecord | null {
  if (!BUSINESS_DATE_RE.test(businessDate)) {
    throw new DayCloseServiceError(400, 'business_date must be YYYY-MM-DD', 'VALIDATION');
  }
  const row = getDatabase().prepare(`
    SELECT id, business_date, closed_by_user_id, summary_json, created_at
    FROM day_closes
    WHERE business_date = ?
  `).get(businessDate) as Record<string, unknown> | undefined;
  return row ? mapDayCloseRow(row) : null;
}

function isUniqueDayCloseConstraint(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || '');
  const code = String(err?.code || '');
  if (!/UNIQUE|CONSTRAINT/i.test(code) && !/UNIQUE constraint failed/i.test(message)) {
    return false;
  }
  return /day_closes\.business_date|UNIQUE constraint failed: day_closes\.business_date/i.test(message)
    || (/UNIQUE constraint failed/i.test(message) && /business_date/i.test(message))
    || code === 'SQLITE_CONSTRAINT_UNIQUE';
}

function loadClosedShiftsForWindow(start: string, end: string): ClosedShiftRow[] {
  return getDatabase().prepare(`
    SELECT
      id, terminal_id, opened_by_user_id, closed_by_user_id,
      opening_float_cents, expected_cash_cents, counted_cash_cents, variance_cents,
      opened_at, closed_at
    FROM shifts
    WHERE status = 'closed'
      AND closed_at IS NOT NULL
      AND closed_at >= ?
      AND closed_at < ?
    ORDER BY closed_at ASC, id ASC
  `).all(start, end) as ClosedShiftRow[];
}

function countOpenShifts(): number {
  const row = getDatabase().prepare(`
    SELECT COUNT(*) AS count FROM shifts WHERE status = 'open'
  `).get() as { count: number };
  return Number(row.count) || 0;
}

function aggregateCashPaymentsForShiftIds(
  shiftIds: number[],
): Map<number, { totalCents: number; count: number }> {
  const byShift = new Map<number, { totalCents: number; count: number }>();
  for (const id of shiftIds) {
    byShift.set(id, { totalCents: 0, count: 0 });
  }
  if (shiftIds.length === 0) return byShift;

  const placeholders = shiftIds.map(() => '?').join(',');
  const rows = getDatabase().prepare(`
    SELECT shift_id, payment_details
    FROM bills
    WHERE shift_id IN (${placeholders})
      AND payment_details IS NOT NULL
      AND payment_details != ''
  `).all(...shiftIds) as { shift_id: number; payment_details: string }[];

  for (const row of rows) {
    const bucket = byShift.get(Number(row.shift_id));
    if (!bucket) continue;
    const aggregated = aggregatePaymentsFromPaymentDetailsJson(row.payment_details);
    bucket.totalCents += aggregated.cashTotalCents;
    bucket.count += aggregated.cashCount;
  }
  return byShift;
}

function buildDayCloseSummary(
  businessDate: string,
  timezone: string,
  closedShifts: ClosedShiftRow[],
  openShiftCount: number,
): DayCloseSummary {
  const cashByShift = aggregateCashPaymentsForShiftIds(closedShifts.map((s) => Number(s.id)));
  let openingFloatTotal = 0;
  let expectedTotal = 0;
  let countedTotal = 0;
  let countedAny = false;
  let varianceTotal = 0;
  let varianceAny = false;
  let cashPaymentTotal = 0;
  let cashPaymentCount = 0;

  const shifts: DayCloseShiftSummary[] = closedShifts.map((row) => {
    const id = Number(row.id);
    const opening = Number(row.opening_float_cents) || 0;
    const expected = row.expected_cash_cents == null ? null : Number(row.expected_cash_cents);
    const counted = row.counted_cash_cents == null ? null : Number(row.counted_cash_cents);
    const variance = row.variance_cents == null ? null : Number(row.variance_cents);
    const cash = cashByShift.get(id) || { totalCents: 0, count: 0 };

    openingFloatTotal += opening;
    expectedTotal += expected ?? 0;
    if (counted !== null) {
      countedTotal += counted;
      countedAny = true;
    }
    if (variance !== null) {
      varianceTotal += variance;
      varianceAny = true;
    }
    cashPaymentTotal += cash.totalCents;
    cashPaymentCount += cash.count;

    return {
      id,
      terminal_id: String(row.terminal_id),
      opened_by_user_id: String(row.opened_by_user_id),
      closed_by_user_id: row.closed_by_user_id == null ? null : String(row.closed_by_user_id),
      opening_float_cents: opening,
      expected_cash_cents: expected,
      counted_cash_cents: counted,
      variance_cents: variance,
      opened_at: String(row.opened_at),
      closed_at: row.closed_at == null ? null : String(row.closed_at),
    };
  });

  return {
    business_date: businessDate,
    timezone,
    shift_count: shifts.length,
    open_shift_count: openShiftCount,
    open_shifts_warning: openShiftCount > 0,
    opening_float_cents_total: openingFloatTotal,
    expected_cash_cents_total: expectedTotal,
    counted_cash_cents_total: countedAny ? countedTotal : null,
    variance_cents_total: varianceAny ? varianceTotal : null,
    cash_payment_total_cents: cashPaymentTotal,
    cash_payment_count: cashPaymentCount,
    shifts,
  };
}

export function closeBusinessDay(input: {
  actor: { userId: string; role: string };
  businessDate?: string | null;
  context?: AuditContext | null;
}): { day_close: DayCloseRecord; summary: DayCloseSummary } {
  assertDayCloseRole(input.actor.role);
  const timezone = resolveTimezone();
  const businessDate = parseBusinessDate(input.businessDate, timezone);

  const existing = getDayClose(businessDate);
  if (existing) {
    throw new DayCloseServiceError(
      409,
      `Day close already exists for ${businessDate} (id ${existing.id})`,
      'DAY_CLOSE_EXISTS',
    );
  }

  try {
    return withTxn(() => {
      const [start, end] = localDayBoundsUtc(businessDate, timezone);
      const closedShifts = loadClosedShiftsForWindow(start, end);
      const openShiftCount = countOpenShifts();
      const summary = buildDayCloseSummary(businessDate, timezone, closedShifts, openShiftCount);
      const createdAt = now();
      const info = getDatabase().prepare(`
        INSERT INTO day_closes (business_date, closed_by_user_id, summary_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        businessDate,
        input.actor.userId,
        JSON.stringify(summary),
        createdAt,
      );
      const id = Number(info.lastInsertRowid);
      logAuditEvent({
        actorUserId: input.actor.userId,
        action: 'day.closed',
        entityType: 'day_close',
        entityId: id,
        result: 'success',
        metadata: {
          business_date: businessDate,
          shift_count: summary.shift_count,
          expected_cash_cents_total: summary.expected_cash_cents_total,
          variance_cents_total: summary.variance_cents_total,
          open_shifts_warning: summary.open_shifts_warning,
        },
        context: input.context || null,
      });
      return {
        day_close: {
          id,
          business_date: businessDate,
          closed_by_user_id: input.actor.userId,
          summary_json: JSON.stringify(summary),
          created_at: createdAt,
        },
        summary,
      };
    });
  } catch (error) {
    if (error instanceof DayCloseServiceError) throw error;
    if (isUniqueDayCloseConstraint(error)) {
      const raced = getDayClose(businessDate);
      throw new DayCloseServiceError(
        409,
        raced
          ? `Day close already exists for ${businessDate} (id ${raced.id})`
          : `Day close already exists for ${businessDate}`,
        'DAY_CLOSE_EXISTS',
      );
    }
    throw error;
  }
}
