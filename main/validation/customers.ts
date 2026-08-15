/**
 * Customer / CRM HTTP validation (R7).
 */

import { z } from 'zod';

const emailField = z
  .union([z.string().trim().email().max(200), z.literal('')])
  .optional()
  .nullable();

export const customerIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const customerNoteIdParamsSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
});

export const customerListQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    filter: z.enum(['invalid_phones']).optional(),
    segment: z.enum(['new', 'returning', 'loyal', 'high_value', 'inactive', 'frequent']).optional(),
    sort: z.enum(['name', 'phone', 'visits', 'spent', 'loyalty', 'last_visit']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    include_inactive: z.enum(['true', 'false']).optional(),
    per_page: z.string().regex(/^\d+$/).optional(),
  })
  .passthrough();

export const customerCreateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(40).optional().nullable(),
    email: emailField,
    address: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    country_code: z.string().trim().max(8).optional().nullable(),
  })
  .passthrough();

export const customerUpdateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(40).optional().nullable(),
    email: emailField,
    address: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    country_code: z.string().trim().max(8).optional().nullable(),
  })
  .passthrough();

export const customerNoteBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const customerSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const crmLookupQuerySchema = z.object({
  phone: z.string().min(1).max(40),
});
