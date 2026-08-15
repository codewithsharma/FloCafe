/**
 * Inventory stock-adjust HTTP body schema (POST /products/:id/stock).
 */

import { z } from 'zod';
import { ALLOWED_INVENTORY_UNITS, WASTAGE_REASONS } from '../services/inventory-units';

export const stockAdjustBodySchema = z.object({
  action: z.enum(['set', 'increase', 'decrease', 'wastage'], {
    message: 'Invalid action. Use: set, increase, decrease, wastage',
  }),
  quantity: z.number().finite().min(0, 'quantity must be a non-negative number'),
  wastage_reason: z.enum(WASTAGE_REASONS).optional(),
  inventory_unit: z.enum(ALLOWED_INVENTORY_UNITS).optional(),
});

export type StockAdjustBody = z.infer<typeof stockAdjustBodySchema>;

export const inventoryCountCreateBodySchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

export const inventoryCountLineBodySchema = z.object({
  product_id: z.string().min(1),
  counted_qty: z.number().finite().min(0),
});
