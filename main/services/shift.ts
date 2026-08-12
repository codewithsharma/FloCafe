/**
 * M4-C — centralized shift lifecycle (open / close / force-close).
 *
 * M5-C: read-only expected cash computation.
 * M5-D: close/force-close persist expected_cash_cents + variance_cents.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase, getSettingValue, now, upsertSettings, withTxn } from '../db';
import { logAuditEvent, type AuditContext } from './audit-log';
import { aggregatePaymentsFromPaymentDetailsJson } from './payment-cash';

export type ShiftStatus = 'open' | 'closed';

export interface ShiftActor {
  userId: string;
  role: string;
}

export interface ShiftRecord {
  id: number;
  terminal_id: string;
  status: ShiftStatus;
  opened_by_user_id: string;
  closed_by_user_id: string | null;
  opening_float_cents: number;
  opening_note: string | null;
  closing_note: string | null;
  counted_cash_cents: number | null;
  expected_cash_cents: number | null;
  variance_cents: number | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ShiftReconciliation {
  expectedCashCents: number;
  varianceCents: number | null;
  cashPaymentTotalCents: number;
  cashPaymentCount: number;
}

export interface ShiftPaymentSummary {
  cash_payment_count: number;
  cash_payment_total_cents: number;
  non_cash_payment_total_cents: number;
  cash_refund_count: number;
  cash_refund_total_cents: number;
}

export interface ShiftReconciliationPreview {
  shift: ShiftRecord;
  opening_float_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number | null;
  variance_cents: number | null;
  summary: ShiftPaymentSummary;
}

export interface ShiftListQuery {
  actor: ShiftActor;
  terminalId?: string;
  status?: string;
  openedByUserId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

const OPEN_ROLES = new Set(['owner', 'manager', 'cashier']);
const CLOSE_ROLES = new Set(['owner', 'manager', 'cashier']);
const FORCE_CLOSE_ROLES = new Set(['owner', 'manager']);
const HISTORY_ROLES = new Set(['owner', 'manager']);
const MAX_NOTE_LENGTH = 500;
const MAX_REASON_LENGTH = 500;
const MAX_TERMINAL_ID_LENGTH = 128;
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const SHIFT_COLUMNS = `
  id, terminal_id, status, opened_by_user_id, closed_by_user_id,
  opening_float_cents, opening_note, closing_note, counted_cash_cents,
  expected_cash_cents, variance_cents,
  opened_at, closed_at, created_at, updated_at
`;

export class ShiftServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code: string) {
    super(message);
    this.name = 'ShiftServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isShiftsEnabled(): boolean {
  return getSettingValue('shifts_enabled') === 'true';
}

export function assertShiftsEnabled(): void {
  if (!isShiftsEnabled()) {
    throw new ShiftServiceError(503, 'Shift management is disabled', 'SHIFTS_DISABLED');
  }
}

export function getHostTerminalId(): string | null {
  const value = (getSettingValue('terminal_id') || '').trim();
  return value ? value : null;
}

export function getOrCreateHostTerminalId(): string {
  const existing = getHostTerminalId();
  if (existing) return existing;
  const generated = randomUUID();
  upsertSettings({ terminal_id: generated });
  return generated;
}

export function mapShiftWriteError(error: unknown): ShiftServiceError {
  if (error instanceof ShiftServiceError) return error;
  if (isUniqueOpenShiftConstraint(error)) {
    return new ShiftServiceError(
      409,
      'An open shift already exists for this terminal',
      'SHIFT_ALREADY_OPEN',
    );
  }
  throw error;
}

export function openShift(input: {
  actor: ShiftActor;
  terminalId?: string | null;
  openingFloatCents: unknown;
  openingNote?: unknown;
  context?: AuditContext | null;
}): ShiftRecord {
  assertShiftsEnabled();
  assertRole(input.actor.role, OPEN_ROLES);
  const terminalId = resolveTerminalId(input.terminalId, { generateHostIfMissing: true });
  const openingFloatCents = parseRequiredCents(input.openingFloatCents, 'opening_float_cents');
  const openingNote = parseOptionalText(input.openingNote, 'opening_note', MAX_NOTE_LENGTH);

  const existing = getActiveShift(terminalId);
  if (existing) {
    throw new ShiftServiceError(409, 'An open shift already exists for this terminal', 'SHIFT_ALREADY_OPEN');
  }

  try {
    return withTxn(() => {
      const timestamp = now();
      const info = getDatabase().prepare(`
        INSERT INTO shifts (
          terminal_id, status, opened_by_user_id, opening_float_cents, opening_note,
          opened_at, created_at, updated_at
        ) VALUES (?, 'open', ?, ?, ?, ?, ?, ?)
      `).run(
        terminalId,
        input.actor.userId,
        openingFloatCents,
        openingNote,
        timestamp,
        timestamp,
        timestamp,
      );
      const shiftId = Number(info.lastInsertRowid);
      logAuditEvent({
        actorUserId: input.actor.userId,
        action: 'shift.opened',
        entityType: 'shift',
        entityId: shiftId,
        result: 'success',
        metadata: {
          terminal_id: terminalId,
          opening_float_cents: openingFloatCents,
          opening_note: openingNote,
        },
        context: withTerminalContext(input.context, terminalId),
      });
      return mustGetShift(shiftId);
    });
  } catch (error) {
    throw mapShiftWriteError(error);
  }
}

export function getActiveShift(terminalId: string): ShiftRecord | null {
  const normalized = parseTerminalId(terminalId);
  const row = getDatabase().prepare(`
    SELECT ${SHIFT_COLUMNS} FROM shifts
    WHERE terminal_id = ? AND status = 'open'
    LIMIT 1
  `).get(normalized) as Record<string, unknown> | undefined;
  return row ? toShiftRecord(row) : null;
}

export function getShift(id: number): ShiftRecord | null {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const row = getDatabase().prepare(`
    SELECT ${SHIFT_COLUMNS} FROM shifts WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;
  return row ? toShiftRecord(row) : null;
}

export function listShifts(query: ShiftListQuery): { shifts: ShiftRecord[]; limit: number; offset: number } {
  assertShiftsEnabled();
  assertRole(query.actor.role, HISTORY_ROLES);
  const limit = parseLimit(query.limit);
  const offset = parseOffset(query.offset);
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (query.terminalId) {
    clauses.push('terminal_id = ?');
    params.push(parseTerminalId(query.terminalId));
  }
  if (query.status) {
    if (query.status !== 'open' && query.status !== 'closed') {
      throw new ShiftServiceError(400, 'status must be open or closed', 'VALIDATION');
    }
    clauses.push('status = ?');
    params.push(query.status);
  }
  if (query.openedByUserId) {
    clauses.push('opened_by_user_id = ?');
    params.push(String(query.openedByUserId));
  }
  if (query.since) {
    clauses.push('opened_at >= ?');
    params.push(parseTimestampFilter(query.since, 'since'));
  }
  if (query.until) {
    clauses.push('opened_at <= ?');
    params.push(parseTimestampFilter(query.until, 'until'));
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);
  const rows = getDatabase().prepare(`
    SELECT ${SHIFT_COLUMNS} FROM shifts
    ${where}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params) as Array<Record<string, unknown>>;

  return { shifts: rows.map(toShiftRecord), limit, offset };
}

export function closeShift(input: {
  actor: ShiftActor;
  shiftId: number;
  terminalId?: string | null;
  countedCashCents?: unknown;
  closingNote?: unknown;
  context?: AuditContext | null;
}): ShiftRecord {
  assertShiftsEnabled();
  assertRole(input.actor.role, CLOSE_ROLES);
  const shift = requireOpenShift(input.shiftId);
  assertCashierTerminalAccess(input.actor, shift, input.terminalId);
  const countedCashCents = parseOptionalCents(input.countedCashCents, 'counted_cash_cents');
  const closingNote = parseOptionalText(input.closingNote, 'closing_note', MAX_NOTE_LENGTH);

  try {
    return withTxn(() => {
      const reconciliation = computeShiftReconciliation(shift.id, countedCashCents);
      const timestamp = now();
      const updated = getDatabase().prepare(`
        UPDATE shifts
        SET status = 'closed',
            closed_by_user_id = ?,
            closed_at = ?,
            counted_cash_cents = ?,
            closing_note = ?,
            expected_cash_cents = ?,
            variance_cents = ?,
            updated_at = ?
        WHERE id = ? AND status = 'open'
      `).run(
        input.actor.userId,
        timestamp,
        countedCashCents,
        closingNote,
        reconciliation.expectedCashCents,
        reconciliation.varianceCents,
        timestamp,
        shift.id,
      );
      if (updated.changes !== 1) {
        throw new ShiftServiceError(409, 'Shift is already closed', 'SHIFT_ALREADY_CLOSED');
      }
      logAuditEvent({
        actorUserId: input.actor.userId,
        action: 'shift.closed',
        entityType: 'shift',
        entityId: shift.id,
        result: 'success',
        metadata: {
          terminal_id: shift.terminal_id,
          counted_cash_cents: countedCashCents,
          closing_note: closingNote,
          opened_by_user_id: shift.opened_by_user_id,
          expected_cash_cents: reconciliation.expectedCashCents,
          variance_cents: reconciliation.varianceCents,
          cash_payment_total_cents: reconciliation.cashPaymentTotalCents,
          cash_payment_count: reconciliation.cashPaymentCount,
        },
        context: withTerminalContext(input.context, shift.terminal_id),
      });
      return mustGetShift(shift.id);
    });
  } catch (error) {
    throw mapShiftWriteError(error);
  }
}

export function forceCloseShift(input: {
  actor: ShiftActor;
  shiftId: number;
  reason: unknown;
  countedCashCents?: unknown;
  closingNote?: unknown;
  context?: AuditContext | null;
}): ShiftRecord {
  assertShiftsEnabled();
  assertRole(input.actor.role, FORCE_CLOSE_ROLES);
  const shift = requireOpenShift(input.shiftId);
  const reason = parseRequiredText(input.reason, 'reason', MAX_REASON_LENGTH);
  const countedCashCents = parseOptionalCents(input.countedCashCents, 'counted_cash_cents');
  const closingNote = parseOptionalText(input.closingNote, 'closing_note', MAX_NOTE_LENGTH);

  try {
    return withTxn(() => {
      const reconciliation = computeShiftReconciliation(shift.id, countedCashCents);
      const timestamp = now();
      const updated = getDatabase().prepare(`
        UPDATE shifts
        SET status = 'closed',
            closed_by_user_id = ?,
            closed_at = ?,
            counted_cash_cents = ?,
            closing_note = ?,
            expected_cash_cents = ?,
            variance_cents = ?,
            updated_at = ?
        WHERE id = ? AND status = 'open'
      `).run(
        input.actor.userId,
        timestamp,
        countedCashCents,
        closingNote,
        reconciliation.expectedCashCents,
        reconciliation.varianceCents,
        timestamp,
        shift.id,
      );
      if (updated.changes !== 1) {
        throw new ShiftServiceError(409, 'Shift is already closed', 'SHIFT_ALREADY_CLOSED');
      }
      logAuditEvent({
        actorUserId: input.actor.userId,
        action: 'shift.force_closed',
        entityType: 'shift',
        entityId: shift.id,
        result: 'success',
        reason,
        metadata: {
          terminal_id: shift.terminal_id,
          reason,
          counted_cash_cents: countedCashCents,
          opened_by_user_id: shift.opened_by_user_id,
          closed_by_user_id: input.actor.userId,
          expected_cash_cents: reconciliation.expectedCashCents,
          variance_cents: reconciliation.varianceCents,
          cash_payment_total_cents: reconciliation.cashPaymentTotalCents,
          cash_payment_count: reconciliation.cashPaymentCount,
        },
        context: withTerminalContext(input.context, shift.terminal_id),
      });
      return mustGetShift(shift.id);
    });
  } catch (error) {
    throw mapShiftWriteError(error);
  }
}

export function parseShiftId(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : String(raw ?? '');
  if (typeof value === 'string' && !/^[1-9]\d{0,15}$/.test(value)) {
    throw new ShiftServiceError(400, 'Invalid shift id', 'VALIDATION');
  }
  const id = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ShiftServiceError(400, 'Invalid shift id', 'VALIDATION');
  }
  return id;
}

function requireOpenShift(shiftId: number): ShiftRecord {
  const shift = getShift(shiftId);
  if (!shift) {
    throw new ShiftServiceError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
  }
  if (shift.status !== 'open') {
    throw new ShiftServiceError(409, 'Shift is already closed', 'SHIFT_ALREADY_CLOSED');
  }
  return shift;
}

function mustGetShift(id: number): ShiftRecord {
  const shift = getShift(id);
  if (!shift) {
    throw new ShiftServiceError(500, 'Shift could not be loaded', 'SHIFT_LOAD_FAILED');
  }
  return shift;
}

function assertRole(role: string, allowed: Set<string>): void {
  if (!allowed.has(role)) {
    throw new ShiftServiceError(403, 'Insufficient permissions', 'FORBIDDEN');
  }
}

function assertCashierTerminalAccess(
  actor: ShiftActor,
  shift: ShiftRecord,
  terminalId: string | null | undefined,
): void {
  if (actor.role !== 'cashier') return;
  if (!terminalId) {
    throw new ShiftServiceError(400, 'terminal_id is required to close this shift', 'VALIDATION');
  }
  const normalized = parseTerminalId(terminalId);
  if (normalized !== shift.terminal_id) {
    throw new ShiftServiceError(403, 'Insufficient permissions', 'FORBIDDEN');
  }
}

function resolveTerminalId(provided: string | null | undefined, options: { generateHostIfMissing: boolean }): string {
  if (provided !== undefined && provided !== null && String(provided).trim() !== '') {
    return parseTerminalId(provided);
  }
  if (options.generateHostIfMissing) {
    return getOrCreateHostTerminalId();
  }
  const host = getHostTerminalId();
  if (host) return parseTerminalId(host);
  throw new ShiftServiceError(400, 'terminal_id is required', 'VALIDATION');
}

function parseTerminalId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ShiftServiceError(400, 'terminal_id is invalid', 'VALIDATION');
  }
  const terminalId = value.trim();
  if (
    !terminalId
    || terminalId.length > MAX_TERMINAL_ID_LENGTH
    || !TERMINAL_ID_PATTERN.test(terminalId)
  ) {
    throw new ShiftServiceError(400, 'terminal_id is invalid', 'VALIDATION');
  }
  return terminalId;
}

function parseRequiredCents(value: unknown, field: string): number {
  const parsed = parseOptionalCents(value, field);
  if (parsed === null) {
    throw new ShiftServiceError(400, `${field} is required`, 'VALIDATION');
  }
  return parsed;
}

function parseOptionalCents(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean' || typeof value === 'object') {
    throw new ShiftServiceError(400, `${field} must be a non-negative integer`, 'VALIDATION');
  }
  if (typeof value === 'string' && !/^\d+$/.test(value)) {
    throw new ShiftServiceError(400, `${field} must be a non-negative integer`, 'VALIDATION');
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new ShiftServiceError(400, `${field} must be a non-negative integer`, 'VALIDATION');
  }
  const cents = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new ShiftServiceError(400, `${field} must be a non-negative integer`, 'VALIDATION');
  }
  return cents;
}

function parseOptionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ShiftServiceError(400, `${field} must be a string`, 'VALIDATION');
  }
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw new ShiftServiceError(400, `${field} is too long`, 'VALIDATION');
  }
  return text;
}

function parseRequiredText(value: unknown, field: string, maxLength: number): string {
  const text = parseOptionalText(value, field, maxLength);
  if (!text) {
    throw new ShiftServiceError(400, `${field} is required`, 'VALIDATION');
  }
  return text;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_LIST_LIMIT;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new ShiftServiceError(400, `limit must be an integer between 1 and ${MAX_LIST_LIMIT}`, 'VALIDATION');
  }
  return limit;
}

function parseOffset(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const offset = Number(value);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ShiftServiceError(400, 'offset must be a non-negative integer', 'VALIDATION');
  }
  return offset;
}

function parseTimestampFilter(value: string, field: string): string {
  const text = String(value).trim();
  if (!text || text.length > 40) {
    throw new ShiftServiceError(400, `${field} is invalid`, 'VALIDATION');
  }
  return text;
}

function withTerminalContext(context: AuditContext | null | undefined, terminalId: string): AuditContext {
  return {
    ...(context || {}),
    terminalId: context?.terminalId || terminalId,
  };
}

function toShiftRecord(row: Record<string, unknown>): ShiftRecord {
  return {
    id: Number(row.id),
    terminal_id: String(row.terminal_id),
    status: row.status === 'closed' ? 'closed' : 'open',
    opened_by_user_id: String(row.opened_by_user_id),
    closed_by_user_id: row.closed_by_user_id == null ? null : String(row.closed_by_user_id),
    opening_float_cents: Number(row.opening_float_cents),
    opening_note: row.opening_note == null ? null : String(row.opening_note),
    closing_note: row.closing_note == null ? null : String(row.closing_note),
    counted_cash_cents: row.counted_cash_cents == null ? null : Number(row.counted_cash_cents),
    expected_cash_cents: row.expected_cash_cents == null ? null : Number(row.expected_cash_cents),
    variance_cents: row.variance_cents == null ? null : Number(row.variance_cents),
    opened_at: String(row.opened_at),
    closed_at: row.closed_at == null ? null : String(row.closed_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function isUniqueOpenShiftConstraint(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const message = String(err?.message || '');
  const code = String(err?.code || '');
  if (!/UNIQUE|CONSTRAINT/i.test(code) && !/UNIQUE constraint failed/i.test(message)) {
    return false;
  }
  return /shifts\.terminal_id|idx_shifts_one_open_per_terminal|UNIQUE constraint failed/i.test(message)
    || code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * M4-D2 / M4-D3 — Resolve active shift for terminal from X-Flo-Terminal-Id header.
 *
 * Used for initial order creation (M4-D2) and first bill payment attribution (M4-D3).
 * If shifts are disabled: returns null.
 * If X-Flo-Terminal-Id header was not provided (undefined): returns null.
 * If X-Flo-Terminal-Id header is provided: calls getActiveShift(terminalIdHeader).
 *   - If invalid/malformed, parseTerminalId inside getActiveShift throws ShiftServiceError(400),
 *     which is NOT caught, causing transaction rollback and returning HTTP 400.
 *   - If valid and an active shift exists: returns shift.id.
 *   - If valid and no active shift exists: returns null.
 */
