/**
 * Shifts HTTP validation (Foundation Phase 2 — money-critical).
 */

import { z } from 'zod';

const moneyCents = z.number().int().min(0).max(1_000_000_000_000);

export const shiftIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const shiftListQuerySchema = z
  .object({
    terminal_id: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    opened_by_user_id: z.string().min(1).optional(),
    since: z.string().optional(),
    until: z.string().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .passthrough();

export const shiftOpenBodySchema = z
  .object({
    terminal_id: z.string().min(1).optional(),
    opening_float_cents: moneyCents,
    opening_note: z.string().max(1000).optional().nullable(),
  })
  .passthrough();

export const shiftCloseBodySchema = z
  .object({
    counted_cash_cents: moneyCents.optional().nullable(),
    closing_note: z.string().max(1000).optional().nullable(),
  })
  .passthrough();

export const shiftForceCloseBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    counted_cash_cents: moneyCents.optional().nullable(),
    closing_note: z.string().max(1000).optional().nullable(),
  })
  .passthrough();
