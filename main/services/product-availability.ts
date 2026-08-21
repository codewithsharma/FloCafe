/**
 * INV-AUTO-86 — effective menu availability from manual 86 + stock-derived auto-86.
 *
 * Effective: is_active = !(manual_unavailable || auto_unavailable)
 * Manual restore never clears auto; stock restore never clears manual.
 * Callers MUST invoke notifyStockChanged inside the same withTxn as stock writes.
 */

import { now } from '../db';
import { logAuditEvent } from './audit-log';
import { getActiveRecipeForProduct, listRecipeIngredients } from './recipe';
import { portionConsumeQty } from './recipe-cost';

/** Avoid importing inventory.ts (circular: inventory → notifyStockChanged). */
export class ProductAvailabilityError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ProductAvailabilityError';
    this.statusCode = statusCode;
  }
}

export type AvailabilitySource = 'manual' | 'auto_stock' | 'effective';

export interface ProductAvailabilityRow {
  id: string;
  name: string;
  is_active: number;
  track_inventory: number;
  stock_quantity: number;
  manual_unavailable: number;
  auto_unavailable: number;
  deleted_at: string | null;
}

export interface AvailabilityTransition {
  productId: string;
  changed: boolean;
  previous: { manual: boolean; auto: boolean; is_active: boolean };
  next: { manual: boolean; auto: boolean; is_active: boolean };
}

function asBool(v: unknown): boolean {
  return Number(v) === 1 || v === true;
}

export function effectiveIsActive(manualUnavailable: boolean, autoUnavailable: boolean): boolean {
  return !manualUnavailable && !autoUnavailable;
}

/** Server-side order gate — staff and QR must not sell inactive catalog items. */
export function assertProductOrderable(product: {
  name?: string;
  is_active?: number | boolean | null;
}): void {
  if (Number(product.is_active) === 0 || product.is_active === false) {
    throw new ProductAvailabilityError(400, `Product unavailable: ${product.name ?? 'item'}`);
  }
}

function loadAvailabilityRow(db: any, productId: string | number): ProductAvailabilityRow | null {
  return (
    (db
      .prepare(
        `SELECT id, name, is_active, track_inventory, stock_quantity,
                COALESCE(manual_unavailable, 0) AS manual_unavailable,
                COALESCE(auto_unavailable, 0) AS auto_unavailable,
                deleted_at
         FROM products WHERE id = ?`,
      )
      .get(String(productId)) as ProductAvailabilityRow | undefined) ?? null
  );
}

/**
 * Auto-86 when tracked sellable stock is exhausted, or any recipe ingredient
 * cannot cover one portion. Untracked products without recipes stay auto-clear.
 */
