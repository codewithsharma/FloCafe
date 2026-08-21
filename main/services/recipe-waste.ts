/**
 * ADR-015 / ROPS-RWASTE v1 — recipe-linked waste (portions of an active recipe).
 * Does not touch recipe_consumptions / food-cost sale SoT.
 */

import { createHash, randomUUID } from 'crypto';
import { getDatabase, now, withTxn } from '../db';
import { logAuditEvent } from './audit-log';
import { applyRecipeStockDelta, type StockTrackedProduct } from './inventory';
import { WASTAGE_REASONS, type WastageReason } from './inventory-units';
import { preferProductCostCents, portionConsumeQty } from './recipe-cost';
import {
  getRecipe,
  listRecipeIngredients,
  type RecipeIngredientRow,
  type RecipeRow,
} from './recipe';

export class RecipeWasteServiceError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'RecipeWasteServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type RecipeWasteEventRow = {
  id: string;
  recipe_id: string;
  recipe_name: string;
  menu_product_id: string;
  portions: number;
  yield_qty: number;
  wastage_reason: string;
  actor_user_id: string | null;
  notes: string | null;
  created_at: string;
};

export type RecipeWasteLineRow = {
  id: number;
  waste_event_id: string;
  ingredient_product_id: string;
  ingredient_name: string | null;
  quantity_delta: number;
  unit: string;
  unit_cost_cents: number | null;
  line_cost_cents: number | null;
  inventory_movement_id: number | null;
  created_at: string;
};

type IngredientProduct = StockTrackedProduct & {
  cost: number;
  cost_cents?: number | null;
  inventory_unit: string;
  name: string;
};

function newWasteId(): string {
  return `rw-${randomUUID().slice(0, 8)}`;
}

