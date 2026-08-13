/**
 * Inventory domain boundary (Phase 2.7–2.12).
 *
 * Owns: ALL application-level stock quantity writes, append-only movement ledger,
 * availability checks, low-stock filter fragment, read-only reconciliation helpers,
 * and bounded movement history reads (listInventoryMovements / HTTP GET).
 *
 * Does NOT own: product metadata (name/price/category), sales, payments, orders,
 * refunds (refunds intentionally do not restock — no refund ledger rows).
 *
 * Dual representation:
 *   products.stock_quantity     = current-state cache (runtime reads OK)
 *   inventory_movements         = durable append-only history (from migration v75)
 *
 * Write ownership (Phase 2.9): Product create/update routes stock through
 * applyAbsoluteStockChange / adjustProductStock. Zero-delta skips movements.
 * Opening stock uses movement_type `adjustment` + reason `opening` (no schema change).
 *
 * Read ownership (Phase 2.12): HTTP GET /api/inventory/movements → listInventoryMovements.
 * Ledger history begins at v75 (no backfill).
 *
 * Transaction rule: stock UPDATE + movement INSERT share caller withTxn (or
 * withTxn inside adjustProductStock). Never UPDATE/DELETE movement rows.
 */

import { getDatabase, now, withTxn } from '../db';

export class InventoryServiceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'InventoryServiceError';
    this.statusCode = statusCode;
  }
}

export interface StockTrackedProduct {
  id: string | number;
  name?: string;
  track_inventory?: number | boolean | null;
  stock_quantity?: number | null;
}

export type StockAdjustAction = 'set' | 'increase' | 'decrease';
export type InventoryMovementType = 'sale' | 'cancel_restore' | 'adjustment';

export interface InventoryMovementRef {
  referenceType?: string | null;
  referenceId?: string | number | bigint | null;
  reason?: string | null;
}

export interface InventoryMovementRow {
  id: number;
  product_id: string;
  quantity_delta: number;
  movement_type: InventoryMovementType;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  stock_after: number;
  created_at: string;
}

export interface StockLedgerComparison {
  productId: string;
  currentStock: number;
  ledgerDeltaSum: number;
  /** currentStock - (baseline + ledgerDeltaSum); baseline defaults to current - sum */
  difference: number;
  valid: boolean;
}

/** SQL fragment for GET /api/products?low_stock=true (products list alias `p`). */
export const LOW_STOCK_SQL_FRAGMENT =
  ' AND p.track_inventory = 1 AND p.stock_quantity <= p.low_stock_threshold';

function isTracking(product: StockTrackedProduct | null | undefined): boolean {
  return Boolean(product && product.track_inventory);
}

/**
 * Throws Error (not InventoryServiceError) with the historical message so
 * order-route catch blocks that map Error → 400 keep working unchanged.
 */
export function assertStockAvailable(
  product: StockTrackedProduct,
  quantity: number,
): void {
  if (isTracking(product) && Number(product.stock_quantity ?? 0) < quantity) {
    throw new Error(`Insufficient stock for ${product.name}`);
  }
}

