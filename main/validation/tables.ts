/**
 * Tables HTTP validation (Foundation Phase 2 Zod expansion).
 */

import { z } from 'zod';

export const tableStatusSchema = z.enum([
  'available',
  'occupied',
  'reserved',
  'cleaning',
  'held',
]);

export const tableIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const tableListQuerySchema = z
  .object({
    status: tableStatusSchema.optional(),
    floor: z.string().max(80).optional(),
    section: z.string().max(80).optional(),
    kitchen_station_id: z.string().min(1).optional(),
    assigned_waiter_id: z.string().min(1).optional(),
    active: z.enum(['true', '1', 'false', '0']).optional(),
  })
  .passthrough();

export const tableUpsertBodySchema = z
  .object({
    number: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(),
    capacity: z.number().int().positive().max(500).optional(),
    floor: z.string().max(80).nullable().optional(),
    section: z.string().max(80).nullable().optional(),
    position_x: z.number().finite().nullable().optional(),
    position_y: z.number().finite().nullable().optional(),
    kitchen_station_id: z.string().min(1).nullable().optional(),
  })
  .passthrough();

export const tableMoveOrderBodySchema = z
  .object({
    target_table_id: z.string().min(1),
    order_id: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const tableMergeBodySchema = z
  .object({
    source_table_id: z.string().min(1),
  })
  .passthrough();

export const tableSplitBodySchema = z
  .object({
    target_table_id: z.string().min(1),
    order_item_ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
  })
  .passthrough();

export const tableAssignWaiterBodySchema = z
  .object({
    waiter_user_id: z.union([z.string().min(1), z.null()]).optional(),
  })
  .passthrough();

export const tableStatusBodySchema = z.object({
  status: tableStatusSchema,
});
