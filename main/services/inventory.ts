/**
 * Inventory domain boundary (Phase 2.7 + 2.8).
 *
 * Owns: product stock state mutations, append-only movement ledger,
 * availability checks, low-stock filter fragment, read-only reconciliation helpers.
 *
 * Does NOT own: product creation/pricing/categories, sales, payments, orders,
 * refunds (refunds intentionally do not restock — no refund ledger rows).
 *
 * Dual representation (Phase 2.8):
 *   products.stock_quantity     = current-state cache (runtime source of truth)
 *   inventory_movements         = durable append-only history (from migration v75)
 *
 * Pre-migration history is NOT reconstructed. Ledger starts at migration time.
 *
 * Transaction rule: stock UPDATE + movement INSERT must share the caller's
 * SQLite withTxn scope (or withTxn inside adjustProductStock). Never commit
 * one without the other. Never UPDATE/DELETE movement rows in normal ops.
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

export function getMovements(
  productId: string | number,
  limit = 100,
): InventoryMovementRow[] {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return getDatabase().prepare(`
    SELECT id, product_id, quantity_delta, movement_type, reference_type, reference_id,
           reason, stock_after, created_at
    FROM inventory_movements
    WHERE product_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(String(productId), safeLimit) as InventoryMovementRow[];
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
