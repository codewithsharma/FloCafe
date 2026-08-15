/**
 * Payment methods HTTP validation (Foundation Phase 2).
 */

import { z } from 'zod';

export const paymentMethodIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const paymentMethodListQuerySchema = z
  .object({
    include_inactive: z.enum(['true', 'false']).optional(),
  })
  .passthrough();

export const paymentMethodCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const paymentMethodUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).optional(),
  })
  .passthrough();

export const paymentMethodMergeBodySchema = z
  .object({
    target_type: z.enum(['card', 'custom']).default('custom'),
    target_id: z.number().int().positive().optional().nullable(),
  })
  .passthrough();
