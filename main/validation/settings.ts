/**
 * Settings HTTP validation — priority money/ops mutators (Foundation Phase 2).
 */

import { z } from 'zod';

export const settingsDiscountBodySchema = z
  .object({
    discount_max_percentage: z.coerce.number().min(1).max(100).optional(),
    discount_max_amount: z.coerce.number().min(0).max(999999).optional(),
    discount_mode: z.enum(['percentage', 'flat', 'both']).optional(),
    discount_requires_approval: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  })
  .passthrough();

export const settingsKdsBodySchema = z
  .object({
    kds_default_view: z.enum(['tabs', 'kanban']).optional(),
  })
  .passthrough();

export const settingsLoyaltyBodySchema = z
  .object({
    loyalty_enabled: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
    global_cashback_percent: z.number().finite().min(0).max(100).optional(),
  })
  .passthrough();

export const settingsKeyParamsSchema = z.object({
  key: z.string().min(1),
});

export const settingsKeyBodySchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