export function computeAutoUnavailable(db: any, productId: string | number): boolean {
  const row = loadAvailabilityRow(db, productId);
  if (!row || row.deleted_at) return false;

  if (asBool(row.track_inventory) && Number(row.stock_quantity ?? 0) <= 0) {
    return true;
  }

  const recipe = getActiveRecipeForProduct(String(productId), db);
  if (!recipe) return false;

  const ingredients = listRecipeIngredients(recipe.id, db);
  for (const ing of ingredients) {
    const ingredient = db
      .prepare(
        `SELECT id, name, track_inventory, stock_quantity,
                COALESCE(inventory_unit, 'pcs') AS inventory_unit
         FROM products WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(ing.ingredient_product_id) as
      | {
          id: string;
          name: string;
          track_inventory: number | boolean | null;
          stock_quantity: number | null;
          inventory_unit: string;
        }
      | undefined;
    if (!ingredient) {
      return true;
    }
    if (!asBool(ingredient.track_inventory)) {
      continue;
    }
    const need = portionConsumeQty(
      Number(ing.quantity),
      String(ing.unit),
      Number(ing.prep_loss_bps || 0),
      String(ingredient.inventory_unit || 'pcs'),
      Number(recipe.yield_qty || 1),
      1,
    );
    if (Number(ingredient.stock_quantity ?? 0) < need) {
      return true;
    }
  }
  return false;
}

function findMenuProductsUsingIngredient(db: any, ingredientProductId: string): string[] {
  const rows = db
    .prepare(
      `
    SELECT DISTINCT r.product_id AS product_id
    FROM recipe_ingredients ri
    INNER JOIN recipes r ON r.id = ri.recipe_id AND r.is_active = 1
    INNER JOIN products p ON p.id = r.product_id AND p.deleted_at IS NULL
    WHERE ri.ingredient_product_id = ?
  `,
    )
    .all(ingredientProductId) as Array<{ product_id: string }>;
  return rows.map((r) => String(r.product_id));
}

function persistAvailabilityFlags(
  db: any,
  productId: string,
  manual: boolean,
  auto: boolean,
  updatedAt: string,
): { is_active: boolean } {
  const isActive = effectiveIsActive(manual, auto);
  db.prepare(
    `UPDATE products
     SET manual_unavailable = ?, auto_unavailable = ?, is_active = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
  ).run(manual ? 1 : 0, auto ? 1 : 0, isActive ? 1 : 0, updatedAt, productId);
  return { is_active: isActive };
}

function auditAvailabilityChange(
  db: any,
  args: {
    productId: string;
    actorUserId?: string | null;
    source: AvailabilitySource;
    previous: AvailabilityTransition['previous'];
    next: AvailabilityTransition['next'];
    stockQuantity?: number;
    reason?: string | null;
  },
): void {
  const row = loadAvailabilityRow(db, args.productId);
  logAuditEvent({
    actorUserId: args.actorUserId ?? null,
    action: 'product.availability',
    entityType: 'product',
    entityId: args.productId,
    result: 'success',
    metadata: {
      is_active: args.next.is_active,
      source: args.source,
      previous: args.previous,
      next: args.next,
      stock_quantity: args.stockQuantity ?? row?.stock_quantity ?? null,
      reason: args.reason ?? null,
    },
  });
}

/**
 * Recompute auto_unavailable for one product. No-op when flags unchanged (anti-flap).
 */
export function syncAutoUnavailableForProduct(
  db: any,
  productId: string | number,
  opts?: {
    actorUserId?: string | null;
    reason?: string | null;
    audit?: boolean;
  },
): AvailabilityTransition {
  const id = String(productId);
  const row = loadAvailabilityRow(db, id);
  if (!row || row.deleted_at) {
    return {
      productId: id,
      changed: false,
      previous: { manual: false, auto: false, is_active: true },
      next: { manual: false, auto: false, is_active: true },
    };
  }

  const previous = {
    manual: asBool(row.manual_unavailable),
    auto: asBool(row.auto_unavailable),
    is_active: asBool(row.is_active),
  };
  const nextAuto = computeAutoUnavailable(db, id);
  const next = {
    manual: previous.manual,
    auto: nextAuto,
    is_active: effectiveIsActive(previous.manual, nextAuto),
  };

  if (
    previous.manual === next.manual &&
    previous.auto === next.auto &&
    previous.is_active === next.is_active
  ) {
    return { productId: id, changed: false, previous, next };
  }

  const updatedAt = now();
  persistAvailabilityFlags(db, id, next.manual, next.auto, updatedAt);
  if (opts?.audit !== false) {
    auditAvailabilityChange(db, {
      productId: id,
      actorUserId: opts?.actorUserId,
      source: 'auto_stock',
      previous,
      next,
      stockQuantity: Number(row.stock_quantity ?? 0),
      reason: opts?.reason ?? 'stock_sync',
    });
  }

  return { productId: id, changed: true, previous, next };
}

/**
 * Manual 86 / restore via POST /availability. Stock restore never clears this flag.
 */
export function setManualAvailability(
  db: any,
  productId: string | number,
  isActiveDesired: boolean,
  opts?: { actorUserId?: string | null },
): AvailabilityTransition {
  const id = String(productId);
  const row = loadAvailabilityRow(db, id);
  if (!row || row.deleted_at) {
    throw new ProductAvailabilityError(404, 'Product not found');
  }

  const previous = {
    manual: asBool(row.manual_unavailable),
    auto: asBool(row.auto_unavailable),
    is_active: asBool(row.is_active),
  };

  // Desired is_active=false → set manual. Desired true → clear manual only.
  const nextManual = !isActiveDesired;
  // Refresh auto from live stock so restore cannot bypass zero stock.
  const nextAuto = computeAutoUnavailable(db, id);
  const next = {
    manual: nextManual,
    auto: nextAuto,
    is_active: effectiveIsActive(nextManual, nextAuto),
  };

  if (
    previous.manual === next.manual &&
    previous.auto === next.auto &&
    previous.is_active === next.is_active
  ) {
    return { productId: id, changed: false, previous, next };
  }

  const updatedAt = now();
  persistAvailabilityFlags(db, id, next.manual, next.auto, updatedAt);
  auditAvailabilityChange(db, {
    productId: id,
    actorUserId: opts?.actorUserId,
    source: 'manual',
    previous,
    next,
    stockQuantity: Number(row.stock_quantity ?? 0),
    reason: isActiveDesired ? 'manual_restore' : 'manual_86',
  });

  return { productId: id, changed: true, previous, next };
}

/**
 * After any stock mutation: sync the product and menu items that consume it as an ingredient.
 */
export function notifyStockChanged(
  db: any,
  productIds: Array<string | number>,
  opts?: { actorUserId?: string | null; reason?: string | null },
): AvailabilityTransition[] {
  const seed = [...new Set(productIds.map(String).filter(Boolean))];
  const affected = new Set<string>();
  for (const id of seed) {
    affected.add(id);
    for (const menuId of findMenuProductsUsingIngredient(db, id)) {
      affected.add(menuId);
    }
  }

  const transitions: AvailabilityTransition[] = [];
  for (const id of affected) {
    transitions.push(
      syncAutoUnavailableForProduct(db, id, {
        actorUserId: opts?.actorUserId,
        reason: opts?.reason ?? 'stock_mutation',
      }),
    );
  }
  return transitions;
}