export function recipeWasteRequestHash(
  recipeId: string,
  body: { portions: number; wastage_reason: string; notes?: string | null },
): string {
  const canonical = JSON.stringify({
    recipe_id: recipeId,
    portions: body.portions,
    wastage_reason: body.wastage_reason,
    notes: body.notes ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function loadIngredientProduct(db: any, productId: string): IngredientProduct {
  const row = db
    .prepare(
      `SELECT id, name, track_inventory, stock_quantity, cost, cost_cents,
              COALESCE(inventory_unit, 'pcs') AS inventory_unit
       FROM products WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(productId) as IngredientProduct | undefined;
  if (!row) {
    throw new RecipeWasteServiceError(404, `Ingredient product not found: ${productId}`);
  }
  return row;
}

function loadWasteEvent(
  db: any,
  id: string,
): { waste_event: RecipeWasteEventRow; lines: RecipeWasteLineRow[] } {
  const waste_event = db.prepare('SELECT * FROM recipe_waste_events WHERE id = ?').get(id) as
    RecipeWasteEventRow | undefined;
  if (!waste_event) {
    throw new RecipeWasteServiceError(404, 'Waste event not found');
  }
  const lines = db
    .prepare(`SELECT * FROM recipe_waste_lines WHERE waste_event_id = ? ORDER BY id ASC`)
    .all(id) as RecipeWasteLineRow[];
  return { waste_event, lines };
}

function writeWasteLine(
  db: any,
  ctx: {
    ing: RecipeIngredientRow;
    recipe: RecipeRow;
    portions: number;
    wasteEventId: string;
    wastageReason: WastageReason;
    lineStmt: { run: (...args: unknown[]) => unknown };
    ts: string;
  },
): void {
  const product = loadIngredientProduct(db, ctx.ing.ingredient_product_id);
  const qty = portionConsumeQty(
    Number(ctx.ing.quantity),
    ctx.ing.unit,
    Number(ctx.ing.prep_loss_bps) || 0,
    product.inventory_unit,
    Number(ctx.recipe.yield_qty),
    ctx.portions,
  );
  if (!(qty > 0)) return;

  const reason = `recipe_waste:${ctx.wastageReason}`;
  const { movementId } = applyRecipeStockDelta(db, product, -qty, ctx.ts, {
    referenceType: 'recipe_waste',
    referenceId: ctx.wasteEventId,
    reason,
  });

  const unitCostCents = preferProductCostCents(product.cost_cents, product.cost);
  const lineCostCents = unitCostCents === null ? null : Math.round(Math.abs(qty) * unitCostCents);

  ctx.lineStmt.run(
    ctx.wasteEventId,
    ctx.ing.ingredient_product_id,
    product.name,
    -qty,
    product.inventory_unit,
    unitCostCents,
    lineCostCents,
    movementId,
    ctx.ts,
  );
}

/**
 * Waste N portions of an active recipe. Callers should wrap via withTxn at the route
 * when combining with idempotency; this function itself uses withTxn for atomicity
 * when invoked alone.
 */
export function wasteRecipePortions(
  args: {
    recipeId: string;
    portions: number;
    wastageReason: WastageReason;
    notes?: string | null;
    actorUserId: string | null;
  },
  opts?: { db?: any; alreadyInTxn?: boolean },
): { waste_event: RecipeWasteEventRow; lines: RecipeWasteLineRow[] } {
  const run = (): { waste_event: RecipeWasteEventRow; lines: RecipeWasteLineRow[] } => {
    const db = opts?.db ?? getDatabase();
    const recipe = getRecipe(args.recipeId);
    if (!Number(recipe.is_active)) {
      throw new RecipeWasteServiceError(
        409,
        'Only active recipes can be wasted',
        'RECIPE_WASTE_INACTIVE',
      );
    }
    if (!(Number.isFinite(args.portions) && args.portions > 0)) {
      throw new RecipeWasteServiceError(400, 'portions must be a positive number');
    }
    if (!(WASTAGE_REASONS as readonly string[]).includes(args.wastageReason)) {
      throw new RecipeWasteServiceError(400, 'Invalid wastage_reason');
    }

    const ingredients = listRecipeIngredients(recipe.id, db);
    if (ingredients.length === 0) {
      throw new RecipeWasteServiceError(400, 'Recipe has no ingredients to waste');
    }

    const ts = now();
    const wasteEventId = newWasteId();

    db.prepare(
      `INSERT INTO recipe_waste_events (
        id, recipe_id, recipe_name, menu_product_id, portions, yield_qty,
        wastage_reason, actor_user_id, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      wasteEventId,
      recipe.id,
      recipe.name,
      recipe.product_id,
      args.portions,
      recipe.yield_qty,
      args.wastageReason,
      args.actorUserId,
      args.notes ?? null,
      ts,
    );

    const lineStmt = db.prepare(
      `INSERT INTO recipe_waste_lines (
        waste_event_id, ingredient_product_id, ingredient_name, quantity_delta, unit,
        unit_cost_cents, line_cost_cents, inventory_movement_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const ing of ingredients) {
      writeWasteLine(db, {
        ing,
        recipe,
        portions: args.portions,
        wasteEventId,
        wastageReason: args.wastageReason,
        lineStmt,
        ts,
      });
    }

    const result = loadWasteEvent(db, wasteEventId);
    const wasteCogsCents = result.lines.reduce(
      (s, l) => s + (l.line_cost_cents === null ? 0 : Number(l.line_cost_cents)),
      0,
    );

    logAuditEvent({
      actorUserId: args.actorUserId ?? null,
      action: 'inventory.recipe_wasted',
      entityType: 'recipe_waste',
      entityId: wasteEventId,
      result: 'success',
      metadata: {
        waste_event_id: wasteEventId,
        recipe_id: recipe.id,
        menu_product_id: recipe.product_id,
        portions: args.portions,
        wastage_reason: args.wastageReason,
        line_count: result.lines.length,
        waste_cogs_cents: wasteCogsCents,
      },
    });

    return result;
  };

  if (opts?.alreadyInTxn) {
    return run();
  }
  return withTxn(run);
}

// Re-export for route mapError convenience — keep Inventory/Recipe errors local to their modules