export function resolveActiveShiftForTerminal(terminalIdHeader: string | undefined): number | null {
  if (!isShiftsEnabled()) {
    return null;
  }
  if (terminalIdHeader === undefined) {
    return null;
  }
  const activeShift = getActiveShift(terminalIdHeader);
  return activeShift ? activeShift.id : null;
}

export const resolveActiveShiftForOrder = resolveActiveShiftForTerminal;

export const TERMINAL_ID_REQUEST_HEADER = 'x-flo-terminal-id';

/**
 * M4-D5 — Read X-Flo-Terminal-Id from an HTTP request without host fallback.
 * Returns undefined when the header is absent; malformed values are validated by getActiveShift/parseTerminalId.
 */
export function readTerminalIdHeaderFromRequest(req: { headers: Record<string, unknown> }): string | undefined {
  const raw = req.headers[TERMINAL_ID_REQUEST_HEADER];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : (raw as string);
}

/**
 * M4-D5 — Strict POS shift requirement for opt-in protected mutations.
 *
 * When shifts_enabled=false: no-op, returns null (no lookup).
 * When shifts_enabled=true:
 *   - missing header → 409 OPEN_SHIFT_REQUIRED
 *   - valid terminal without open shift → 409 OPEN_SHIFT_REQUIRED
 *   - valid terminal with open shift → returns the active shift
 *   - malformed terminal → 400 via parseTerminalId
 *
 * Do not use for soft attribution (orders.shift_id / bills.shift_id); use resolveActiveShiftForTerminal.
 */
