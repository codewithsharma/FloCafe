/**
 * Phase 3.6C — Manual stock adjustment client.
 * Calls existing POST /products/:id/stock — does not invent reason/schema.
 */
import api from './api';

export type StockAdjustAction = 'set' | 'increase' | 'decrease' | 'wastage';

export interface StockAdjustInput {
  action: StockAdjustAction;
  quantity: number;
}

export interface StockAdjustProduct {
  id: number | string;
  name?: string;
  stock_quantity?: number;
  track_inventory?: boolean;
  [key: string]: unknown;
}

/** Parse UI quantity string → finite non-negative number, or null if invalid. */
export function parseStockAdjustQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function canSubmitStockAdjust(action: StockAdjustAction | '', quantityRaw: string): boolean {
  if (action !== 'set' && action !== 'increase' && action !== 'decrease' && action !== 'wastage') {
    return false;
  }
  return parseStockAdjustQuantity(quantityRaw) !== null;
}

/** POST /products/:id/stock with exact backend body. */
export async function postProductStockAdjust(
  productId: number | string,
  body: StockAdjustInput,
): Promise<StockAdjustProduct> {
  const { data } = await api.post<{ product: StockAdjustProduct }>(`/products/${productId}/stock`, {
    action: body.action,
    quantity: body.quantity,
  });
  return data.product;
}
