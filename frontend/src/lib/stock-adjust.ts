/**
 * Phase 3.6C / R4 — Manual stock adjustment client.
 * Calls existing POST /products/:id/stock with mandatory Idempotency-Key.
 */
import api from './api';

export type StockAdjustAction = 'set' | 'increase' | 'decrease' | 'wastage';

export type WastageReason = 'SPOILAGE' | 'DAMAGED' | 'EXPIRED' | 'SPILLAGE' | 'OTHER';

export interface StockAdjustInput {
  action: StockAdjustAction;
  quantity: number;
  wastage_reason?: WastageReason;
  inventory_unit?: 'pcs' | 'box' | 'pack' | 'kg' | 'g' | 'L' | 'ml';
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

/** POST /products/:id/stock with exact backend body + Idempotency-Key. */
export async function postProductStockAdjust(
  productId: number | string,
  body: StockAdjustInput,
  idempotencyKey?: string,
): Promise<StockAdjustProduct> {
  const key = idempotencyKey || crypto.randomUUID();
  const payload: Record<string, unknown> = {
    action: body.action,
    quantity: body.quantity,
  };
  if (body.wastage_reason) payload.wastage_reason = body.wastage_reason;
  if (body.inventory_unit) payload.inventory_unit = body.inventory_unit;

  const { data } = await api.post<{ product: StockAdjustProduct }>(
    `/products/${productId}/stock`,
    payload,
    { headers: { 'Idempotency-Key': key } },
  );
  return data.product;
}