export function assertOpenShiftForPosTerminal(terminalIdHeader: string | undefined): ShiftRecord | null {
  if (!isShiftsEnabled()) return null;
  if (terminalIdHeader === undefined) {
    throw new ShiftServiceError(
      409,
      'An open shift is required for this terminal',
      'OPEN_SHIFT_REQUIRED',
    );
  }
  const activeShift = getActiveShift(terminalIdHeader);
  if (!activeShift) {
    throw new ShiftServiceError(
      409,
      'An open shift is required for this terminal',
      'OPEN_SHIFT_REQUIRED',
    );
  }
  return activeShift;
}

export function isCashPaymentGateEnabled(): boolean {
  return isShiftsEnabled() && getSettingValue('require_open_shift_for_cash') === 'true';
}

/**
 * M4-D4 — Require an open shift on the payment terminal before cash is accepted.
 * Only active when shifts_enabled and require_open_shift_for_cash are both true.
 * Missing terminal header or no active shift → 409. Invalid terminal id → 400 via parseTerminalId.
 */
export function assertOpenShiftForCashPayment(terminalIdHeader: string | undefined): void {
  if (!isCashPaymentGateEnabled()) return;
  if (terminalIdHeader === undefined) {
    throw new ShiftServiceError(
      409,
      'An open shift is required for cash payments',
      'OPEN_SHIFT_REQUIRED',
    );
  }
  const activeShift = getActiveShift(terminalIdHeader);
  if (!activeShift) {
    throw new ShiftServiceError(
      409,
      'An open shift is required for cash payments',
      'OPEN_SHIFT_REQUIRED',
    );
  }
}

