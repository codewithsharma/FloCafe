/**
 * R5 — Recipe / BOM domain (definitions only).
 * Inventory stock mutations live in recipe-consumption.ts via Inventory helpers.
 */

import { randomUUID } from 'crypto';
import { getDatabase, now, withTxn } from '../db';
import { logAuditEvent } from './audit-log';
import {
  ALLOWED_INVENTORY_UNITS,
  isAllowedInventoryUnit,
  type InventoryUnit,
} from './inventory-units';
import {
  computeRecipeCost,
  preferProductCostCents,
  toPriceCents,
  type RecipeCostResult,
} from './recipe-cost';

export class RecipeServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'RecipeServiceError';
    this.statusCode = statusCode;
  }
}

export interface RecipeRow {
  id: string;
  product_id: string;
  name: string;
  yield_qty: number;
  yield_unit: string;
  is_active: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  ingredient_product_id: string;
  quantity: number;
  unit: string;
  prep_loss_bps: number;
  position: number;
  created_at: string;
  ingredient_name?: string;
  ingredient_cost?: number | null;
  ingredient_cost_cents?: number | null;
  inventory_unit?: string;
  is_active?: number;
}

export interface RecipeIngredientInput {
  ingredient_product_id: string;
  quantity: number;
  unit: string;
  prep_loss_bps?: number;
  position?: number;
}

function newRecipeId(): string {
  return `rcp-${randomUUID().slice(0, 8)}`;
}

function newIngredientId(): string {
  return `ri-${randomUUID().slice(0, 8)}`;
}

function assertYield(yieldQty: number, yieldUnit: string): void {
  if (!(yieldQty > 0) || !Number.isFinite(yieldQty)) {
    throw new RecipeServiceError(400, 'yield_qty must be a positive number');
  }
  if (!isAllowedInventoryUnit(yieldUnit)) {
    throw new RecipeServiceError(400, `Invalid yield_unit: ${yieldUnit}`);
  }
}

function assertIngredientInput(ing: RecipeIngredientInput): void {
  if (!ing.ingredient_product_id) {
    throw new RecipeServiceError(400, 'ingredient_product_id is required');
  }
  if (!(ing.quantity > 0) || !Number.isFinite(ing.quantity)) {
    throw new RecipeServiceError(400, 'ingredient quantity must be positive');
  }
  if (!isAllowedInventoryUnit(ing.unit)) {
    throw new RecipeServiceError(400, `Invalid ingredient unit: ${ing.unit}`);
  }
  const loss = ing.prep_loss_bps ?? 0;
  if (!Number.isInteger(loss) || loss < 0 || loss > 10_000) {
    throw new RecipeServiceError(400, 'prep_loss_bps must be an integer 0..10000');
  }
}

function requireMenuProduct(db: any, productId: string): void {
  const row = db
    .prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL')
    .get(productId) as { id: string } | undefined;
  if (!row) throw new RecipeServiceError(404, 'Menu product not found');
}

function requireIngredientProduct(
  db: any,
  productId: string,
): {
  id: string;
  name: string;
  cost: number;
  inventory_unit: string;
  is_active: number;
} {
  const row = db
    .prepare(
      `SELECT id, name, cost, COALESCE(inventory_unit, 'pcs') AS inventory_unit, is_active
       FROM products WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(productId) as
    | { id: string; name: string; cost: number; inventory_unit: string; is_active: number }
    | undefined;
  if (!row) throw new RecipeServiceError(404, `Ingredient product not found: ${productId}`);
  return row;
}

export function getRecipe(recipeId: string): RecipeRow {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId) as
    RecipeRow | undefined;
  if (!row) throw new RecipeServiceError(404, 'Recipe not found');
  return row;
}

export function getActiveRecipeForProduct(productId: string, db?: any): RecipeRow | null {
  const database = db ?? getDatabase();
  return (
    (database
      .prepare(
        'SELECT * FROM recipes WHERE product_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1',
      )
      .get(productId) as RecipeRow | undefined) ?? null
  );
}

export function listRecipeIngredients(recipeId: string, db?: any): RecipeIngredientRow[] {
  const database = db ?? getDatabase();
  return database
    .prepare(
      `
    SELECT ri.*, p.name AS ingredient_name, p.cost AS ingredient_cost,
           p.cost_cents AS ingredient_cost_cents,
           COALESCE(p.inventory_unit, 'pcs') AS inventory_unit, p.is_active
    FROM recipe_ingredients ri
    JOIN products p ON p.id = ri.ingredient_product_id
    WHERE ri.recipe_id = ?
    ORDER BY ri.position ASC, ri.created_at ASC
  `,
    )
    .all(recipeId) as RecipeIngredientRow[];
}

export function listRecipes(opts?: { productId?: string; activeOnly?: boolean }): RecipeRow[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.productId) {
    clauses.push('product_id = ?');
    params.push(opts.productId);
  }
  if (opts?.activeOnly) {
    clauses.push('is_active = 1');
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM recipes ${where} ORDER BY updated_at DESC`)
    .all(...params) as RecipeRow[];
}

