/**
 * Inventory stock-adjust HTTP body schema (POST /products/:id/stock).
 */

import { z } from 'zod';

export const stockAdjustBodySchema = z.object({
  action: z.enum(['set', 'increase', 'decrease'], {
    message: 'Invalid action. Use: set, increase, decrease',
  }),
  quantity: z.number().finite().min(0, 'quantity must be a non-negative number'),
});

export type StockAdjustBody = z.infer<typeof stockAdjustBodySchema>;
