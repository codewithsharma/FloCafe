/**
 * Refund boundary Zod schema — HTTP shape only.
 * Reason required/max length, amount money rules, method match, and PIN stay in
 * refund service so stable `REFUND_*` error codes are preserved.
 */

import { z } from 'zod';

export const refundBodySchema = z
  .object({
    reason: z.union([z.string(), z.null()]).optional(),
    amount: z.union([z.number(), z.string(), z.null()]).optional(),
    method: z.union([z.string(), z.null()]).optional(),
    override_pin: z.union([z.string(), z.null()]).optional(),
    manager_id: z.union([z.string(), z.number(), z.null()]).optional(),
    user_id: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .passthrough();

export type RefundBody = z.infer<typeof refundBodySchema>;
