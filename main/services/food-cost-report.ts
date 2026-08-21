/**
 * R9 Slice 6 — theoretical food-cost period report from R5 consumption snapshots.
 * Actual-vs-theoretical BI remains Later / out of scope.
 * ROPS-FC-CSV — CSV export reuses the same query (no schema change).
 * ROPS-FC-ING — by-ingredient rollup from the same line snapshots (same COGS SoT).
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

export type FoodCostIngredientLine = {
  ingredient_product_id: string;
  ingredient_name: string;
  unit: string;
  /** Absolute quantity consumed (Σ |quantity_delta|). Snapshot unit. */
  quantity_consumed: number;
  /**
   * Implied unit cost from known-cost lines only:
   * round(Σ line_cost_cents / Σ |qty| where line_cost_cents IS NOT NULL).
   */
  effective_unit_cost_cents: number | null;
  /** Σ line_cost_cents where known; null costs contribute 0 (matches by_recipe SoT). */
  theoretical_cogs_cents: number;
  insufficient_line_count: number;
  /** Share of period theoretical_cogs_cents; null when period COGS is 0. */
  pct_of_cogs: number | null;
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
  by_ingredient: FoodCostIngredientLine[];
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

const FOOD_COST_INGREDIENT_CSV_HEADERS = [
  'start_date',
  'end_date',
  'ingredient_product_id',
  'ingredient_name',
  'unit',
  'quantity_consumed',
  'effective_unit_cost_cents',
  'theoretical_cogs_cents',
  'insufficient_line_count',
  'pct_of_cogs',
  'period_theoretical_cogs_cents',
] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function pctOfCogs(partCents: number, totalCents: number): number | null {
  if (!(totalCents > 0)) return null;
  return Math.round((partCents / totalCents) * 10000) / 100;
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

  const byIngredientRaw = db
    .prepare(
      `
      SELECT
        l.ingredient_product_id AS ingredient_product_id,
        COALESCE(
          NULLIF(TRIM(MAX(l.ingredient_name)), ''),
          l.ingredient_product_id
        ) AS ingredient_name,
        l.unit AS unit,
        COALESCE(SUM(ABS(l.quantity_delta)), 0) AS quantity_consumed,
        COALESCE(SUM(CASE WHEN l.line_cost_cents IS NOT NULL THEN l.line_cost_cents ELSE 0 END), 0)
          AS theoretical_cogs_cents,
        COALESCE(
          SUM(CASE WHEN l.line_cost_cents IS NOT NULL THEN ABS(l.quantity_delta) ELSE 0 END),
          0
        ) AS known_cost_qty,
        COALESCE(SUM(CASE WHEN l.line_cost_cents IS NULL THEN 1 ELSE 0 END), 0)
          AS insufficient_line_count
      FROM recipe_consumptions c
      INNER JOIN recipe_consumption_lines l ON l.consumption_id = c.id
      WHERE c.status = 'consumed'
        AND c.created_at >= ?
        AND c.created_at < ?
      GROUP BY l.ingredient_product_id, l.unit
      ORDER BY theoretical_cogs_cents DESC, ingredient_name ASC
    `,
    )
    .all(windowStart, windowEnd) as Array<{
    ingredient_product_id: string;
    ingredient_name: string;
    unit: string;
    quantity_consumed: number;
    theoretical_cogs_cents: number;
    known_cost_qty: number;
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

  const by_ingredient: FoodCostIngredientLine[] = byIngredientRaw.map((row) => {
    const cogs = Number(row.theoretical_cogs_cents || 0);
    const knownQty = Number(row.known_cost_qty || 0);
    const rawQty = Number(row.quantity_consumed || 0);
    // Quantity is REAL; round to 6 dp to avoid IEEE noise while preserving millilitre/gram precision.
    const quantity_consumed = Math.round(rawQty * 1e6) / 1e6;
    const knownQtyRounded = Math.round(knownQty * 1e6) / 1e6;
    const effective_unit_cost_cents =
      knownQtyRounded > 0 ? Math.round(cogs / knownQtyRounded) : null;
    return {
      ingredient_product_id: String(row.ingredient_product_id),
      ingredient_name: String(row.ingredient_name),
      unit: String(row.unit),
      quantity_consumed,
      effective_unit_cost_cents,
      theoretical_cogs_cents: cogs,
      insufficient_line_count: Number(row.insufficient_line_count || 0),
      pct_of_cogs: pctOfCogs(cogs, theoretical_cogs_cents),
    };
  });

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
    by_ingredient,
  };
}

/** Deterministic CSV: recipe section (unchanged headers) then blank line + ingredient section. */
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

  lines.push('');
  lines.push(toCsvRow([...FOOD_COST_INGREDIENT_CSV_HEADERS]));
  if (report.by_ingredient.length === 0) {
    lines.push(
      toCsvRow(
        FOOD_COST_INGREDIENT_CSV_HEADERS.map((h) =>
          csvCell(
            (
              {
                start_date: report.startDate,
                end_date: report.endDate,
                ingredient_product_id: '',
                ingredient_name: '',
                unit: '',
                quantity_consumed: 0,
                effective_unit_cost_cents: null,
                theoretical_cogs_cents: 0,
                insufficient_line_count: 0,
                pct_of_cogs: null,
                period_theoretical_cogs_cents: report.theoretical_cogs_cents,
              } as Record<(typeof FOOD_COST_INGREDIENT_CSV_HEADERS)[number], string | number | null>
            )[h],
          ),
        ),
      ),
    );
  } else {
    for (const row of report.by_ingredient) {
      const cells: Record<
        (typeof FOOD_COST_INGREDIENT_CSV_HEADERS)[number],
        string | number | null
      > = {
        start_date: report.startDate,
        end_date: report.endDate,
        ingredient_product_id: row.ingredient_product_id,
        ingredient_name: row.ingredient_name,
        unit: row.unit,
        quantity_consumed: row.quantity_consumed,
        effective_unit_cost_cents: row.effective_unit_cost_cents,
        theoretical_cogs_cents: row.theoretical_cogs_cents,
        insufficient_line_count: row.insufficient_line_count,
        pct_of_cogs: row.pct_of_cogs,
        period_theoretical_cogs_cents: report.theoretical_cogs_cents,
      };
      lines.push(toCsvRow(FOOD_COST_INGREDIENT_CSV_HEADERS.map((h) => csvCell(cells[h]))));
    }
  }
  return `${lines.join('\n')}\n`;
}
