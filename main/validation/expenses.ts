/**
 * R9 Slice 1 — Expenses validation (integer cents).
 */

import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'supplies',
  'rent',
  'utilities',
  'wages',
  'maintenance',
  'marketing',
  'transport',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const amountCents = z.number().int().positive().max(1_000_000_000_000);
const expenseDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expense_date must be YYYY-MM-DD');

export const expenseCreateBodySchema = z.object({
  amount_cents: amountCents,
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(500).optional().default(''),
  notes: z.string().trim().max(2000).nullable().optional(),
  expense_date: expenseDate,
});

export const expenseUpdateBodySchema = z
  .object({
    amount_cents: amountCents.optional(),
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    description: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    expense_date: expenseDate.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  });

export const expenseVoidBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const expenseListQuerySchema = z.object({
  status: z.enum(['posted', 'voided', 'all']).optional().default('posted'),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  date_from: expenseDate.optional(),
  date_to: expenseDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

export const expenseIdParamsSchema = z.object({
  id: z.string().min(1).max(128),
});
