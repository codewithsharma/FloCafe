/**
 * KDS / kitchen-station HTTP validation (Foundation Phase 2).
 */

import { z } from 'zod';

export const kdsItemStatusSchema = z.enum(['pending', 'preparing', 'ready', 'served']);

export const kdsStationQuerySchema = z
  .object({
    station_id: z.string().min(1).optional(),
  })
  .passthrough();

export const kdsPairingBodySchema = z
  .object({
    station_id: z.string().min(1).optional().nullable(),
  })
  .passthrough();

export const kdsItemStatusBodySchema = z
  .object({
    status: kdsItemStatusSchema,
    expected_status: kdsItemStatusSchema.optional(),
  })
  .passthrough();

export const kdsPriorityBodySchema = z.object({
  priority: z.number().int().min(0).max(9),
});

export const kitchenStationIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const kitchenStationUpsertBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(1000).nullable().optional(),
    category_ids: z.array(z.string().min(1)).max(200).optional().nullable(),
    printer_id: z.string().min(1).nullable().optional(),
    printer_ip: z.string().max(80).nullable().optional(),
    printer_port: z.number().int().min(1).max(65535).optional(),
    printer_name: z.string().max(200).nullable().optional(),
    sort_order: z.number().int().min(0).max(100000).optional(),
    is_active: z.union([z.boolean(), z.number().int()]).optional(),
  })
  .passthrough();

export const kitchenStationUsersBodySchema = z.object({
  user_ids: z.array(z.string().min(1).max(128)).max(100),
});
