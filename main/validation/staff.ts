/**
 * Staff HTTP validation (Foundation Phase 2 Zod expansion).
 */

import { z } from 'zod';

export const staffRoleSchema = z.enum(['owner', 'manager', 'cashier', 'waiter', 'chef']);

export const staffListQuerySchema = z.object({
  role: staffRoleSchema.optional(),
  active: z.enum(['true', 'false']).optional(),
});

export const staffIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const staffCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  password: z.string().min(8).max(200),
  role: staffRoleSchema,
  pin: z.string().regex(/^\d{4,6}$/).optional().nullable(),
});

export const staffUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().email().max(200).optional().nullable(),
    password: z.string().min(8).max(200).optional(),
    role: staffRoleSchema.optional(),
    pin: z.string().regex(/^\d{4,6}$/).optional().nullable(),
  })
  .strict();
