/**
 * R9 Slice 5 — Ops finance period summary (compose existing sales + expenses).
 */
import { getDatabase, utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { queryDaySalesSemantics } from './day-sales-semantics';

export type OpsFinanceExpenseCategory = {
  category: string;
  amount_cents: number;
  count: number;
};

export type OpsFinanceReport = {
  startDate: string;
  endDate: string;
  sales: {
    grossSales: number;
    refunds: number;
    netSales: number;
  };
  expenses: {
    posted_total_cents: number;
    posted_count: number;
    by_category: OpsFinanceExpenseCategory[];
  };
  /** Net sales (major units) minus posted expenses (cents/100). Presentation only. */
  net_after_expenses: number;
};

export const EXPENSES_CSV_HEADERS = [
  'expense_date',
  'id',
  'category',
  'description',
  'amount_cents',
  'status',
] as const;

export function queryOpsFinanceReport(
  db: ReturnType<typeof getDatabase>,
  startDate: string,
  endDate: string,
): OpsFinanceReport {
  const windowStart = utcDayBounds(startDate)[0];
  const windowEnd = utcDayBounds(endDate)[1];
  const sales = queryDaySalesSemantics(db, windowStart, windowEnd);

  const byCategory = db
    .prepare(
      `
      SELECT category,
             COALESCE(SUM(amount_cents), 0) AS amount_cents,
             COUNT(*) AS count
      FROM expenses
      WHERE status = 'posted'
        AND expense_date >= ?
        AND expense_date <= ?
      GROUP BY category
      ORDER BY category ASC
    `,
    )
    .all(startDate, endDate) as Array<{ category: string; amount_cents: number; count: number }>;

  const posted_total_cents = byCategory.reduce(
    (sum, row) => sum + Number(row.amount_cents || 0),
    0,
  );
  const posted_count = byCategory.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const expensesMajor = posted_total_cents / 100;

  return {
    startDate,
    endDate,
    sales: {
      grossSales: sales.grossSales,
      refunds: sales.refunds,
      netSales: sales.netSales,
    },
    expenses: {
      posted_total_cents,
      posted_count,
      by_category: byCategory.map((row) => ({
        category: String(row.category),
        amount_cents: Number(row.amount_cents || 0),
        count: Number(row.count || 0),
      })),
    },
    net_after_expenses: Math.round((sales.netSales - expensesMajor) * 100) / 100,
  };
}

export function listPostedExpensesForCsv(
  db: ReturnType<typeof getDatabase>,
  startDate: string,
  endDate: string,
): Array<Record<string, unknown>> {
  return db
    .prepare(
      `
      SELECT id, expense_date, category, description, amount_cents, status
      FROM expenses
      WHERE status = 'posted'
        AND expense_date >= ?
        AND expense_date <= ?
      ORDER BY expense_date ASC, created_at ASC, id ASC
    `,
    )
    .all(startDate, endDate) as Array<Record<string, unknown>>;
}

export function expensesReportToCsv(
  startDate: string,
  endDate: string,
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [EXPENSES_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      toCsvRow([
        String(row.expense_date ?? startDate),
        String(row.id ?? ''),
        String(row.category ?? ''),
        String(row.description ?? ''),
        String(row.amount_cents ?? 0),
        String(row.status ?? 'posted'),
      ]),
    );
  }
  if (rows.length === 0) {
    // keep header-only export valid
  }
  void endDate;
  return `${lines.join('\n')}\n`;
}
