/**
 * RPT-PAY — Payment report deepen (no schema change).
 *
 * Source of record:
 *   Payments Received = bills.payment_details line amounts (gross tender; not rewritten by refunds)
 *   Refunds           = refunds table (status=completed)
 *   Net payments      = Payments Received − Refunds (window-scoped independently)
 *
 * Sales Gross/Refunds/Net come from day-sales-semantics for reconciliation context only —
 * do not treat sales totals as payment totals.
 */
import type Database from 'better-sqlite3';
import { utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { queryDaySalesSemantics, type DaySalesSemantics } from './day-sales-semantics';

export type PaymentMethodBreakdownRow = {
  method: string;
  count: number;
  total: number;
};

export type PaymentReportMethodRow = {
  method: string;
  payment_count: number;
  payments_received: number;
  refund_count: number;
  refunds: number;
  net_payments: number;
};

export type PaymentReport = {
  startDate: string;
  endDate: string;
  /** Gross tender in window (payment_details). */
  payments_received: number;
  payment_line_count: number;
  /** Completed refunds in window. */
  refunds: number;
  refund_count: number;
  /** payments_received − refunds (may be negative if refunds fall in a later window). */
  net_payments: number;
  by_method: PaymentReportMethodRow[];
  /** Bill sales semantics for the same UTC calendar window (not payment truth). */
  sales: DaySalesSemantics;
};

export const PAYMENTS_CSV_HEADERS = [
  'start_date',
  'end_date',
  'method',
  'payment_count',
  'payments_received',
  'refund_count',
  'refunds',
  'net_payments',
] as const;

export type PaymentsCsvHeader = (typeof PAYMENTS_CSV_HEADERS)[number];

/**
 * Payments Received by method — SQL JSON1 expansion of payment_details.
 * When paidOnly is true, only bills that settled at least once
 * (paid / partially_refunded / refunded) so refunds do not erase tender history.
 */
export function queryPaymentsReceivedByMethod(
  db: Database.Database,
  startDate: string,
  endDate = startDate,
  paidOnly = false,
): PaymentMethodBreakdownRow[] {
  const start = utcDayBounds(startDate)[0];
  const end = utcDayBounds(endDate)[1];
  const rows = db
    .prepare(
      `
    WITH payment_lines AS (
      SELECT b.paid_at, b.created_at, je.value AS line
      FROM bills b
      JOIN json_each(CASE
        WHEN json_valid(b.payment_details) AND json_type(b.payment_details) = 'array'
          THEN b.payment_details
        WHEN json_valid(b.payment_details)
          THEN json_array(b.payment_details)
        ELSE '[]'
      END) je
      WHERE b.payment_details IS NOT NULL
        AND b.created_at < ?
        AND (b.paid_at IS NULL OR b.paid_at >= ?)
        AND (
          ? = 0
          OR b.payment_status IN ('paid', 'partially_refunded', 'refunded')
        )
        AND json_type(je.value) = 'object'
    ), normalized AS (
      SELECT
        COALESCE(NULLIF(json_extract(line, '$.method'), ''), 'unknown') AS method,
        CAST(json_extract(line, '$.payment_method_id') AS INTEGER) AS payment_method_id,
        json_extract(line, '$.amount') AS amount,
        COALESCE(
          datetime(NULLIF(json_extract(line, '$.timestamp'), '')),
          datetime(NULLIF(paid_at, '')),
          datetime(NULLIF(created_at, ''))
        ) AS payment_time
      FROM payment_lines
    )
    SELECT COALESCE(pm.name, normalized.method) AS method, COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN typeof(amount) IN ('integer', 'real') THEN amount ELSE 0 END), 0) AS total
    FROM normalized LEFT JOIN payment_methods pm ON pm.id = normalized.payment_method_id
    WHERE payment_time >= datetime(?) AND payment_time < datetime(?)
    GROUP BY COALESCE(pm.name, normalized.method)
    ORDER BY total DESC
  `,
    )
    .all(end, start, paidOnly ? 1 : 0, start, end) as Array<{
    method: string;
    count: number;
    total: number;
  }>;

  return rows.map((r) => ({
    method: String(r.method ?? 'unknown'),
    count: Number(r.count || 0),
    total: Number(r.total || 0),
  }));
}

export type RefundMethodBreakdownRow = {
  method: string;
  count: number;
  total: number;
};

/** Completed refunds by refund tender method in the UTC day window. */
export function queryRefundsByMethod(
  db: Database.Database,
  startDate: string,
  endDate = startDate,
): RefundMethodBreakdownRow[] {
  const start = utcDayBounds(startDate)[0];
  const end = utcDayBounds(endDate)[1];
  const rows = db
    .prepare(
      `
    SELECT
      COALESCE(NULLIF(method, ''), 'unknown') AS method,
      COUNT(*) AS count,
      COALESCE(SUM(amount_cents), 0) / 100.0 AS total
    FROM refunds
    WHERE status = 'completed'
      AND created_at >= ?
      AND created_at < ?
    GROUP BY COALESCE(NULLIF(method, ''), 'unknown')
    ORDER BY total DESC
  `,
    )
    .all(start, end) as Array<{ method: string; count: number; total: number }>;

  return rows.map((r) => ({
    method: String(r.method ?? 'unknown'),
    count: Number(r.count || 0),
    total: Number(r.total || 0),
  }));
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Composed payment report for a UTC calendar inclusive start/end date pair.
 * Includes partial tenders (paidOnly=false) — matches daily-stats Payment Methods.
 */
export function queryPaymentReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
): PaymentReport {
  const [windowStart, windowEnd] = [utcDayBounds(startDate)[0], utcDayBounds(endDate)[1]];
  const payments = queryPaymentsReceivedByMethod(db, startDate, endDate, false);
  const refundsByMethod = queryRefundsByMethod(db, startDate, endDate);
  const sales = queryDaySalesSemantics(db, windowStart, windowEnd);

  const methodKeys = new Set<string>();
  for (const p of payments) methodKeys.add(p.method);
  for (const r of refundsByMethod) methodKeys.add(r.method);

  const payMap = new Map(payments.map((p) => [p.method, p]));
  const refMap = new Map(refundsByMethod.map((r) => [r.method, r]));

  const by_method: PaymentReportMethodRow[] = [...methodKeys]
    .map((method) => {
      const pay = payMap.get(method);
      const ref = refMap.get(method);
      const payments_received = Number(pay?.total || 0);
      const refunds = Number(ref?.total || 0);
      return {
        method,
        payment_count: Number(pay?.count || 0),
        payments_received: roundMoney(payments_received),
        refund_count: Number(ref?.count || 0),
        refunds: roundMoney(refunds),
        net_payments: roundMoney(payments_received - refunds),
      };
    })
    .sort((a, b) => b.payments_received - a.payments_received || a.method.localeCompare(b.method));

  const payments_received = roundMoney(
    by_method.reduce((sum, row) => sum + row.payments_received, 0),
  );
  const refunds = roundMoney(by_method.reduce((sum, row) => sum + row.refunds, 0));
  const payment_line_count = by_method.reduce((sum, row) => sum + row.payment_count, 0);
  const refund_count = by_method.reduce((sum, row) => sum + row.refund_count, 0);

  return {
    startDate,
    endDate,
    payments_received,
    payment_line_count,
    refunds,
    refund_count,
    net_payments: roundMoney(payments_received - refunds),
    by_method,
    sales: {
      grossSales: Number(sales.grossSales || 0),
      refunds: Number(sales.refunds || 0),
      netSales: Number(sales.netSales || 0),
    },
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Deterministic CSV — one row per method (+ totals row when methods exist). */
export function paymentReportToCsv(report: PaymentReport): string {
  const lines = [toCsvRow([...PAYMENTS_CSV_HEADERS])];
  for (const row of report.by_method) {
    const cells: Record<PaymentsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      method: row.method,
      payment_count: row.payment_count,
      payments_received: row.payments_received,
      refund_count: row.refund_count,
      refunds: row.refunds,
      net_payments: row.net_payments,
    };
    lines.push(toCsvRow(PAYMENTS_CSV_HEADERS.map((h) => csvCell(cells[h]))));
  }
  if (report.by_method.length > 0) {
    const totals: Record<PaymentsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      method: '__total__',
      payment_count: report.payment_line_count,
      payments_received: report.payments_received,
      refund_count: report.refund_count,
      refunds: report.refunds,
      net_payments: report.net_payments,
    };
    lines.push(toCsvRow(PAYMENTS_CSV_HEADERS.map((h) => csvCell(totals[h]))));
  }
  return lines.join('\n') + '\n';
}
