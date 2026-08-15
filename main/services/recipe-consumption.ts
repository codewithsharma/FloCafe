/**
 * R5 — recipe ingredient consumption / reversal against Inventory ledger.
 * Idempotent per order_item_id. Snapshots qty/cost for historical integrity.
 */

import { randomUUID } from 'crypto';
import { getDatabase, now } from '../db';
import {
  applyRecipeStockDelta,
  InventoryServiceError,
  type StockTrackedProduct,
} from './inventory';
import { logAuditEvent } from './audit-log';
import {
  getActiveRecipeForProduct,
  listRecipeIngredients,
  type RecipeIngredientRow,
  type RecipeRow,
} from './recipe';
import { portionConsumeQty, toCostCents } from './recipe-cost';

export interface RecipeConsumptionRow {
  id: string;
  order_id: string;
  order_item_id: number;
  recipe_id: string;
  recipe_name: string;
  menu_product_id: string;
  portions: number;
  yield_qty: number;
  status: 'consumed' | 'reversed';
  actor_user_id: string | null;
  created_at: string;
  reversed_at: string | null;
}

export interface RecipeConsumptionLineRow {
  id: number;
  consumption_id: string;
  ingredient_product_id: string;
  ingredient_name: string | null;
  quantity_delta: number;
  unit: string;
  unit_cost_cents: number | null;
  line_cost_cents: number | null;
  inventory_movement_id: number | null;
  created_at: string;
}

export interface ConsumeRecipeResult {
  consumed: boolean;
  consumption: RecipeConsumptionRow | null;
  skippedReason?: 'no_recipe' | 'already_consumed';
}

function newConsumptionId(): string {
  return `rc-${randomUUID().slice(0, 8)}`;
}

function loadConsumptionByOrderItem(db: any, orderItemId: number): RecipeConsumptionRow | null {
  return (
    (db
      .prepare('SELECT * FROM recipe_consumptions WHERE order_item_id = ?')
      .get(Number(orderItemId)) as RecipeConsumptionRow | undefined) ?? null
  );
}

