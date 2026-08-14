/**
 * Phase 4.3 — Low-stock attention hub client helpers.
 *
 * Reuses GET /api/products?low_stock=true (Inventory-owned SQL fragment).
 * Read-only — no stock mutation in this module.
 */
import api from './api';
import type { Product } from './types';

export type LowStockAttentionStatus = 'out_of_stock' | 'low_stock';

/** Display status for products already returned by ?low_stock=true. */
export function getLowStockAttentionStatus(
  product: Pick<Product, 'stock_quantity' | 'low_stock_threshold'>,
): LowStockAttentionStatus {
  if (Number(product.stock_quantity) <= 0) return 'out_of_stock';
  return 'low_stock';
}

/** Mirrors Inventory LOW_STOCK_SQL_FRAGMENT for client-side checks. */
export function isLowStockProduct(
  product: Pick<Product, 'track_inventory' | 'stock_quantity' | 'low_stock_threshold'>,
): boolean {
  if (!product.track_inventory) return false;
  const threshold = Number(product.low_stock_threshold ?? 0);
  return Number(product.stock_quantity) <= threshold;
}

export async function fetchLowStockProducts(signal?: AbortSignal): Promise<Product[]> {
  const { data } = await api.get('/products', {
    params: { low_stock: 'true' },
    signal,
  });
  return (data.products || []) as Product[];
}
