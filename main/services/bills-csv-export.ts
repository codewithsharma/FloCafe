import type Database from 'better-sqlite3';
import { utcDayBounds } from '../db';

export const MAX_BILLS_CSV_RANGE_DAYS = 93;

export const BILLS_CSV_HEADERS = [
  'date',
  'bill_number',
  'bill_id',
  'order_id',
  'bill_status',
  'gross_sales',
  'discount',
  'tax',
  'net_sales',
  'refunds',
  'payments_received',
  'payment_summary',
] as const;

export type BillsCsvExportRow = Record<(typeof BILLS_CSV_HEADERS)[number], string | number>;

export class BillsCsvExportError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'BillsCsvExportError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function inclusiveCalendarDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

export function validateBillsCsvDateRange(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  if (!isValidCalendarDate(startDate)) {
    throw new BillsCsvExportError('start_date must use YYYY-MM-DD format');
  }
  if (!isValidCalendarDate(endDate)) {
    throw new BillsCsvExportError('end_date must use YYYY-MM-DD format');
  }
  if (startDate > endDate) {
    throw new BillsCsvExportError('start_date must be on or before end_date');
  }
  if (inclusiveCalendarDays(startDate, endDate) > MAX_BILLS_CSV_RANGE_DAYS) {
    throw new BillsCsvExportError(`Date range cannot exceed ${MAX_BILLS_CSV_RANGE_DAYS} days`);
  }
  return { startDate, endDate };
}

export function formatMoneyDecimal(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function parsePaymentDetailsLines(
  paymentDetailsJson: string | null | undefined,
): Array<Record<string, unknown>> {
  if (!paymentDetailsJson) return [];
  try {
    const parsed = JSON.parse(paymentDetailsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((line) => line && typeof line === 'object' && !Array.isArray(line));
    }
    if (parsed && typeof parsed === 'object') return [parsed as Record<string, unknown>];
  } catch {
    // Malformed JSON — treat as no payment lines.
  }
  return [];
}

function parseLineAmount(amount: unknown): number {
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
  if (typeof amount === 'string') {
    const parsed = Number(amount.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function resolveMethod(line: Record<string, unknown>): string {
  const method = line.method;
  return typeof method === 'string' && method.trim() ? method.trim() : 'unknown';
}

export function summarizePaymentDetails(paymentDetailsJson: string | null | undefined): {
  paymentsReceived: number;
  paymentSummary: string;
} {
  const totalsByMethod = new Map<string, number>();
  let paymentsReceived = 0;

  for (const line of parsePaymentDetailsLines(paymentDetailsJson)) {
    const amount = parseLineAmount(line.amount);
    paymentsReceived += amount;
    const method = resolveMethod(line);
    totalsByMethod.set(method, (totalsByMethod.get(method) || 0) + amount);
  }

  const paymentSummary = Array.from(totalsByMethod.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([method, amount]) => `${method}:${formatMoneyDecimal(amount)}`)
    .join('|');

  return { paymentsReceived, paymentSummary };
}

type BillCsvDbRow = {
  date: string;
  bill_number: string;
  bill_id: number;
  order_id: number;
  bill_status: string;
  gross_sales: number | null;
  discount: number | null;
  tax: number | null;
  net_sales: number | null;
  refunds: number | null;
  payment_details: string | null;
};

export function listBillsForCsvExport(
  db: Database.Database,
  startDate: string,
  endDate: string,
): BillsCsvExportRow[] {
  const [windowStart, windowEnd] = utcDayBounds(startDate);
  const [, endExclusive] = utcDayBounds(endDate);

  const rows = db
    .prepare(
      `
    SELECT
      substr(b.created_at, 1, 10) AS date,
      b.bill_number,
      b.id AS bill_id,
      b.order_id,
      b.payment_status AS bill_status,
      b.total AS gross_sales,
      b.discount_amount AS discount,
      b.tax_amount AS tax,
      b.paid_amount AS net_sales,
      COALESCE(r.refund_total, 0) AS refunds,
      b.payment_details
    FROM bills b
    LEFT JOIN (
      SELECT bill_id, SUM(amount) AS refund_total
      FROM refunds
      WHERE status = 'completed'
      GROUP BY bill_id
    ) r ON r.bill_id = b.id
    WHERE b.created_at >= ? AND b.created_at < ?
    ORDER BY b.created_at ASC, b.id ASC
  `,
    )
    .all(windowStart, endExclusive) as BillCsvDbRow[];

  return rows.map((row) => {
    const { paymentsReceived, paymentSummary } = summarizePaymentDetails(row.payment_details);
    return {
      date: row.date,
      bill_number: row.bill_number,
      bill_id: row.bill_id,
      order_id: row.order_id,
      bill_status: row.bill_status,
      gross_sales: formatMoneyDecimal(row.gross_sales),
      discount: formatMoneyDecimal(row.discount),
      tax: formatMoneyDecimal(row.tax),
      net_sales: formatMoneyDecimal(row.net_sales),
      refunds: formatMoneyDecimal(row.refunds),
      payments_received: formatMoneyDecimal(paymentsReceived),
      payment_summary: paymentSummary,
    };
  });
}
