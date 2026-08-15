/**
 * Category HTTP body schemas (foundation deepen — Zod coverage).
 */

import { z } from 'zod';

export const categoryCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  parent_id: z.string().trim().min(1).nullable().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  icon: z.string().trim().max(80).nullable().optional(),
});

export const categoryUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  parent_id: z.string().trim().min(1).nullable().optional(),
  sort_order: z.number().int().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  icon: z.string().trim().max(80).nullable().optional(),
});
