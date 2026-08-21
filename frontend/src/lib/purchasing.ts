/**
 * R6 — Purchasing / suppliers / PO client (`/api/purchasing`).
 */
import api from './api';

export type PurchaseOrderStatus =
  'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  is_active: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SupplierProductMapping {
  id?: string | number;
  supplier_id: string;
  product_id: string;
  supplier_sku: string | null;
  purchase_unit: string;
  last_purchase_cost_cents: number | null;
  product_name?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  expected_date: string | null;
  notes: string | null;
  subtotal_cents: number;
  created_at?: string | null;
  updated_at?: string | null;
  supplier_name?: string;
}

export interface PurchaseOrderLine {
  id: string;
  po_id?: string;
  product_id: string;
  purchase_unit: string;
  ordered_qty: number;
  unit_cost_cents: number;
  received_qty: number;
  remaining_qty: number;
  product_name?: string;
  line_total_cents?: number;
}

export interface PurchaseReceipt {
  id: string;
  po_id: string;
  created_at?: string | null;
  received_by?: string | null;
}

export interface CreateSupplierBody {
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  notes?: string | null;
}

export interface UpdateSupplierBody {
  name?: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface CreateSupplierProductBody {
  product_id: string;
  supplier_sku?: string | null;
  purchase_unit: string;
  last_purchase_cost_cents?: number | null;
}

export interface CreatePurchaseOrderLineInput {
  product_id: string;
  purchase_unit: string;
  ordered_qty: number;
  unit_cost_cents: number;
}

export interface CreatePurchaseOrderBody {
  supplier_id: string;
  expected_date?: string | null;
  notes?: string | null;
  lines: CreatePurchaseOrderLineInput[];
}

export interface ReceivePurchaseOrderBody {
  lines: Array<{ po_line_id: string; quantity: number }>;
  notes?: string | null;
}

export function formatPurchaseCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  return (cents / 100).toFixed(2);
}

export async function listSuppliers(signal?: AbortSignal): Promise<Supplier[]> {
  const { data } = await api.get<{ suppliers: Supplier[] }>('/purchasing/suppliers', { signal });
  return data.suppliers || [];
}

export async function getSupplier(id: string, signal?: AbortSignal): Promise<Supplier> {
  const { data } = await api.get<{ supplier: Supplier }>(`/purchasing/suppliers/${id}`, {
    signal,
  });
  return data.supplier;
}

export async function createSupplier(body: CreateSupplierBody): Promise<Supplier> {
  const { data } = await api.post<{ supplier: Supplier }>('/purchasing/suppliers', body);
  return data.supplier;
}

export async function updateSupplier(id: string, body: UpdateSupplierBody): Promise<Supplier> {
  const { data } = await api.patch<{ supplier: Supplier }>(`/purchasing/suppliers/${id}`, body);
  return data.supplier;
}

export async function deactivateSupplier(id: string): Promise<Supplier> {
  const { data } = await api.post<{ supplier: Supplier }>(
    `/purchasing/suppliers/${id}/deactivate`,
    {},
  );
  return data.supplier;
}

export async function listSupplierProducts(
  supplierId: string,
  signal?: AbortSignal,
): Promise<SupplierProductMapping[]> {
  const { data } = await api.get<{ mappings: SupplierProductMapping[] }>(
    `/purchasing/suppliers/${supplierId}/products`,
    { signal },
  );
  return data.mappings || [];
}

export async function addSupplierProduct(
  supplierId: string,
  body: CreateSupplierProductBody,
): Promise<SupplierProductMapping> {
  const { data } = await api.post<{ mapping: SupplierProductMapping }>(
    `/purchasing/suppliers/${supplierId}/products`,
    body,
  );
  return data.mapping;
}

export async function listPurchaseOrders(opts?: {
  status?: PurchaseOrderStatus | '';
  signal?: AbortSignal;
}): Promise<PurchaseOrder[]> {
  const params = opts?.status && opts.status.length > 0 ? { status: opts.status } : undefined;
  const { data } = await api.get<{ purchase_orders: PurchaseOrder[] }>(
    '/purchasing/purchase-orders',
    { params, signal: opts?.signal },
  );
  return data.purchase_orders || [];
}

export async function getPurchaseOrder(
  id: string,
  signal?: AbortSignal,
): Promise<{ purchase_order: PurchaseOrder; lines: PurchaseOrderLine[] }> {
  const { data } = await api.get<{ purchase_order: PurchaseOrder; lines: PurchaseOrderLine[] }>(
    `/purchasing/purchase-orders/${id}`,
    { signal },
  );
  return { purchase_order: data.purchase_order, lines: data.lines || [] };
}

export async function createPurchaseOrder(
  body: CreatePurchaseOrderBody,
): Promise<{ purchase_order: PurchaseOrder; lines: PurchaseOrderLine[] }> {
  const { data } = await api.post<{ purchase_order: PurchaseOrder; lines: PurchaseOrderLine[] }>(
    '/purchasing/purchase-orders',
    body,
  );
  return { purchase_order: data.purchase_order, lines: data.lines || [] };
}

/** PRC-DRAFT — replace lines on a draft PO only. */
export async function replacePurchaseOrderLines(
  id: string,
  body: { lines: CreatePurchaseOrderLineInput[] },
): Promise<{ purchase_order: PurchaseOrder; lines: PurchaseOrderLine[] }> {
  const { data } = await api.put<{ purchase_order: PurchaseOrder; lines: PurchaseOrderLine[] }>(
    `/purchasing/purchase-orders/${id}/lines`,
    body,
  );
  return { purchase_order: data.purchase_order, lines: data.lines || [] };
}

export async function setPurchaseOrderStatus(
  id: string,
  status: 'ordered' | 'cancelled',
): Promise<{ purchase_order: PurchaseOrder; lines?: PurchaseOrderLine[] }> {
  const { data } = await api.post<{ purchase_order: PurchaseOrder; lines?: PurchaseOrderLine[] }>(
    `/purchasing/purchase-orders/${id}/status`,
    { status },
  );
  return data;
}

export async function receivePurchaseOrder(
  id: string,
  body: ReceivePurchaseOrderBody,
  idempotencyKey: string,
): Promise<{
  purchase_order: PurchaseOrder;
  lines: PurchaseOrderLine[];
  receipt?: PurchaseReceipt;
}> {
  const { data } = await api.post<{
    purchase_order: PurchaseOrder;
    lines: PurchaseOrderLine[];
    receipt?: PurchaseReceipt;
  }>(`/purchasing/purchase-orders/${id}/receive`, body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return {
    purchase_order: data.purchase_order,
    lines: data.lines || [],
    receipt: data.receipt,
  };
}

export async function listPurchaseOrderReceipts(
  id: string,
  signal?: AbortSignal,
): Promise<PurchaseReceipt[]> {
  try {
    const { data } = await api.get<{ receipts: PurchaseReceipt[] }>(
      `/purchasing/purchase-orders/${id}/receipts`,
      { signal },
    );
    return data.receipts || [];
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return [];
    throw err;
  }
}
