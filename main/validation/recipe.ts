/**
 * R5 recipe HTTP body schemas.
 */

import { z } from 'zod';
import { ALLOWED_INVENTORY_UNITS } from '../services/inventory-units';

export const recipeIngredientSchema = z.object({
  ingredient_product_id: z.string().min(1),
  quantity: z.number().finite().positive(),
  unit: z.enum(ALLOWED_INVENTORY_UNITS),
  prep_loss_bps: z.number().int().min(0).max(10_000).optional(),
  position: z.number().int().min(0).optional(),
});

export const recipeCreateBodySchema = z.object({
  product_id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  yield_qty: z.number().finite().positive().optional(),
  yield_unit: z.enum(ALLOWED_INVENTORY_UNITS).optional(),
  is_active: z.boolean().optional(),
  ingredients: z.array(recipeIngredientSchema).optional(),
});

export const recipeUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  yield_qty: z.number().finite().positive().optional(),
  yield_unit: z.enum(ALLOWED_INVENTORY_UNITS).optional(),
});

export const recipeIngredientsReplaceBodySchema = z.object({
  ingredients: z.array(recipeIngredientSchema),
});

/** ADR-015 / ROPS-RWASTE v1 */
export const recipeWasteBodySchema = z.object({
  portions: z.number().finite().positive().max(1_000_000),
  wastage_reason: z.enum(['SPOILAGE', 'DAMAGED', 'EXPIRED', 'SPILLAGE', 'OTHER']),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type RecipeCreateBody = z.infer<typeof recipeCreateBodySchema>;
export type RecipeUpdateBody = z.infer<typeof recipeUpdateBodySchema>;
export type RecipeWasteBody = z.infer<typeof recipeWasteBodySchema>;