function aggregatePaymentsForShift(shiftId: number): {
  cashTotalCents: number;
  cashCount: number;
  nonCashTotalCents: number;
} {
  const rows = getDatabase().prepare(`
    SELECT payment_details
    FROM bills
    WHERE shift_id = ?
      AND payment_details IS NOT NULL
      AND payment_details != ''
  `).all(shiftId) as { payment_details: string }[];

  let cashTotalCents = 0;
  let cashCount = 0;
  let nonCashTotalCents = 0;
  for (const row of rows) {
    const aggregated = aggregatePaymentsFromPaymentDetailsJson(row.payment_details);
    cashTotalCents += aggregated.cashTotalCents;
    cashCount += aggregated.cashCount;
    nonCashTotalCents += aggregated.nonCashTotalCents;
  }
  return { cashTotalCents, cashCount, nonCashTotalCents };
}

function aggregateCashPaymentsForShift(shiftId: number): { totalCents: number; count: number } {
  const aggregated = aggregatePaymentsForShift(shiftId);
  return { totalCents: aggregated.cashTotalCents, count: aggregated.cashCount };
}

/**
 * M5-E / M6 — Payment breakdown for a shift (read-only; bills.shift_id attribution).
 * Cash refunds attributed via refunds.shift_id (method === 'cash' only).
 */
