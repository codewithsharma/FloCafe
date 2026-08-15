/**
 * R12 — Void / Cancel report from audit_logs (no schema change).
 * Actions: order.cancelled, order.item_cancelled, order.item_voided.
 */
import type Database from 'better-sqlite3';
import { utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';

export const VOID_CANCEL_ACTIONS = [
  'order.cancelled',
  'order.item_cancelled',
  'order.item_voided',
] as const;

export type VoidCancelAction = (typeof VOID_CANCEL_ACTIONS)[number];

export const VOIDS_CSV_HEADERS = [
  'start_date',
  'end_date',
  'id',
  'created_at',
  'actor_user_id',
  'actor_name',
  'action',
  'entity_type',
  'entity_id',
  'reason',
  'order_id',
  'product_id',
  'product_name',
  'previous_status',
] as const;

export type VoidsCsvHeader = (typeof VOIDS_CSV_HEADERS)[number];

export type VoidCancelEvent = {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  reason: string | null;
  order_id: string | null;
  product_id: string | null;
  product_name: string | null;
  previous_status: string | null;
};

export type VoidCancelReport = {
  startDate: string;
  endDate: string;
  total_count: number;
  order_cancelled_count: number;
  item_cancelled_count: number;
  item_voided_count: number;
  by_action: Array<{ action: string; count: number }>;
  events: VoidCancelEvent[];
};

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed metadata
  }
  return {};
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function countFor(action: string, events: VoidCancelEvent[]): number {
  return events.filter((e) => e.action === action).length;
}

export function queryVoidCancelReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
): VoidCancelReport {
  const windowStart = utcDayBounds(startDate)[0];
  const windowEnd = utcDayBounds(endDate)[1];
  const placeholders = VOID_CANCEL_ACTIONS.map(() => '?').join(',');

  const rows = db
    .prepare(
      `
      SELECT
        audit.id,
        audit.actor_user_id,
        audit.action,
        audit.entity_type,
        audit.entity_id,
        audit.reason,
        audit.metadata_json,
        audit.created_at,
        user.name AS actor_name
      FROM audit_logs AS audit
      LEFT JOIN users AS user ON user.id = audit.actor_user_id
      WHERE audit.created_at >= ?
        AND audit.created_at < ?
        AND audit.action IN (${placeholders})
        AND audit.result = 'success'
      ORDER BY audit.created_at DESC, audit.id DESC
    `,
    )
    .all(windowStart, windowEnd, ...VOID_CANCEL_ACTIONS) as Array<Record<string, unknown>>;

  const events: VoidCancelEvent[] = rows.map((row) => {
    const meta = parseMetadata(row.metadata_json);
    let orderId = metaString(meta, 'order_id');
    if (!orderId && row.entity_type === 'order' && row.entity_id != null) {
      orderId = String(row.entity_id);
    }
    return {
      id: Number(row.id),
      created_at: String(row.created_at ?? ''),
      actor_user_id: row.actor_user_id == null ? null : String(row.actor_user_id),
      actor_name: row.actor_name == null ? null : String(row.actor_name),
      action: String(row.action ?? ''),
      entity_type: row.entity_type == null ? null : String(row.entity_type),
      entity_id: row.entity_id == null ? null : String(row.entity_id),
      reason: row.reason == null ? null : String(row.reason),
      order_id: orderId,
      product_id: metaString(meta, 'product_id'),
      product_name: metaString(meta, 'product_name'),
      previous_status: metaString(meta, 'previous_status'),
    };
  });

  const by_action = VOID_CANCEL_ACTIONS.map((action) => ({
    action,
    count: countFor(action, events),
  }));

  return {
    startDate,
    endDate,
    total_count: events.length,
    order_cancelled_count: countFor('order.cancelled', events),
    item_cancelled_count: countFor('order.item_cancelled', events),
    item_voided_count: countFor('order.item_voided', events),
    by_action,
    events,
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Deterministic CSV from an already-built report (same rows as JSON). */
export function voidCancelReportToCsv(report: VoidCancelReport): string {
  const lines = [toCsvRow([...VOIDS_CSV_HEADERS])];
  for (const event of report.events) {
    const row: Record<VoidsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      id: event.id,
      created_at: event.created_at,
      actor_user_id: event.actor_user_id ?? '',
      actor_name: event.actor_name ?? '',
      action: event.action,
      entity_type: event.entity_type ?? '',
      entity_id: event.entity_id ?? '',
      reason: event.reason ?? '',
      order_id: event.order_id ?? '',
      product_id: event.product_id ?? '',
      product_name: event.product_name ?? '',
      previous_status: event.previous_status ?? '',
    };
    lines.push(toCsvRow(VOIDS_CSV_HEADERS.map((h) => csvCell(row[h]))));
  }
  return lines.join('\n') + '\n';
}
