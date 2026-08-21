/**
 * R5 — Recipes / BOM client (`/api/recipes`).
 */
import api from './api';

export interface Recipe {
  id: string;
  product_id: string;
  name: string;
  yield_qty: number;
  yield_unit: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_product_id: string;
  quantity: number;
  unit: string;
  prep_loss_bps: number;
  position: number;
  ingredient_name?: string;
  inventory_unit?: string;
}

export interface RecipeCostResult {
  status: 'ok' | 'insufficient_data';
  batchCostCents: number | null;
  portionCostCents: number | null;
  foodCostPercent: number | null;
  sellingPriceCents: number | null;
  missingCostIngredientIds: string[];
  recipeId?: string;
  productId?: string;
  yieldQty?: number;
}

export interface RecipeIngredientInput {
  ingredient_product_id: string;
  quantity: number;
  unit: string;
  prep_loss_bps?: number;
  position?: number;
}

export async function listRecipes(
  signal?: AbortSignal,
): Promise<Array<Recipe & { ingredients?: RecipeIngredient[] }>> {
  const { data } = await api.get<{ recipes: Array<Recipe & { ingredients?: RecipeIngredient[] }> }>(
    '/recipes',
    { signal },
  );
  return data.recipes || [];
}

export async function getRecipe(
  id: string,
  signal?: AbortSignal,
): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] }> {
  const { data } = await api.get<{ recipe: Recipe; ingredients: RecipeIngredient[] }>(
    `/recipes/${id}`,
    { signal },
  );
  return { recipe: data.recipe, ingredients: data.ingredients || [] };
}

export async function createRecipe(body: {
  product_id: string;
  name: string;
  yield_qty?: number;
  yield_unit?: string;
  ingredients?: RecipeIngredientInput[];
}): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] }> {
  const { data } = await api.post<{ recipe: Recipe; ingredients: RecipeIngredient[] }>(
    '/recipes',
    body,
  );
  return data;
}

export async function updateRecipe(
  id: string,
  body: { name?: string; yield_qty?: number; yield_unit?: string },
): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] }> {
  const { data } = await api.patch<{ recipe: Recipe; ingredients: RecipeIngredient[] }>(
    `/recipes/${id}`,
    body,
  );
  return data;
}

export async function replaceRecipeIngredients(
  id: string,
  ingredients: RecipeIngredientInput[],
): Promise<RecipeIngredient[]> {
  const { data } = await api.put<{ ingredients: RecipeIngredient[] }>(
    `/recipes/${id}/ingredients`,
    { ingredients },
  );
  return data.ingredients || [];
}

export async function setRecipeActive(id: string, active: boolean): Promise<Recipe> {
  const path = active ? `/recipes/${id}/activate` : `/recipes/${id}/deactivate`;
  const { data } = await api.post<{ recipe: Recipe }>(path, {});
  return data.recipe;
}

export async function getRecipeCost(id: string, signal?: AbortSignal): Promise<RecipeCostResult> {
  const { data } = await api.get<RecipeCostResult>(`/recipes/${id}/cost`, { signal });
  return data;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return (cents / 100).toFixed(2);
}

/** RCP-05 — historical recipe consumption rows from GET /api/recipes/consumptions */
export interface RecipeConsumptionLine {
  id: number;
  consumption_id: string;
  ingredient_product_id: string;
  ingredient_name: string | null;
  quantity_delta: number;
  unit: string;
  unit_cost_cents: number | null;
  line_cost_cents: number | null;
  inventory_movement_id: number | null;
  created_at: string;
}

export interface RecipeConsumption {
  id: string;
  order_id: string;
  order_item_id: number;
  recipe_id: string;
  recipe_name: string;
  menu_product_id: string;
  portions: number;
  yield_qty: number;
  status: 'consumed' | 'reversed';
  actor_user_id: string | null;
  created_at: string;
  reversed_at: string | null;
  lines?: RecipeConsumptionLine[];
}

export async function listRecipeConsumptions(opts?: {
  orderId?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<RecipeConsumption[]> {
  const params: Record<string, string | number> = {};
  const orderId = opts?.orderId?.trim();
  if (orderId) params.order_id = orderId;
  if (opts?.limit !== undefined) params.limit = opts.limit;
  const { data } = await api.get<{ consumptions: RecipeConsumption[] }>('/recipes/consumptions', {
    params,
    signal: opts?.signal,
  });
  return data.consumptions || [];
}