export function getShiftPaymentSummary(shiftId: number): ShiftPaymentSummary {
  const aggregated = aggregatePaymentsForShift(shiftId);
  const cashRefunds = sumCashRefundsForShift(shiftId);
  return {
    cash_payment_count: aggregated.cashCount,
    cash_payment_total_cents: aggregated.cashTotalCents,
    non_cash_payment_total_cents: aggregated.nonCashTotalCents,
    cash_refund_count: cashRefunds.count,
    cash_refund_total_cents: cashRefunds.totalCents,
  };
}

function sumCashRefundsForShift(shiftId: number): { totalCents: number; count: number } {
  const row = getDatabase().prepare(`
    SELECT
      COALESCE(SUM(amount_cents), 0) AS total_cents,
      COUNT(*) AS count
    FROM refunds
    WHERE shift_id = ?
      AND status = 'completed'
      AND method = 'cash'
  `).get(shiftId) as { total_cents: number; count: number } | undefined;
  if (!row) return { totalCents: 0, count: 0 };
  return {
    totalCents: Number(row.total_cents) || 0,
    count: Number(row.count) || 0,
  };
}

/**
 * M5-E — Read-only reconciliation preview (does not accept counted cash or mutate DB).
 *
 * Open shifts: expected computed live; counted/variance null.
 * Closed shifts: persisted expected/variance/count when present; summary recomputed from bills.
 */