function loadIngredientProduct(
  db: any,
  productId: string,
): StockTrackedProduct & {
  cost: number;
  inventory_unit: string;
  name: string;
} {
  const row = db
    .prepare(
      `SELECT id, name, track_inventory, stock_quantity, cost,
              COALESCE(inventory_unit, 'pcs') AS inventory_unit
       FROM products WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(productId) as
    (StockTrackedProduct & { cost: number; inventory_unit: string; name: string }) | undefined;
  if (!row) {
    throw new InventoryServiceError(404, `Ingredient product not found: ${productId}`);
  }
  return row;
}

/**
 * Consume ingredients for one order line. Idempotent on order_item_id.
 * Callers MUST be inside the same withTxn as order item insert / stock sale.
 */
export function consumeRecipeForOrderItem(
  db: any,
  args: {
    orderId: string;
    orderItemId: number;
    menuProductId: string;
    portions: number;
    actorUserId?: string | null;
  },
): ConsumeRecipeResult {
  const existing = loadConsumptionByOrderItem(db, args.orderItemId);
  if (existing) {
    return { consumed: false, consumption: existing, skippedReason: 'already_consumed' };
  }

  const recipe = getActiveRecipeForProduct(args.menuProductId, db);
  if (!recipe) {
    return { consumed: false, consumption: null, skippedReason: 'no_recipe' };
  }

  const ingredients = listRecipeIngredients(recipe.id, db);
  if (ingredients.length === 0) {
    return { consumed: false, consumption: null, skippedReason: 'no_recipe' };
  }

  const ts = now();
  const consumptionId = newConsumptionId();
  db.prepare(
    `INSERT INTO recipe_consumptions (
      id, order_id, order_item_id, recipe_id, recipe_name, menu_product_id,
      portions, yield_qty, status, actor_user_id, created_at, reversed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'consumed', ?, ?, NULL)`,
  ).run(
    consumptionId,
    String(args.orderId),
    Number(args.orderItemId),
    recipe.id,
    recipe.name,
    String(args.menuProductId),
    args.portions,
    recipe.yield_qty,
    args.actorUserId ?? null,
    ts,
  );

  const lineStmt = db.prepare(
    `INSERT INTO recipe_consumption_lines (
      consumption_id, ingredient_product_id, ingredient_name, quantity_delta, unit,
      unit_cost_cents, line_cost_cents, inventory_movement_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const ing of ingredients) {
    writeConsumeLine(db, {
      ing,
      recipe,
      portions: args.portions,
      orderItemId: args.orderItemId,
      consumptionId,
      lineStmt,
      ts,
    });
  }

  logAuditEvent({
    actorUserId: args.actorUserId ?? null,
    action: 'inventory.recipe_consumed',
    entityType: 'recipe_consumption',
    entityId: consumptionId,
    result: 'success',
    metadata: {
      order_id: args.orderId,
      order_item_id: args.orderItemId,
      recipe_id: recipe.id,
      portions: args.portions,
    },
  });

  const consumption = loadConsumptionByOrderItem(db, args.orderItemId);
  return { consumed: true, consumption };
}

function writeConsumeLine(
  db: any,
  ctx: {
    ing: RecipeIngredientRow;
    recipe: RecipeRow;
    portions: number;
    orderItemId: number;
    consumptionId: string;
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

  const { movementId } = applyRecipeStockDelta(db, product, -qty, ctx.ts, {
    referenceType: 'order_item',
    referenceId: ctx.orderItemId,
    reason: 'recipe_consumption',
  });

  const unitCostCents =
    product.cost_cents != null && Number.isFinite(Number(product.cost_cents))
      ? Math.trunc(Number(product.cost_cents))
      : toCostCents(product.cost);
  const lineCostCents = unitCostCents === null ? null : Math.round(Math.abs(qty) * unitCostCents);

  ctx.lineStmt.run(
    ctx.consumptionId,
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
 * Reverse all consumed (not already reversed) recipe consumptions for an order.
 * Matches full-order cancel / last-item collapse SKU restore semantics.
 */
export function reverseRecipeConsumptionForOrder(
  db: any,
  args: { orderId: string; actorUserId?: string | null; reason?: string },
): number {
  const orderKey = String(args.orderId);
  const rows = db
    .prepare(
      `SELECT * FROM recipe_consumptions
       WHERE status = 'consumed'
         AND CAST(order_id AS TEXT) = ?`,
    )
    .all(orderKey) as RecipeConsumptionRow[];
  let reversed = 0;
  for (const row of rows) {
    if (reverseOne(db, row, args.actorUserId ?? null, args.reason ?? 'order_cancelled')) {
      reversed += 1;
    }
  }
  return reversed;
}

export function reverseRecipeConsumptionForOrderItem(
  db: any,
  args: { orderItemId: number; actorUserId?: string | null; reason?: string },
): boolean {
  const row = loadConsumptionByOrderItem(db, args.orderItemId);
  if (!row || row.status === 'reversed') return false;
  return reverseOne(db, row, args.actorUserId ?? null, args.reason ?? 'item_cancelled');
}

function reverseOne(
  db: any,
  consumption: RecipeConsumptionRow,
  actorUserId: string | null,
  reason: string,
): boolean {
  if (consumption.status === 'reversed') return false;

  const lines = db
    .prepare('SELECT * FROM recipe_consumption_lines WHERE consumption_id = ?')
    .all(consumption.id) as RecipeConsumptionLineRow[];
  const ts = now();

  for (const line of lines) {
    const restoreQty = Math.abs(Number(line.quantity_delta));
    if (!(restoreQty > 0)) continue;
    const product = loadIngredientProduct(db, line.ingredient_product_id);
    applyRecipeStockDelta(db, product, restoreQty, ts, {
      referenceType: 'order_item',
      referenceId: consumption.order_item_id,
      reason: 'recipe_restore',
    });
  }

  db.prepare(
    `UPDATE recipe_consumptions SET status = 'reversed', reversed_at = ? WHERE id = ? AND status = 'consumed'`,
  ).run(ts, consumption.id);

  logAuditEvent({
    actorUserId,
    action: 'inventory.recipe_restored',
    entityType: 'recipe_consumption',
    entityId: consumption.id,
    result: 'success',
    metadata: {
      order_id: consumption.order_id,
      order_item_id: consumption.order_item_id,
      reason,
    },
  });
  return true;
}

export function listConsumptions(opts: {
  orderId?: string;
  limit?: number;
}): Array<RecipeConsumptionRow & { lines?: RecipeConsumptionLineRow[] }> {
  const db = getDatabase();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let rows: RecipeConsumptionRow[];
  if (opts.orderId) {
    rows = db
      .prepare(
        `SELECT * FROM recipe_consumptions
         WHERE CAST(order_id AS TEXT) = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(String(opts.orderId), limit) as RecipeConsumptionRow[];
  } else {
    rows = db
      .prepare(`SELECT * FROM recipe_consumptions ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as RecipeConsumptionRow[];
  }
  return rows.map((row) => ({
    ...row,
    lines: db
      .prepare('SELECT * FROM recipe_consumption_lines WHERE consumption_id = ?')
      .all(row.id) as RecipeConsumptionLineRow[],
  }));
}
