/**
 * R9 Slice 3 — shared tax-components report (JSON + CSV).
 * Reuses aggregateTaxComponents; does not recalculate tax.
 */
import type Database from 'better-sqlite3';
import Decimal from 'decimal.js';
import { parseItemJson, utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { aggregateTaxComponents, type DisplayTaxComponent } from './tax-components';

export const TAX_COMPONENTS_CSV_HEADERS = [
  'start_date',
  'end_date',
  'bill_count',
  'report_tax_amount',
  'component_title',
  'rate',
  'tax_amount',
] as const;

export type TaxComponentsCsvHeader = (typeof TAX_COMPONENTS_CSV_HEADERS)[number];

export type TaxComponentsReport = {
  startDate: string;
  endDate: string;
  billCount: number;
  taxAmount: number;
  components: DisplayTaxComponent[];
};

export function queryTaxComponentsReport(
  db: Database.Database,
  startDate: string,
  endDate: string,
): TaxComponentsReport {
  const windowStart = utcDayBounds(startDate)[0];
  const windowEnd = utcDayBounds(endDate)[1];

  const bills = db
    .prepare(
      `
      SELECT b.*
      FROM bills b
      JOIN orders o ON o.id = b.order_id
      WHERE b.created_at >= ? AND b.created_at < ?
        AND o.status != 'cancelled'
      ORDER BY b.created_at, b.id
    `,
    )
    .all(windowStart, windowEnd) as Array<Record<string, unknown>>;

  const itemsByOrder = new Map<number, Array<Record<string, unknown>>>();
  if (bills.length > 0) {
    const orderIds = Array.from(new Set(bills.map((bill) => Number(bill.order_id))));
    const placeholders = orderIds.map(() => '?').join(',');
    const items = db
      .prepare(
        `
        SELECT * FROM order_items
        WHERE order_id IN (${placeholders})
        ORDER BY order_id, id
      `,
      )
      .all(...orderIds)
      .map(parseItemJson) as Array<Record<string, unknown>>;
    for (const item of items) {
      const list = itemsByOrder.get(Number(item.order_id)) || [];
      list.push(item);
      itemsByOrder.set(Number(item.order_id), list);
    }
  }

  const documents = bills.map((bill) => ({
    tax_amount: bill.tax_amount,
    tax_snapshot: bill.tax_snapshot,
    tax_breakdown: bill.tax_breakdown,
    items: itemsByOrder.get(Number(bill.order_id)) || [],
  }));

  const taxAmount = bills.reduce((sum, bill) => {
    const raw = bill.tax_amount;
    const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : 0;
    return sum.plus(Number.isFinite(n) ? n : 0);
  }, new Decimal(0));

  return {
    startDate,
    endDate,
    billCount: bills.length,
    taxAmount: taxAmount.toDecimalPlaces(6).toNumber(),
    components: aggregateTaxComponents(documents),
  };
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Deterministic CSV from an already-built report (same totals as JSON). */
export function taxComponentsReportToCsv(report: TaxComponentsReport): string {
  const lines = [toCsvRow([...TAX_COMPONENTS_CSV_HEADERS])];
  for (const component of report.components) {
    const row: Record<TaxComponentsCsvHeader, string | number> = {
      start_date: report.startDate,
      end_date: report.endDate,
      bill_count: report.billCount,
      report_tax_amount: report.taxAmount,
      component_title: component.title,
      rate: component.rate === null ? '' : component.rate,
      tax_amount: component.amount,
    };
    lines.push(toCsvRow(TAX_COMPONENTS_CSV_HEADERS.map((h) => csvCell(row[h]))));
  }
  return lines.join('\n') + '\n';
}
