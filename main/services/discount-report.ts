/**
 * RPT-DISC — Discount report (no schema change).
 *
 * Source of record (applied monetary impact on settled sales):
 *   Order-level discounts = bills.discount_amount on settled / collectible-complete bills
 *   Item-level discounts  = order_items.discount_amount for those bills' orders
 *                           (excludes cancelled / voided / void_adjustment lines)
 *
 * Refunds do NOT reverse discount amounts (tender ledger is separate — see payment report).
 * Cancelled unpaid orders never settle → excluded.
 *
 * Sales Gross/Refunds/Net from day-sales-semantics are context only:
 *   app Gross Sales = SUM(bill.total) post-discount (incl. tax) — not pre-discount merchandise.
 */
import type Database from 'better-sqlite3';
import { utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { queryDaySalesSemantics, type DaySalesSemantics } from './day-sales-semantics';

export type DiscountReportBreakdownRow = {
  key: string;
  count: number;
  amount: number;
};

export type DiscountReport = {
  startDate: string;
  endDate: string;
  /** Σ bills.discount_amount (order-level) on settled bills in window. */
  order_discounts: number;
  /** Σ order_items.discount_amount for settled bills' orders (active lines). */
  item_discounts: number;
  /** order_discounts + item_discounts (layered comps; not double-counted). */
  total_discounts: number;
  /** Settled bills with order discount > 0 or linked item discount > 0. */
  discounted_bill_count: number;
  /** total_discounts / discounted_bill_count (0 when none). */
  average_discount: number;
  /** Σ bills.subtotal for settled bills (pre order-level discount; post item comps). */
  merchandise_subtotal: number;
  /** merchandise_subtotal − order_discounts (pre-tax after order discount). */
  discounted_merchandise: number;
  by_type: Array<{ type: string; count: number; amount: number }>;
  by_source: Array<{ source: string; count: number; amount: number }>;
  by_scope: Array<{ scope: string; count: number; amount: number }>;
  sales: DaySalesSemantics;
};

export const DISCOUNTS_CSV_HEADERS = [
  'start_date',
  'end_date',
  'breakdown',
  'key',
  'count',
  'amount',
] as const;

export type DiscountsCsvHeader = (typeof DISCOUNTS_CSV_HEADERS)[number];

/** Same settlement filter as day-sales-semantics / FIN-02. */
const SETTLED_BILL_SQL = `
  (
    payment_status IN ('paid', 'partially_refunded', 'refunded')
    OR (
      payment_status = 'partial'
      AND ROUND(total * 100) <= COALESCE((
        SELECT SUM(
          CASE
            WHEN typeof(json_extract(je.value, '$.amount')) IN ('integer', 'real')
              THEN ROUND(json_extract(je.value, '$.amount') * 100)
            ELSE 0
          END
        )
        FROM json_each(CASE
          WHEN json_valid(payment_details) AND json_type(payment_details) = 'array'
            THEN payment_details
          WHEN json_valid(payment_details)
            THEN json_array(payment_details)
          ELSE '[]'
        END) je
        WHERE json_type(je.value) = 'object'
      ), 0)
    )
  )
`;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifySource(reason: string | null | undefined): 'coupon' | 'manual' {
  const r = String(reason || '')
    .trim()
    .toLowerCase();
  if (r.startsWith('coupon:')) return 'coupon';
  return 'manual';
}

type SettledBillRow = {
  id: number;
  order_id: number;
  discount_amount: number;
  discount_type: string | null;
  discount_reason: string | null;
  subtotal: number;
};

function listSettledBillsInWindow(
  db: Database.Database,
  start: string,
  end: string,
): SettledBillRow[] {
  return db
    .prepare(
      `
    SELECT
      id,
      order_id,
      COALESCE(discount_amount, 0) AS discount_amount,
      discount_type,
      discount_reason,
      COALESCE(subtotal, 0) AS subtotal
    FROM bills
    WHERE created_at >= ? AND created_at < ?
      AND ${SETTLED_BILL_SQL}
  `,
    )
    .all(start, end) as SettledBillRow[];
}

function sumItemDiscountsForOrders(db: Database.Database, orderIds: number[]): number {
  if (orderIds.length === 0) return 0;
  const placeholders = orderIds.map(() => '?').join(',');
  const row = db
    .prepare(
      `
    SELECT COALESCE(SUM(COALESCE(discount_amount, 0)), 0) AS total
    FROM order_items
    WHERE order_id IN (${placeholders})
      AND COALESCE(discount_amount, 0) > 0
      AND status NOT IN ('cancelled', 'voided', 'void_adjustment')
  `,
    )
    .get(...orderIds) as { total: number };
  return Number(row.total || 0);
}

function itemDiscountBillCount(db: Database.Database, orderIds: number[]): Set<number> {
  const withItems = new Set<number>();
  if (orderIds.length === 0) return withItems;
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `
    SELECT DISTINCT order_id
    FROM order_items
    WHERE order_id IN (${placeholders})
      AND COALESCE(discount_amount, 0) > 0
      AND status NOT IN ('cancelled', 'voided', 'void_adjustment')
  `,
    )
    .all(...orderIds) as Array<{ order_id: number }>;
  for (const r of rows) withItems.add(Number(r.order_id));
  return withItems;
}

/**
 * Composed discount report for a UTC calendar inclusive start/end date pair.
 */
