/**
 * Inventory domain boundary (Phase 2.7).
 *
 * Owns: product stock state reads/mutations used by Order/Product routes —
 * availability checks, sale decrement, cancel restore, manual adjust, low-stock
 * filter fragment.
 *
 * Does NOT own: product creation/pricing/categories, sales, payments, orders,
 * refunds (refunds intentionally do not restock).
 *
 * Schema: stock lives on products.track_inventory / stock_quantity /
 * low_stock_threshold. There is no stock_movements ledger yet — full movement
 * history is NOT reconstructable without a future schema (deferred).
 *
 * Transaction rule: callers that combine stock with order/bill writes MUST keep
 * these helpers inside the existing SQLite withTxn / db.transaction scope.
 * Do not move stock outside those transactions for architectural purity.
 */

import { getDatabase, now } from '../db';

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

/** Sale / add-items path: check then decrement when tracking. No floor on UPDATE. */
export function decrementTrackedStock(
  db: any,
  product: StockTrackedProduct,
  quantity: number,
  updatedAt: string,
): void {
  assertStockAvailable(product, quantity);
  if (!isTracking(product)) return;
  db.prepare(
    'UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?',
  ).run(quantity, updatedAt, product.id);
}

/** Order cancel / last-item cancel collapse: restore when tracking. */
export function restoreTrackedStock(
  db: any,
  product: StockTrackedProduct | null | undefined,
  quantity: number,
  updatedAt: string,
): void {
  if (!isTracking(product) || !product) return;
  db.prepare(
    'UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?',
  ).run(quantity, updatedAt, product.id);
}

/**
 * Manual stock adjust — POST /api/products/:id/stock behavior.
 * Decrease uses stock_quantity >= ? floor (unlike sale decrement).
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

  const db = getDatabase();
  const product = db.prepare(
    'SELECT * FROM products WHERE id = ? AND deleted_at IS NULL',
  ).get(productId) as Record<string, unknown> | undefined;
  if (!product) {
    throw new InventoryServiceError(404, 'Product not found');
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

  return db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown>;
}
