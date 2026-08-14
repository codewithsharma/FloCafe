/**
 * Phase 4.11 — Catalog-cost on-hand valuation client.
 * GET /api/reports/inventory-valuation — read-only.
 */
import api from './api';

export interface InventoryValuationLine {
  product_id: string;
  sku: string;
  name: string;
  on_hand_qty: number;
  unit_cost: number;
  extended_cost: number;
  zero_cost: boolean;
}

export interface InventoryValuationReport {
  currency: string;
  as_of: string;
  lines: InventoryValuationLine[];
  totals: {
    on_hand_qty: number;
    extended_cost: number;
    line_count: number;
    zero_cost_count: number;
  };
}

export async function fetchInventoryValuation(
  signal?: AbortSignal,
): Promise<InventoryValuationReport> {
  const { data } = await api.get('/reports/inventory-valuation', { signal });
  return data as InventoryValuationReport;
}
