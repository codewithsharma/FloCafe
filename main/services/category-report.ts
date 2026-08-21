/**
 * RPT-CATEGORY — Category performance report (no schema change).
 *
 * Thin projection of P11 Product Performance (`queryProductReport`).
 * Does NOT duplicate settlement SQL — category rows === product.by_category.
 *
 * Category attribution uses the current product → category relationship;
 * category history is not snapshotted.
 *
 * Refunds are not allocated to categories (bill-level only; see sales.refunds).
 */
import type Database from 'better-sqlite3';
import { toCsvRow } from '../lib/csv';
import {
  PRODUCT_REPORT_ATTRIBUTION,
  type ProductCategoryRow,
  type ProductReportAttribution,
  queryProductReport,
  type QueryProductReportOptions,
} from './product-report';
import type { DaySalesSemantics } from './day-sales-semantics';

export type CategoryReportRow = ProductCategoryRow;

export type CategoryReport = {
  startDate: string;
  endDate: string;
  attribution: ProductReportAttribution;
  by_category: CategoryReportRow[];
  totals: {
    category_count: number;
    quantity_sold: number;
    merchandise_sales: number;
    item_discounts: number;
    order_discounts_context: number;
  };
  sales: DaySalesSemantics;
};

export const CATEGORIES_CSV_HEADERS = [
  'start_date',
  'end_date',
  'category_id',
  'category_name',
  'quantity_sold',
  'merchandise_sales',
  'item_discounts',
  'product_count',
  'share_of_merchandise',
] as const;

export type CategoriesCsvHeader = (typeof CATEGORIES_CSV_HEADERS)[number];

export type QueryCategoryReportOptions = Pick<QueryProductReportOptions, 'categoryId' | 'sort'>;

export function queryCategoryReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
  options: QueryCategoryReportOptions = {},
): CategoryReport {
  const product = queryProductReport(db, startDate, endDate, {
    categoryId: options.categoryId,
    sort:
      options.sort === 'quantity_sold' || options.sort === 'merchandise_sales'
        ? options.sort
        : 'merchandise_sales',
  });

  return {
    startDate: product.startDate,
    endDate: product.endDate,
    attribution: PRODUCT_REPORT_ATTRIBUTION,
    by_category: product.by_category,
    totals: {
      category_count: product.by_category.length,
      quantity_sold: product.totals.quantity_sold,
      merchandise_sales: product.totals.merchandise_sales,
      item_discounts: product.totals.item_discounts,
      order_discounts_context: product.totals.order_discounts_context,
    },
    sales: product.sales,
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function categoryReportToCsv(report: CategoryReport): string {
  const lines = [toCsvRow([...CATEGORIES_CSV_HEADERS])];
  for (const row of report.by_category) {
    const cells: Record<CategoriesCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      category_id: row.category_id ?? '',
      category_name: row.category_name,
      quantity_sold: row.quantity_sold,
      merchandise_sales: row.merchandise_sales,
      item_discounts: row.item_discounts,
      product_count: row.product_count,
      share_of_merchandise: row.share_of_merchandise,
    };
    lines.push(toCsvRow(CATEGORIES_CSV_HEADERS.map((h) => csvCell(cells[h]))));
  }
  if (report.by_category.length > 0) {
    const totals: Record<CategoriesCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      category_id: '__total__',
      category_name: '',
      quantity_sold: report.totals.quantity_sold,
      merchandise_sales: report.totals.merchandise_sales,
      item_discounts: report.totals.item_discounts,
      product_count: '',
      share_of_merchandise: 1,
    };
    lines.push(toCsvRow(CATEGORIES_CSV_HEADERS.map((h) => csvCell(totals[h]))));
  }
  return lines.join('\n') + '\n';
}
