/**
 * R9 Slice 6 — theoretical food-cost period report from R5 consumption snapshots.
 * Actual-vs-theoretical BI remains Later / out of scope.
 * ROPS-FC-CSV — CSV export reuses the same query (no schema change).
 */
import { getDatabase, utcDayBounds } from '../db';
import { toCsvRow } from '../lib/csv';
import { queryDaySalesSemantics } from './day-sales-semantics';

export type FoodCostRecipeLine = {
  recipe_id: string;
  recipe_name: string;
  menu_product_id: string;
  consumption_count: number;
  theoretical_cogs_cents: number;
  insufficient_line_count: number;
};

export type FoodCostReport = {
  startDate: string;
  endDate: string;
  net_sales: number;
  theoretical_cogs_cents: number;
  food_cost_percent: number | null;
  insufficient_line_count: number;
  consumption_count: number;
  by_recipe: FoodCostRecipeLine[];
};

const FOOD_COST_CSV_HEADERS = [
  'start_date',
  'end_date',
  'recipe_id',
  'recipe_name',
  'menu_product_id',
  'consumption_count',
  'theoretical_cogs_cents',
  'insufficient_line_count',
  'net_sales',
  'period_theoretical_cogs_cents',
  'food_cost_percent',
] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function queryFoodCostReport(
  db: ReturnType<typeof getDatabase>,
  startDate: string,
  endDate: string,
): FoodCostReport {
  const windowStart = utcDayBounds(startDate)[0];
  const windowEnd = utcDayBounds(endDate)[1];
  const sales = queryDaySalesSemantics(db, windowStart, windowEnd);

  const byRecipe = db
    .prepare(
      `
      SELECT
        c.recipe_id AS recipe_id,
        c.recipe_name AS recipe_name,
        c.menu_product_id AS menu_product_id,
        COUNT(DISTINCT c.id) AS consumption_count,
        COALESCE(SUM(CASE WHEN l.line_cost_cents IS NOT NULL THEN l.line_cost_cents ELSE 0 END), 0)
          AS theoretical_cogs_cents,
        COALESCE(SUM(CASE WHEN l.line_cost_cents IS NULL THEN 1 ELSE 0 END), 0)
          AS insufficient_line_count
      FROM recipe_consumptions c
      LEFT JOIN recipe_consumption_lines l ON l.consumption_id = c.id
      WHERE c.status = 'consumed'
        AND c.created_at >= ?
        AND c.created_at < ?
      GROUP BY c.recipe_id, c.recipe_name, c.menu_product_id
      ORDER BY theoretical_cogs_cents DESC, c.recipe_name ASC
    `,
    )
    .all(windowStart, windowEnd) as Array<{
    recipe_id: string;
    recipe_name: string;
    menu_product_id: string;
    consumption_count: number;
    theoretical_cogs_cents: number;
    insufficient_line_count: number;
  }>;

  const theoretical_cogs_cents = byRecipe.reduce(
    (sum, row) => sum + Number(row.theoretical_cogs_cents || 0),
    0,
  );
  const insufficient_line_count = byRecipe.reduce(
    (sum, row) => sum + Number(row.insufficient_line_count || 0),
    0,
  );
  const consumption_count = byRecipe.reduce(
    (sum, row) => sum + Number(row.consumption_count || 0),
    0,
  );

  const cogsMajor = theoretical_cogs_cents / 100;
  const food_cost_percent =
    sales.netSales > 0 ? Math.round((cogsMajor / sales.netSales) * 10000) / 100 : null;

  return {
    startDate,
    endDate,
    net_sales: sales.netSales,
    theoretical_cogs_cents,
    food_cost_percent,
    insufficient_line_count,
    consumption_count,
    by_recipe: byRecipe.map((row) => ({
      recipe_id: String(row.recipe_id),
      recipe_name: String(row.recipe_name),
      menu_product_id: String(row.menu_product_id),
      consumption_count: Number(row.consumption_count || 0),
      theoretical_cogs_cents: Number(row.theoretical_cogs_cents || 0),
      insufficient_line_count: Number(row.insufficient_line_count || 0),
    })),
  };
}

/** Deterministic CSV from an already-built food-cost report (same rollup as JSON). */
export function foodCostReportToCsv(report: FoodCostReport): string {
  const lines = [toCsvRow([...FOOD_COST_CSV_HEADERS])];
  if (report.by_recipe.length === 0) {
    lines.push(
      toCsvRow(
        FOOD_COST_CSV_HEADERS.map((h) =>
          csvCell(
            (
              {
                start_date: report.startDate,
                end_date: report.endDate,
                recipe_id: '',
                recipe_name: '',
                menu_product_id: '',
                consumption_count: 0,
                theoretical_cogs_cents: 0,
                insufficient_line_count: report.insufficient_line_count,
                net_sales: report.net_sales,
                period_theoretical_cogs_cents: report.theoretical_cogs_cents,
                food_cost_percent: report.food_cost_percent,
              } as Record<(typeof FOOD_COST_CSV_HEADERS)[number], string | number | null>
            )[h],
          ),
        ),
      ),
    );
  } else {
    for (const row of report.by_recipe) {
      const cells: Record<(typeof FOOD_COST_CSV_HEADERS)[number], string | number | null> = {
        start_date: report.startDate,
        end_date: report.endDate,
        recipe_id: row.recipe_id,
        recipe_name: row.recipe_name,
        menu_product_id: row.menu_product_id,
        consumption_count: row.consumption_count,
        theoretical_cogs_cents: row.theoretical_cogs_cents,
        insufficient_line_count: row.insufficient_line_count,
        net_sales: report.net_sales,
        period_theoretical_cogs_cents: report.theoretical_cogs_cents,
        food_cost_percent: report.food_cost_percent,
      };
      lines.push(toCsvRow(FOOD_COST_CSV_HEADERS.map((h) => csvCell(cells[h]))));
    }
  }
  return `${lines.join('\n')}\n`;
}