export function getShiftReconciliationPreview(input: {
  actor: ShiftActor;
  shiftId: number;
  terminalId?: string | null;
}): ShiftReconciliationPreview {
  assertShiftsEnabled();
  const shift = getShift(input.shiftId);
  if (!shift) {
    throw new ShiftServiceError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
  }
  assertCashierTerminalAccess(input.actor, shift, input.terminalId);
  const summary = getShiftPaymentSummary(shift.id);
  const liveExpectedCashCents =
    shift.opening_float_cents + summary.cash_payment_total_cents - summary.cash_refund_total_cents;

  if (shift.status === 'closed') {
    return {
      shift,
      opening_float_cents: shift.opening_float_cents,
      expected_cash_cents: shift.expected_cash_cents ?? liveExpectedCashCents,
      counted_cash_cents: shift.counted_cash_cents,
      variance_cents: shift.variance_cents,
      summary,
    };
  }

  return {
    shift,
    opening_float_cents: shift.opening_float_cents,
    expected_cash_cents: liveExpectedCashCents,
    counted_cash_cents: null,
    variance_cents: null,
    summary,
  };
}

/**
 * M5-D / M6 — Compute close-time reconciliation for a shift (read + derive; no writes).
 *
 * expected = opening_float + cash payment total - cash refund total
 * variance = counted === null ? null : counted - expected
 * Only method === 'cash' refunds (isResolvedCashPaymentMethod) affect expected cash.
 */
