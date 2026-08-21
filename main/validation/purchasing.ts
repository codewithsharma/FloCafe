/**
 * R6 purchasing HTTP body schemas.
 */

import { z } from 'zod';
import { ALLOWED_INVENTORY_UNITS } from '../services/inventory-units';

const moneyCents = z.number().int().min(0).max(1_000_000_000_000);
const qty = z.number().finite().positive().max(1_000_000);

export const supplierCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  contact_name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  tax_id: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const supplierUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contact_name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  tax_id: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const supplierProductBodySchema = z.object({
  product_id: z.string().min(1),
  supplier_sku: z.string().trim().max(80).nullable().optional(),
  purchase_unit: z.enum(ALLOWED_INVENTORY_UNITS),
  last_purchase_cost_cents: moneyCents.nullable().optional(),
});

export const purchaseOrderLineSchema = z.object({
  product_id: z.string().min(1),
  purchase_unit: z.enum(ALLOWED_INVENTORY_UNITS),
  ordered_qty: qty,
  unit_cost_cents: moneyCents,
  tax_cents: moneyCents.optional(),
});

export const purchaseOrderCreateBodySchema = z.object({
  supplier_id: z.string().min(1),
  expected_date: z.string().trim().max(40).nullable().optional(),
  order_date: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  tax_cents: moneyCents.optional(),
  lines: z.array(purchaseOrderLineSchema).min(1).max(500),
});

/** PRC-DRAFT — replace all lines on a draft PO (same line shape as create). */
export const purchaseOrderLinesReplaceBodySchema = z.object({
  lines: z.array(purchaseOrderLineSchema).min(1).max(500),
  tax_cents: moneyCents.optional(),
});

export const purchaseOrderStatusBodySchema = z.object({
  status: z.enum(['draft', 'ordered', 'partially_received', 'received', 'cancelled']),
});

export const purchaseReceiveLineSchema = z.object({
  po_line_id: z.string().min(1),
  quantity: qty,
});

export const purchaseReceiveBodySchema = z.object({
  lines: z.array(purchaseReceiveLineSchema).min(1).max(500),
  notes: z.string().trim().max(1000).nullable().optional(),
});
