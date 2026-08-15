/**
 * Payment boundary Zod schemas.
 * FIN-01, method resolution, amount positivity/decimals, wallet, and metadata size
 * stay in payment-tender so existing error messages/codes are preserved.
 */

import { z } from 'zod';

const paymentLineSchema = z
  .object({
    method: z.string().min(1, 'Payment method is required').max(60, 'Unsupported payment method'),
    payment_method_id: z.union([z.number(), z.string()]).optional().nullable(),
    amount: z.union([z.number(), z.string(), z.null()]).optional(),
    transaction_id: z.union([z.string(), z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    customer_id: z.union([z.string(), z.number()]).optional().nullable(),
  })
  .passthrough();

/** Single-pay body (POST /bills/:id/payment) — amount may be omitted. */
export const singlePaymentBodySchema = paymentLineSchema;

export type SinglePaymentBody = z.infer<typeof singlePaymentBodySchema>;

export const batchPaymentBodySchema = z
  .object({
    payments: z
      .array(paymentLineSchema)
      .min(1, 'payments must be a non-empty array')
      .max(100, 'A maximum of 100 payment lines is allowed'),
    customer_id: z.union([z.string(), z.number()]).optional().nullable(),
  })
  .passthrough();

export type BatchPaymentBody = z.infer<typeof batchPaymentBodySchema>;

/** Bill generate body (POST /bills/generate). */
export const billGenerateBodySchema = z
  .object({
    order_id: z.union([z.string().min(1), z.number()], {
      message: 'Order ID is required',
    }),
  })
  .passthrough();

export type BillGenerateBody = z.infer<typeof billGenerateBodySchema>;

/** Bill discount body (POST /bills/:id/applyDiscount). */
export const billDiscountBodySchema = z
  .object({
    type: z.enum(['percentage', 'amount'], {
      message: 'Valid discount type is required (percentage, amount)',
    }),
    value: z.number().finite().min(0, 'Valid discount value is required'),
    reason: z.string().max(500).optional().nullable(),
  })
  .passthrough();

export type BillDiscountBody = z.infer<typeof billDiscountBodySchema>;