function computeShiftReconciliation(
  shiftId: number,
  countedCashCents: number | null,
): ShiftReconciliation {
  const shift = getShift(shiftId);
  if (!shift) {
    throw new ShiftServiceError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
  }
  const cash = aggregateCashPaymentsForShift(shiftId);
  const cashRefunds = sumCashRefundsForShift(shiftId);
  const expectedCashCents = shift.opening_float_cents + cash.totalCents - cashRefunds.totalCents;
  return {
    expectedCashCents,
    varianceCents: countedCashCents === null ? null : countedCashCents - expectedCashCents,
    cashPaymentTotalCents: cash.totalCents,
    cashPaymentCount: cash.count,
  };
}

/**
 * M5-C / M6 — Compute expected drawer cash for a shift (read-only).
 *
 * Formula:
 *   opening_float_cents
 *   + SUM(qualifying cash applied amounts on bills WHERE shift_id = shift)
 *   - SUM(completed cash refunds WHERE refunds.shift_id = shift)
 * Attribution uses bills.shift_id for payments and refunds.shift_id for refunds.
 * Does not write expected_cash_cents or variance_cents (M5-D persists those at close).
 *
 * Concurrent payment writes may change the result between calls; close-time persistence is M5-D.
 */
export function computeExpectedCashCents(shiftId: number): number {
  const shift = getShift(shiftId);
  if (!shift) {
    throw new ShiftServiceError(404, 'Shift not found', 'SHIFT_NOT_FOUND');
  }
  const cash = aggregateCashPaymentsForShift(shiftId);
  const cashRefunds = sumCashRefundsForShift(shiftId);
  return shift.opening_float_cents + cash.totalCents - cashRefunds.totalCents;
}

