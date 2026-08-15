/**
 * R11 — Coupon validation (percent XOR fixed cents).
 */

import { z } from 'zod';

const couponCode = z
  .string()
  .trim()
  .min(1, 'code is required')
  .max(64, 'code too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'code must be alphanumeric, underscore, or hyphen');

export const couponCreateBodySchema = z
  .object({
    code: couponCode,
    percent_off: z.number().int().min(1).max(100).optional().nullable(),
    amount_cents: z.number().int().positive().max(1_000_000_000).optional().nullable(),
    max_uses: z.number().int().positive().max(1_000_000_000).optional().nullable(),
  })
  .superRefine((body, ctx) => {
    const hasPercent = body.percent_off != null;
    const hasAmount = body.amount_cents != null;
    if (hasPercent === hasAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of percent_off (1-100) or amount_cents',
        path: hasPercent ? ['amount_cents'] : ['percent_off'],
      });
    }
  });

export const couponIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});

export const applyCouponBodySchema = z.object({
  code: couponCode,
});

export type CouponCreateBody = z.infer<typeof couponCreateBodySchema>;
export type ApplyCouponBody = z.infer<typeof applyCouponBodySchema>;
