/**
 * R4 Inventory OS — stock count client.
 * GET/POST /inventory/counts (+ lines, submit, apply, cancel).
 */
import api from './api';

export type InventoryCountStatus = 'draft' | 'submitted' | 'applied' | 'cancelled';

export interface InventoryCount {
  id: string;
  status: InventoryCountStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  applied_at: string | null;
}

export interface InventoryCountLine {
  id: number;
  count_id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number;
  variance: number;
  applied_movement_id: number | null;
}

export async function listInventoryCounts(signal?: AbortSignal): Promise<InventoryCount[]> {
  const { data } = await api.get<{ counts: InventoryCount[] }>('/inventory/counts', { signal });
  return data.counts || [];
}

export async function getInventoryCount(
  countId: string,
  signal?: AbortSignal,
): Promise<{ count: InventoryCount; lines: InventoryCountLine[] }> {
  const { data } = await api.get<{ count: InventoryCount; lines: InventoryCountLine[] }>(
    `/inventory/counts/${countId}`,
    { signal },
  );
  return { count: data.count, lines: data.lines || [] };
}

export async function createInventoryCount(notes?: string | null): Promise<InventoryCount> {
  const { data } = await api.post<{ count: InventoryCount }>('/inventory/counts', {
    ...(notes ? { notes } : {}),
  });
  return data.count;
}

export async function upsertInventoryCountLine(
  countId: string,
  body: { product_id: string; counted_qty: number },
): Promise<InventoryCountLine> {
  const { data } = await api.post<{ line: InventoryCountLine }>(
    `/inventory/counts/${countId}/lines`,
    body,
  );
  return data.line;
}

export async function submitInventoryCount(countId: string): Promise<InventoryCount> {
  const { data } = await api.post<{ count: InventoryCount }>(
    `/inventory/counts/${countId}/submit`,
    {},
  );
  return data.count;
}

export async function applyInventoryCount(countId: string): Promise<InventoryCount> {
  const { data } = await api.post<{ count: InventoryCount }>(
    `/inventory/counts/${countId}/apply`,
    {},
  );
  return data.count;
}

export async function cancelInventoryCount(countId: string): Promise<InventoryCount> {
  const { data } = await api.post<{ count: InventoryCount }>(
    `/inventory/counts/${countId}/cancel`,
    {},
  );
  return data.count;
}
