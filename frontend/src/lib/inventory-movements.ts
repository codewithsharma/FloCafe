/**
 * Inventory movement list helpers for Phase 3.5A UI.
 * Backend remains source of truth — no stock recalculation.
 */

export type InventoryMovementType = 'sale' | 'cancel_restore' | 'adjustment';

export interface InventoryMovement {
  id: number;
  product_id: string;
  quantity_delta: number;
  movement_type: InventoryMovementType | string;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  stock_after: number;
  created_at: string;
}

export interface InventoryMovementsResponse {
  movements: InventoryMovement[];
  nextCursor?: number;
}

/** Format signed delta for display without changing magnitude. */
export function formatQuantityDelta(delta: number): string {
  if (Object.is(delta, -0) || delta === 0) return '0';
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function formatMovementReference(
  referenceType: string | null | undefined,
  referenceId: string | null | undefined,
): string {
  const type = (referenceType || '').trim();
  const id = (referenceId || '').trim();
  if (!type && !id) return '—';
  if (type && id) return `${type}:${id}`;
  return type || id;
}

export function buildMovementsQuery(params: {
  productId: string;
  limit?: number;
  beforeId?: number | null;
}): Record<string, string | number> {
  const productId = params.productId.trim();
  if (!productId) {
    throw new Error('product_id is required');
  }
  const query: Record<string, string | number> = {
    product_id: productId,
  };
  if (params.limit != null) query.limit = params.limit;
  if (params.beforeId != null) query.before_id = params.beforeId;
  return query;
}
