/**
 * R5 — deterministic recipe costing (integer cents).
 * Separates inventory quantity precision from currency precision.
 */

import { convertQuantity } from './inventory-units';

export type RecipeCostStatus = 'ok' | 'insufficient_data';

export interface RecipeCostIngredientInput {
  quantity: number;
  unit: string;
  prep_loss_bps: number;
  inventoryUnit: string;
  /** Catalog unit cost in integer cents; null if missing/unknown. */
  unitCostCents: number | null;
  ingredientProductId?: string;
  name?: string;
}

export interface RecipeIngredientCostLine {
  ingredientProductId?: string;
  name?: string;
  batchQuantity: number;
  inventoryUnit: string;
  unitCostCents: number | null;
  lineCostCents: number | null;
  contributionBps: number | null;
}

export interface RecipeCostResult {
  status: RecipeCostStatus;
  batchCostCents: number | null;
  portionCostCents: number | null;
  foodCostPercent: number | null;
  sellingPriceCents: number | null;
  missingCostIngredientIds: string[];
  lines: RecipeIngredientCostLine[];
}

/** Prefer dual-write cost_cents when present; else REAL cost → cents. Null when unavailable. */
export function preferProductCostCents(costCents: unknown, cost: unknown): number | null {
  if (costCents != null && costCents !== '' && Number.isFinite(Number(costCents))) {
    return Math.trunc(Number(costCents));
  }
  return toCostCents(cost);
}

/** Convert catalog REAL cost to integer cents. Null when unavailable. */
export function toCostCents(cost: unknown): number | null {
  if (cost === null || cost === undefined || cost === '') return null;
  const n = typeof cost === 'number' ? cost : Number(cost);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Convert selling price REAL to integer cents. */
export function toPriceCents(price: unknown): number | null {
  if (price === null || price === undefined || price === '') return null;
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Quantity with prep loss (bps) applied. */
export function quantityWithLoss(quantity: number, prepLossBps: number): number {
  const bps = Math.max(0, Math.min(10_000, Math.trunc(prepLossBps || 0)));
  // milli-scale: qty * (10000 + bps) / 10000
  return (quantity * (10_000 + bps)) / 10_000;
}

/** Batch ingredient qty converted into the ingredient's inventory unit. */
export function batchQtyInInventoryUnit(
  quantity: number,
  unit: string,
  prepLossBps: number,
  inventoryUnit: string,
): number {
  const withLoss = quantityWithLoss(quantity, prepLossBps);
  return convertQuantity(withLoss, unit, inventoryUnit);
}

/**
 * Portion consume qty in inventory unit for `portions` sold against recipe yield.
 */
export function portionConsumeQty(
  batchQuantity: number,
  unit: string,
  prepLossBps: number,
  inventoryUnit: string,
  yieldQty: number,
  portions: number,
): number {
  if (!(yieldQty > 0) || !(portions > 0)) {
    throw new Error('yield_qty and portions must be positive');
  }
  const batchInv = batchQtyInInventoryUnit(batchQuantity, unit, prepLossBps, inventoryUnit);
  // Scale via milli-units of the inventory quantity to reduce float drift.
  const milli = Math.round(batchInv * 1_000_000);
  const scaled = Math.round((milli * portions) / yieldQty);
  return scaled / 1_000_000;
}

function lineCostCents(qty: number, unitCostCents: number | null): number | null {
  if (unitCostCents === null) return null;
  // qty may be fractional; cost in milli-cents then round
  return Math.round(qty * unitCostCents);
}

/**
 * Compute batch/portion recipe cost and food-cost %.
 * Never fabricates 0 when cost data is missing — returns insufficient_data.
 */
export function computeRecipeCost(
  ingredients: RecipeCostIngredientInput[],
  yieldQty: number,
  sellingPriceCents: number | null,
): RecipeCostResult {
  const missing: string[] = [];
  const lines: RecipeIngredientCostLine[] = [];
  let batchSum = 0;
  let allCostsPresent = ingredients.length > 0;

  if (!(yieldQty > 0)) {
    return {
      status: 'insufficient_data',
      batchCostCents: null,
      portionCostCents: null,
      foodCostPercent: null,
      sellingPriceCents,
      missingCostIngredientIds: [],
      lines: [],
    };
  }

  if (ingredients.length === 0) {
    return {
      status: 'insufficient_data',
      batchCostCents: null,
      portionCostCents: null,
      foodCostPercent: null,
      sellingPriceCents,
      missingCostIngredientIds: [],
      lines: [],
    };
  }

  for (const ing of ingredients) {
    const batchQuantity = batchQtyInInventoryUnit(
      ing.quantity,
      ing.unit,
      ing.prep_loss_bps,
      ing.inventoryUnit,
    );
    const lc = lineCostCents(batchQuantity, ing.unitCostCents);
    if (lc === null) {
      allCostsPresent = false;
      if (ing.ingredientProductId) missing.push(ing.ingredientProductId);
    } else {
      batchSum += lc;
    }
    lines.push({
      ingredientProductId: ing.ingredientProductId,
      name: ing.name,
      batchQuantity,
      inventoryUnit: ing.inventoryUnit,
      unitCostCents: ing.unitCostCents,
      lineCostCents: lc,
      contributionBps: null,
    });
  }

  if (!allCostsPresent) {
    return {
      status: 'insufficient_data',
      batchCostCents: null,
      portionCostCents: null,
      foodCostPercent: null,
      sellingPriceCents,
      missingCostIngredientIds: missing,
      lines,
    };
  }

  const portionCostCents = Math.round(batchSum / yieldQty);
  for (const line of lines) {
    if (line.lineCostCents != null && batchSum > 0) {
      line.contributionBps = Math.round((line.lineCostCents * 10_000) / batchSum);
    }
  }

  let foodCostPercent: number | null = null;
  if (sellingPriceCents != null && sellingPriceCents > 0) {
    foodCostPercent = Math.round((portionCostCents * 10_000) / sellingPriceCents) / 100;
  } else if (sellingPriceCents === 0) {
    foodCostPercent = null; // explicit zero price → insufficient for %
  }

  return {
    status: 'ok',
    batchCostCents: batchSum,
    portionCostCents,
    foodCostPercent,
    sellingPriceCents,
    missingCostIngredientIds: [],
    lines,
  };
}
