/**
 * RPT-PRODUCT — Product performance report (no schema change).
 *
 * Source of record:
 *   Settled bills in UTC window (FIN-02 / day-sales SETTLED_BILL_SQL) → DISTINCT order_id
 *   Active order_items on those orders (exclude cancelled / voided / void_adjustment)
 *
 * Metrics:
 *   quantity_sold       = SUM(quantity)
 *   merchandise_sales   = SUM(subtotal) — post item-discount, includes addon $, pre tax,
 *                         pre order-level discount (NOT app Gross Sales)
 *   item_discounts      = SUM(discount_amount) on those lines
 *   Category            = live products.category_id join (not snapshotted — documented caveat)
 *
 * Explicitly NOT included as product rows:
 *   order-level discount allocation, item-level refunds (refunds are bill-level only)
 */
import type Database from 'better-sqlite3';
import { utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { queryDaySalesSemantics, type DaySalesSemantics } from './day-sales-semantics';

/** Same settlement filter as day-sales-semantics / RPT-DISC (unqualified bills columns). */
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

export type ProductReportAttribution = {
  settlement: string;
  quantity_sold: string;
  merchandise_sales: string;
  item_discounts: string;
  category: string;
  refunds: string;
  order_discounts: string;
};

export const PRODUCT_REPORT_ATTRIBUTION: ProductReportAttribution = {
  settlement:
    'Settled bills (paid / partially_refunded / refunded / collectible-complete partial) in UTC bill.created_at window; DISTINCT order_id avoids split-bill double-count',
  quantity_sold: 'SUM(order_items.quantity) excluding cancelled / voided / void_adjustment',
  merchandise_sales:
    'SUM(order_items.subtotal) — post item-level discount, includes addons, pre tax, pre order-level discount (not app Gross Sales)',
  item_discounts: 'SUM(order_items.discount_amount) on active lines',
  category: 'Live products.category_id → categories.name (not snapshotted on order_items)',
  refunds: 'Bill-level only — not allocated to products; see sales.refunds context',
  order_discounts: 'bills.discount_amount — not allocated to products; see order_discounts_context',
};

export type ProductReportRow = {
  product_id: string;
  product_name: string;
  category_id: string | null;
  category_name: string;
  quantity_sold: number;
  merchandise_sales: number;
  item_discounts: number;
  order_count: number;
  share_of_merchandise: number;
};

export type ProductCategoryRow = {
  category_id: string | null;
  category_name: string;
  quantity_sold: number;
  merchandise_sales: number;
  item_discounts: number;
  product_count: number;
  share_of_merchandise: number;
};

export type ProductReport = {
  startDate: string;
  endDate: string;
  attribution: ProductReportAttribution;
  by_product: ProductReportRow[];
  by_category: ProductCategoryRow[];
  totals: {
    product_count: number;
    quantity_sold: number;
    merchandise_sales: number;
    item_discounts: number;
    order_discounts_context: number;
  };
  sales: DaySalesSemantics;
};

export const PRODUCTS_CSV_HEADERS = [
  'start_date',
  'end_date',
  'product_id',
  'product_name',
  'category_id',
  'category_name',
  'quantity_sold',
  'merchandise_sales',
  'item_discounts',
  'order_count',
  'share_of_merchandise',
] as const;

export type ProductsCsvHeader = (typeof PRODUCTS_CSV_HEADERS)[number];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundShare(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type QueryProductReportOptions = {
  categoryId?: string | null;
  productId?: string | null;
  /** Default sort: merchandise_sales desc */
  sort?: 'merchandise_sales' | 'quantity_sold' | 'product_name';
};

export function queryProductReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
  options: QueryProductReportOptions = {},
): ProductReport {
  const [windowStart, windowEnd] = [utcDayBounds(startDate)[0], utcDayBounds(endDate)[1]];
  const categoryFilter =
    typeof options.categoryId === 'string' && options.categoryId.trim()
      ? options.categoryId.trim()
      : null;
  const productFilter =
    typeof options.productId === 'string' && options.productId.trim()
      ? options.productId.trim()
      : null;
  const sort = options.sort || 'merchandise_sales';

  const params: Array<string | number> = [windowStart, windowEnd];
  let extraWhere = '';
  if (productFilter) {
    extraWhere += ' AND oi.product_id = ?';
    params.push(productFilter);
  }
  if (categoryFilter) {
    extraWhere += ' AND p.category_id = ?';
    params.push(categoryFilter);
  }

  const rows = db
    .prepare(
      `
    WITH settled_orders AS (
      SELECT DISTINCT order_id
      FROM bills
      WHERE created_at >= ? AND created_at < ?
        AND ${SETTLED_BILL_SQL}
    )
    SELECT
      oi.product_id AS product_id,
      MAX(oi.product_name) AS product_name,
      p.category_id AS category_id,
      COALESCE(c.name, 'Uncategorized') AS category_name,
      COALESCE(SUM(oi.quantity), 0) AS quantity_sold,
      COALESCE(SUM(COALESCE(oi.subtotal_cents, CAST(ROUND(COALESCE(oi.subtotal, 0) * 100) AS INTEGER))), 0) AS merchandise_cents,
      COALESCE(SUM(COALESCE(oi.discount_amount_cents, CAST(ROUND(COALESCE(oi.discount_amount, 0) * 100) AS INTEGER))), 0) AS discount_cents,
      COUNT(DISTINCT oi.order_id) AS order_count
    FROM order_items oi
    INNER JOIN settled_orders so ON so.order_id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE oi.status NOT IN ('cancelled', 'voided', 'void_adjustment')
      ${extraWhere}
    GROUP BY oi.product_id, p.category_id, c.name
  `,
    )
    .all(...params) as Array<{
    product_id: string;
    product_name: string;
    category_id: string | null;
    category_name: string;
    quantity_sold: number;
    merchandise_cents: number;
    discount_cents: number;
    order_count: number;
  }>;

  const merchandiseTotalCents = rows.reduce((s, r) => s + Number(r.merchandise_cents || 0), 0);

  let by_product: ProductReportRow[] = rows.map((r) => {
    const merchandise_sales = roundMoney(Number(r.merchandise_cents || 0) / 100);
    const item_discounts = roundMoney(Number(r.discount_cents || 0) / 100);
    const share =
      merchandiseTotalCents > 0
        ? roundShare(Number(r.merchandise_cents || 0) / merchandiseTotalCents)
        : 0;
    return {
      product_id: String(r.product_id),
      product_name: String(r.product_name || r.product_id),
      category_id: r.category_id == null ? null : String(r.category_id),
      category_name: String(r.category_name || 'Uncategorized'),
      quantity_sold: Number(r.quantity_sold || 0),
      merchandise_sales,
      item_discounts,
      order_count: Number(r.order_count || 0),
      share_of_merchandise: share,
    };
  });

  by_product.sort((a, b) => {
    if (sort === 'quantity_sold') {
      return b.quantity_sold - a.quantity_sold || a.product_name.localeCompare(b.product_name);
    }
    if (sort === 'product_name') {
      return a.product_name.localeCompare(b.product_name);
    }
    return (
      b.merchandise_sales - a.merchandise_sales ||
      b.quantity_sold - a.quantity_sold ||
      a.product_name.localeCompare(b.product_name)
    );
  });

  // Category rollup from product rows (same semantic scope → reconciliation)
  const catMap = new Map<
    string,
    {
      category_id: string | null;
      category_name: string;
      quantity_sold: number;
      merchandise_sales: number;
      item_discounts: number;
      product_count: number;
    }
  >();
  for (const p of by_product) {
    const key = p.category_id ?? '__uncategorized__';
    let acc = catMap.get(key);
    if (!acc) {
      acc = {
        category_id: p.category_id,
        category_name: p.category_name,
        quantity_sold: 0,
        merchandise_sales: 0,
        item_discounts: 0,
        product_count: 0,
      };
      catMap.set(key, acc);
    }
    acc.quantity_sold += p.quantity_sold;
    acc.merchandise_sales = roundMoney(acc.merchandise_sales + p.merchandise_sales);
    acc.item_discounts = roundMoney(acc.item_discounts + p.item_discounts);
    acc.product_count += 1;
  }

  const merchandiseTotal = roundMoney(merchandiseTotalCents / 100);
  const by_category: ProductCategoryRow[] = [...catMap.values()]
    .map((c) => ({
      ...c,
      share_of_merchandise:
        merchandiseTotal > 0 ? roundShare(c.merchandise_sales / merchandiseTotal) : 0,
    }))
    .sort(
      (a, b) =>
        b.merchandise_sales - a.merchandise_sales || a.category_name.localeCompare(b.category_name),
    );

  const orderDiscountsRow = db
    .prepare(
      `
    SELECT COALESCE(SUM(COALESCE(discount_amount_cents, CAST(ROUND(COALESCE(discount_amount, 0) * 100) AS INTEGER))), 0) AS cents
    FROM bills
    WHERE created_at >= ? AND created_at < ?
      AND ${SETTLED_BILL_SQL}
  `,
    )
    .get(windowStart, windowEnd) as { cents: number };

  const sales = queryDaySalesSemantics(db, windowStart, windowEnd);

  return {
    startDate,
    endDate,
    attribution: PRODUCT_REPORT_ATTRIBUTION,
    by_product,
    by_category,
    totals: {
      product_count: by_product.length,
      quantity_sold: by_product.reduce((s, r) => s + r.quantity_sold, 0),
      merchandise_sales: merchandiseTotal,
      item_discounts: roundMoney(by_product.reduce((s, r) => s + r.item_discounts, 0)),
      order_discounts_context: roundMoney(Number(orderDiscountsRow.cents || 0) / 100),
    },
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

export function productReportToCsv(report: ProductReport): string {
  const lines = [toCsvRow([...PRODUCTS_CSV_HEADERS])];
  for (const row of report.by_product) {
    const cells: Record<ProductsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      product_id: row.product_id,
      product_name: row.product_name,
      category_id: row.category_id ?? '',
      category_name: row.category_name,
      quantity_sold: row.quantity_sold,
      merchandise_sales: row.merchandise_sales,
      item_discounts: row.item_discounts,
      order_count: row.order_count,
      share_of_merchandise: row.share_of_merchandise,
    };
    lines.push(toCsvRow(PRODUCTS_CSV_HEADERS.map((h) => csvCell(cells[h]))));
  }
  if (report.by_product.length > 0) {
    const totals: Record<ProductsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      product_id: '__total__',
      product_name: '',
      category_id: '',
      category_name: '',
      quantity_sold: report.totals.quantity_sold,
      merchandise_sales: report.totals.merchandise_sales,
      item_discounts: report.totals.item_discounts,
      order_count: '',
      share_of_merchandise: 1,
    };
    lines.push(toCsvRow(PRODUCTS_CSV_HEADERS.map((h) => csvCell(totals[h]))));
  }
  return lines.join('\n') + '\n';
}
