import { z } from 'zod';

/** Phase 4.2 — POST /api/refunds/:id/restock body. */
export const refundRestockBodySchema = z
  .object({
    order_item_id: z.union([z.string(), z.number()]),
    quantity: z.number(),
  })
  .strict();

export type RefundRestockBody = z.infer<typeof refundRestockBodySchema>;