/** Append-only movement insert. Callers MUST be inside the same txn as the stock write. */
export function recordMovement(
  db: any,
  args: {
    productId: string | number;
    quantityDelta: number;
    movementType: InventoryMovementType;
    stockAfter: number;
    referenceType?: string | null;
    referenceId?: string | number | bigint | null;
    reason?: string | null;
    createdAt?: string;
  },
): void {
  db.prepare(`
    INSERT INTO inventory_movements (
      product_id, quantity_delta, movement_type, reference_type, reference_id,
      reason, stock_after, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(args.productId),
    args.quantityDelta,
    args.movementType,
    args.referenceType ?? null,
    args.referenceId != null ? String(args.referenceId) : null,
    args.reason ?? null,
    args.stockAfter,
    args.createdAt ?? now(),
  );
}

function readStockAfter(db: any, productId: string | number): number {
  const row = db.prepare(
    'SELECT stock_quantity FROM products WHERE id = ?',
  ).get(productId) as { stock_quantity: number } | undefined;
  return Number(row?.stock_quantity ?? 0);
}

/**
 * Set absolute stock quantity and record an adjustment movement when delta ≠ 0.
 * Callers MUST be inside the same SQLite transaction as related product writes.
 * Uses movement_type `adjustment` (no separate opening type — avoid schema change).
 */
export function applyAbsoluteStockChange(
  db: any,
  productId: string | number,
  newQuantity: number,
  ref?: InventoryMovementRef,
): { changed: boolean; delta: number; stockAfter: number } {
  if (typeof newQuantity !== 'number' || !Number.isFinite(newQuantity) || newQuantity < 0) {
    throw new InventoryServiceError(400, 'quantity must be a non-negative number');
  }

  const current = readStockAfter(db, productId);
  const delta = newQuantity - current;
  if (delta === 0) {
    return { changed: false, delta: 0, stockAfter: current };
  }

  const updatedAt = now();
  const result = db.prepare(
    'UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
  ).run(newQuantity, updatedAt, productId) as { changes: number };

  if (result.changes === 0) {
    throw new InventoryServiceError(404, 'Product not found');
  }

  const stockAfter = readStockAfter(db, productId);
  if (Number((current + delta).toFixed(6)) !== Number(stockAfter.toFixed(6))) {
    throw new InventoryServiceError(500, 'Stock mutation invariant violated');
  }

  recordMovement(db, {
    productId,
    quantityDelta: delta,
    movementType: 'adjustment',
    stockAfter,
    referenceType: ref?.referenceType ?? 'product',
    referenceId: ref?.referenceId ?? String(productId),
    reason: ref?.reason ?? 'set',
    createdAt: updatedAt,
  });

  return { changed: true, delta, stockAfter };
}

/** Sale / add-items path: check then decrement when tracking. No floor on UPDATE. */
export function decrementTrackedStock(
  db: any,
  product: StockTrackedProduct,
  quantity: number,
  updatedAt: string,
  ref?: InventoryMovementRef,
): void {
  assertStockAvailable(product, quantity);
  if (!isTracking(product)) return;
  db.prepare(
    'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?',
  ).run(quantity, updatedAt, product.id);
  const stockAfter = readStockAfter(db, product.id);
  recordMovement(db, {
    productId: product.id,
    quantityDelta: -quantity,
    movementType: 'sale',
    stockAfter,
    referenceType: ref?.referenceType ?? 'order',
    referenceId: ref?.referenceId ?? null,
    reason: ref?.reason ?? null,
    createdAt: updatedAt,
  });
}

/** Order cancel / last-item cancel collapse: restore when tracking. */
export function restoreTrackedStock(
  db: any,
  product: StockTrackedProduct | null | undefined,
  quantity: number,
  updatedAt: string,
  ref?: InventoryMovementRef,
): void {
  if (!isTracking(product) || !product) return;
  db.prepare(
    'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?',
  ).run(quantity, updatedAt, product.id);
  const stockAfter = readStockAfter(db, product.id);
  recordMovement(db, {
    productId: product.id,
    quantityDelta: quantity,
    movementType: 'cancel_restore',
    stockAfter,
    referenceType: ref?.referenceType ?? 'order',
    referenceId: ref?.referenceId ?? null,
    reason: ref?.reason ?? null,
    createdAt: updatedAt,
  });
}

/**
 * Manual stock adjust — POST /api/products/:id/stock behavior.
 * Decrease uses stock_quantity >= ? floor (unlike sale decrement).
 * Stock UPDATE + ledger INSERT are wrapped in withTxn for atomicity.
 */
export function adjustProductStock(
  productId: string,
  action: StockAdjustAction | string,
  quantity: unknown,
): Record<string, unknown> {
  if (!action || quantity === undefined) {
    throw new InventoryServiceError(400, 'Action and quantity are required');
  }
  if (!['set', 'increase', 'decrease'].includes(action)) {
    throw new InventoryServiceError(400, 'Invalid action. Use: set, increase, decrease');
  }
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
    throw new InventoryServiceError(400, 'quantity must be a non-negative number');
  }

  return withTxn(() => {
    const db = getDatabase();
    const product = db.prepare(
      'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL',
    ).get(productId) as Record<string, unknown> | undefined;
    if (!product) {
      throw new InventoryServiceError(404, 'Product not found');
    }

    const current = Number(product.stock_quantity ?? 0);
    let delta: number;
    if (action === 'set') {
      delta = quantity - current;
    } else if (action === 'increase') {
      delta = quantity;
    } else {
      delta = -quantity;
    }

    if (delta === 0) {
      return product;
    }

    const updatedAt = now();
    let result: { changes: number };
    if (action === 'set') {
      result = db.prepare(
        'UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      ).run(quantity, updatedAt, productId) as { changes: number };
    } else if (action === 'increase') {
      result = db.prepare(
        'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      ).run(quantity, updatedAt, productId) as { changes: number };
    } else {
      result = db.prepare(
        'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND stock_quantity >= ?',
      ).run(quantity, updatedAt, productId, quantity) as { changes: number };
    }

    if (result.changes === 0) {
      throw new InventoryServiceError(
        400,
        action === 'decrease' ? 'Insufficient stock' : 'Product not found',
      );
    }

    const stockAfter = readStockAfter(db, productId);
    recordMovement(db, {
      productId,
      quantityDelta: delta,
      movementType: 'adjustment',
      stockAfter,
      referenceType: 'manual',
      referenceId: null,
      reason: action,
      createdAt: updatedAt,
    });

    return db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown>;
  });
}

export function getCurrentStock(productId: string | number): number {
  return readStockAfter(getDatabase(), productId);
}

/** Post-migration SUM(quantity_delta). Pre-migration history is unavailable. */
export function calculateLedgerStock(productId: string | number): number {
  const row = getDatabase().prepare(`
    SELECT COALESCE(SUM(quantity_delta), 0) AS total
    FROM inventory_movements
    WHERE product_id = ?
  `).get(String(productId)) as { total: number };
  return Number(row.total ?? 0);
}

/** Domain movement row (matches DB/API snake_case — products/tax convention). */
export type InventoryMovement = InventoryMovementRow;

export interface ListInventoryMovementsOptions {
  productId: string | number;
  limit?: number;
  /** Keyset cursor: return rows with id < beforeId (ORDER BY id DESC). */
  beforeId?: number | string | null;
}

export interface ListInventoryMovementsResult {
  movements: InventoryMovement[];
  nextCursor: number | null;
}

/**
 * Bounded product-scoped movement history (newest first).
 * Ledger starts at schema v75 — pre-migration activity is not represented.
 */
export function listInventoryMovements(
  options: ListInventoryMovementsOptions,
): ListInventoryMovementsResult {
  const productId = String(options.productId ?? '').trim();
  if (!productId) {
    throw new InventoryServiceError(400, 'product_id is required');
  }

  const safeLimit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
  const beforeRaw = options.beforeId;
  const beforeId =
    beforeRaw === undefined || beforeRaw === null || beforeRaw === ''
      ? null
      : Number(beforeRaw);
  if (beforeId !== null && (!Number.isFinite(beforeId) || beforeId < 1)) {
    throw new InventoryServiceError(400, 'before_id must be a positive integer');
  }

  const db = getDatabase();
  const rows = beforeId === null
    ? (db.prepare(`
        SELECT id, product_id, quantity_delta, movement_type, reference_type, reference_id,
               reason, stock_after, created_at
        FROM inventory_movements
        WHERE product_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(productId, safeLimit + 1) as InventoryMovementRow[])
    : (db.prepare(`
        SELECT id, product_id, quantity_delta, movement_type, reference_type, reference_id,
               reason, stock_after, created_at
        FROM inventory_movements
        WHERE product_id = ?
          AND id < ?
        ORDER BY id DESC
        LIMIT ?
      `).all(productId, beforeId, safeLimit + 1) as InventoryMovementRow[]);

  const hasMore = rows.length > safeLimit;
  const movements = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore ? Number(movements[movements.length - 1].id) : null;
  return { movements, nextCursor };
}

export function getMovements(
  productId: string | number,
  limit = 100,
): InventoryMovementRow[] {
  return listInventoryMovements({ productId, limit }).movements;
}

/**
 * Read-only diagnostic: compares current product stock to
 * (currentStock - ledgerDeltaSum) + ledgerDeltaSum identity, and reports whether
 * stock_after of the latest movement matches current stock when movements exist.
 *
 * With no baseline opening row, "valid" means: either no movements, or the
 * latest movement's stock_after equals products.stock_quantity.
 */
export function compareCurrentStockToLedger(productId: string | number): StockLedgerComparison {
  const id = String(productId);
  const currentStock = getCurrentStock(id);
  const ledgerDeltaSum = calculateLedgerStock(id);
  const latest = getDatabase().prepare(`
    SELECT stock_after FROM inventory_movements
    WHERE product_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(id) as { stock_after: number } | undefined;

  const valid = !latest || Number(latest.stock_after) === currentStock;
  const difference = latest
    ? currentStock - Number(latest.stock_after)
    : 0;

  return {
    productId: id,
    currentStock,
    ledgerDeltaSum,
    difference,
    valid,
  };
}