export function createRecipe(input: {
  productId: string;
  name: string;
  yieldQty?: number;
  yieldUnit?: string;
  isActive?: boolean;
  ingredients?: RecipeIngredientInput[];
  actorUserId: string | null;
}): RecipeRow {
  const yieldQty = input.yieldQty ?? 1;
  const yieldUnit = (input.yieldUnit ?? 'pcs') as InventoryUnit;
  assertYield(yieldQty, yieldUnit);
  if (!input.name?.trim()) throw new RecipeServiceError(400, 'name is required');

  return withTxn(() => {
    const db = getDatabase();
    requireMenuProduct(db, input.productId);
    const ts = now();
    const id = newRecipeId();
    const active = input.isActive === false ? 0 : 1;

    if (active) {
      db.prepare(
        'UPDATE recipes SET is_active = 0, updated_by = ?, updated_at = ? WHERE product_id = ? AND is_active = 1',
      ).run(input.actorUserId, ts, input.productId);
    }

    db.prepare(
      `INSERT INTO recipes (
        id, product_id, name, yield_qty, yield_unit, is_active,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.productId,
      input.name.trim(),
      yieldQty,
      yieldUnit,
      active,
      input.actorUserId,
      input.actorUserId,
      ts,
      ts,
    );

    if (input.ingredients?.length) {
      insertIngredients(db, id, input.ingredients, ts);
    }

    logAuditEvent({
      actorUserId: input.actorUserId,
      action: 'recipe.created',
      entityType: 'recipe',
      entityId: id,
      result: 'success',
      metadata: { product_id: input.productId, name: input.name.trim(), is_active: active },
    });

    return getRecipe(id);
  });
}

function insertIngredients(
  db: any,
  recipeId: string,
  ingredients: RecipeIngredientInput[],
  ts: string,
): void {
  const stmt = db.prepare(
    `INSERT INTO recipe_ingredients (
      id, recipe_id, ingredient_product_id, quantity, unit, prep_loss_bps, position, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  ingredients.forEach((ing, idx) => {
    assertIngredientInput(ing);
    requireIngredientProduct(db, ing.ingredient_product_id);
    if (ing.ingredient_product_id === getRecipeProductId(db, recipeId)) {
      throw new RecipeServiceError(400, 'Recipe cannot include its own menu product as ingredient');
    }
    stmt.run(
      newIngredientId(),
      recipeId,
      ing.ingredient_product_id,
      ing.quantity,
      ing.unit,
      ing.prep_loss_bps ?? 0,
      ing.position ?? idx,
      ts,
    );
  });
}

function getRecipeProductId(db: any, recipeId: string): string {
  const row = db.prepare('SELECT product_id FROM recipes WHERE id = ?').get(recipeId) as
    { product_id: string } | undefined;
  if (!row) throw new RecipeServiceError(404, 'Recipe not found');
  return row.product_id;
}

export function updateRecipe(
  recipeId: string,
  patch: {
    name?: string;
    yieldQty?: number;
    yieldUnit?: string;
    actorUserId: string | null;
  },
): RecipeRow {
  return withTxn(() => {
    const db = getDatabase();
    const existing = getRecipe(recipeId);
    const name = patch.name !== undefined ? patch.name.trim() : existing.name;
    if (!name) throw new RecipeServiceError(400, 'name is required');
    const yieldQty = patch.yieldQty ?? existing.yield_qty;
    const yieldUnit = patch.yieldUnit ?? existing.yield_unit;
    assertYield(yieldQty, yieldUnit);
    const ts = now();
    db.prepare(
      `UPDATE recipes SET name = ?, yield_qty = ?, yield_unit = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
    ).run(name, yieldQty, yieldUnit, patch.actorUserId, ts, recipeId);

    logAuditEvent({
      actorUserId: patch.actorUserId,
      action: 'recipe.updated',
      entityType: 'recipe',
      entityId: recipeId,
      result: 'success',
      metadata: { name, yield_qty: yieldQty, yield_unit: yieldUnit },
    });
    return getRecipe(recipeId);
  });
}

export function setRecipeActive(
  recipeId: string,
  isActive: boolean,
  actorUserId: string | null,
): RecipeRow {
  return withTxn(() => {
    const db = getDatabase();
    const existing = getRecipe(recipeId);
    const ts = now();
    if (isActive) {
      db.prepare(
        'UPDATE recipes SET is_active = 0, updated_by = ?, updated_at = ? WHERE product_id = ? AND is_active = 1 AND id != ?',
      ).run(actorUserId, ts, existing.product_id, recipeId);
    }
    db.prepare('UPDATE recipes SET is_active = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(
      isActive ? 1 : 0,
      actorUserId,
      ts,
      recipeId,
    );

    logAuditEvent({
      actorUserId,
      action: isActive ? 'recipe.activated' : 'recipe.deactivated',
      entityType: 'recipe',
      entityId: recipeId,
      result: 'success',
      metadata: { product_id: existing.product_id },
    });
    return getRecipe(recipeId);
  });
}

export function replaceRecipeIngredients(
  recipeId: string,
  ingredients: RecipeIngredientInput[],
  actorUserId: string | null,
): RecipeIngredientRow[] {
  return withTxn(() => {
    const db = getDatabase();
    getRecipe(recipeId);
    const ts = now();
    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
    if (ingredients.length) {
      insertIngredients(db, recipeId, ingredients, ts);
    }
    db.prepare('UPDATE recipes SET updated_by = ?, updated_at = ? WHERE id = ?').run(
      actorUserId,
      ts,
      recipeId,
    );
    logAuditEvent({
      actorUserId,
      action: 'recipe.ingredient_changed',
      entityType: 'recipe',
      entityId: recipeId,
      result: 'success',
      metadata: { ingredient_count: ingredients.length },
    });
    return listRecipeIngredients(recipeId);
  });
}

export function computeRecipeCostForId(recipeId: string): RecipeCostResult & {
  recipeId: string;
  productId: string;
  yieldQty: number;
} {
  const recipe = getRecipe(recipeId);
  const db = getDatabase();
  const menu = db
    .prepare('SELECT price, is_active FROM products WHERE id = ?')
    .get(recipe.product_id) as { price: number; is_active: number } | undefined;
  const ingredients = listRecipeIngredients(recipeId);
  const costInputs = ingredients
    .filter((ing) => Number(ing.is_active) !== 0)
    .map((ing) => ({
      quantity: Number(ing.quantity),
      unit: ing.unit,
      prep_loss_bps: Number(ing.prep_loss_bps) || 0,
      inventoryUnit: (ing.inventory_unit || 'pcs') as string,
      unitCostCents: preferProductCostCents(ing.ingredient_cost_cents, ing.ingredient_cost),
      ingredientProductId: ing.ingredient_product_id,
      name: ing.ingredient_name,
    }));

  // Inactive ingredients → treat as missing for food-cost honesty
  const inactiveIds = ingredients
    .filter((ing) => Number(ing.is_active) === 0)
    .map((ing) => ing.ingredient_product_id);

  const result = computeRecipeCost(costInputs, Number(recipe.yield_qty), toPriceCents(menu?.price));
  if (inactiveIds.length) {
    return {
      ...result,
      status: 'insufficient_data',
      batchCostCents: null,
      portionCostCents: null,
      foodCostPercent: null,
      missingCostIngredientIds: [...result.missingCostIngredientIds, ...inactiveIds],
      recipeId,
      productId: recipe.product_id,
      yieldQty: Number(recipe.yield_qty),
    };
  }
  return {
    ...result,
    recipeId,
    productId: recipe.product_id,
    yieldQty: Number(recipe.yield_qty),
  };
}

export { ALLOWED_INVENTORY_UNITS };