export function queryDiscountReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
): DiscountReport {
  const [windowStart, windowEnd] = [utcDayBounds(startDate)[0], utcDayBounds(endDate)[1]];
  const bills = listSettledBillsInWindow(db, windowStart, windowEnd);
  const orderIds = [...new Set(bills.map((b) => Number(b.order_id)))];
  const item_discounts = roundMoney(sumItemDiscountsForOrders(db, orderIds));
  const ordersWithItemDisc = itemDiscountBillCount(db, orderIds);

  let order_discounts = 0;
  let merchandise_subtotal = 0;
  const typeMap = new Map<string, { count: number; amount: number }>();
  const sourceMap = new Map<string, { count: number; amount: number }>();
  let discounted_bill_count = 0;

  for (const bill of bills) {
    const od = Number(bill.discount_amount || 0);
    merchandise_subtotal += Number(bill.subtotal || 0);
    const hasItem = ordersWithItemDisc.has(Number(bill.order_id));
    if (od > 0 || hasItem) discounted_bill_count += 1;
    if (od <= 0) continue;

    order_discounts += od;
    const typeKey = String(bill.discount_type || 'unknown');
    const typeEntry = typeMap.get(typeKey) || { count: 0, amount: 0 };
    typeEntry.count += 1;
    typeEntry.amount += od;
    typeMap.set(typeKey, typeEntry);

    const sourceKey = classifySource(bill.discount_reason);
    const sourceEntry = sourceMap.get(sourceKey) || { count: 0, amount: 0 };
    sourceEntry.count += 1;
    sourceEntry.amount += od;
    sourceMap.set(sourceKey, sourceEntry);
  }

  order_discounts = roundMoney(order_discounts);
  merchandise_subtotal = roundMoney(merchandise_subtotal);
  const total_discounts = roundMoney(order_discounts + item_discounts);
  const discounted_merchandise = roundMoney(merchandise_subtotal - order_discounts);
  const average_discount =
    discounted_bill_count > 0 ? roundMoney(total_discounts / discounted_bill_count) : 0;

  const by_type = [...typeMap.entries()]
    .map(([type, v]) => ({ type, count: v.count, amount: roundMoney(v.amount) }))
    .sort((a, b) => b.amount - a.amount || a.type.localeCompare(b.type));

  const by_source = [...sourceMap.entries()]
    .map(([source, v]) => ({ source, count: v.count, amount: roundMoney(v.amount) }))
    .sort((a, b) => b.amount - a.amount || a.source.localeCompare(b.source));

  const by_scope: Array<{ scope: string; count: number; amount: number }> = [];
  if (order_discounts > 0) {
    by_scope.push({
      scope: 'order',
      count: by_type.reduce((s, r) => s + r.count, 0),
      amount: order_discounts,
    });
  }
  if (item_discounts > 0) {
    by_scope.push({
      scope: 'item',
      count: ordersWithItemDisc.size,
      amount: item_discounts,
    });
  }
  by_scope.sort((a, b) => b.amount - a.amount || a.scope.localeCompare(b.scope));

  const sales = queryDaySalesSemantics(db, windowStart, windowEnd);

  return {
    startDate,
    endDate,
    order_discounts,
    item_discounts,
    total_discounts,
    discounted_bill_count,
    average_discount,
    merchandise_subtotal,
    discounted_merchandise,
    by_type,
    by_source,
    by_scope,
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

function pushBreakdownRows(
  lines: string[],
  report: DiscountReport,
  breakdown: string,
  rows: Array<{ key: string; count: number; amount: number }>,
): void {
  for (const row of rows) {
    const cells: Record<DiscountsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      breakdown,
      key: row.key,
      count: row.count,
      amount: row.amount,
    };
    lines.push(toCsvRow(DISCOUNTS_CSV_HEADERS.map((h) => csvCell(cells[h]))));
  }
}

/** Deterministic CSV — summary + type/source/scope breakdown rows. */
export function discountReportToCsv(report: DiscountReport): string {
  const lines = [toCsvRow([...DISCOUNTS_CSV_HEADERS])];
  if (report.total_discounts === 0 && report.discounted_bill_count === 0) {
    return lines.join('\n') + '\n';
  }

  const summaryRows: Array<{ key: string; count: number; amount: number }> = [
    { key: 'total_discounts', count: report.discounted_bill_count, amount: report.total_discounts },
    {
      key: 'order_discounts',
      count: report.by_type.reduce((s, r) => s + r.count, 0),
      amount: report.order_discounts,
    },
    {
      key: 'item_discounts',
      count: report.by_scope.find((r) => r.scope === 'item')?.count || 0,
      amount: report.item_discounts,
    },
    {
      key: 'average_discount',
      count: report.discounted_bill_count,
      amount: report.average_discount,
    },
    { key: 'merchandise_subtotal', count: 0, amount: report.merchandise_subtotal },
    { key: 'discounted_merchandise', count: 0, amount: report.discounted_merchandise },
  ];
  pushBreakdownRows(lines, report, 'summary', summaryRows);
  pushBreakdownRows(
    lines,
    report,
    'type',
    report.by_type.map((r) => ({ key: r.type, count: r.count, amount: r.amount })),
  );
  pushBreakdownRows(
    lines,
    report,
    'source',
    report.by_source.map((r) => ({ key: r.source, count: r.count, amount: r.amount })),
  );
  pushBreakdownRows(
    lines,
    report,
    'scope',
    report.by_scope.map((r) => ({ key: r.scope, count: r.count, amount: r.amount })),
  );
  return lines.join('\n') + '\n';
}
