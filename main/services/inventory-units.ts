/**
 * R4 Inventory OS — inventory unit allowlist and same-family conversion.
 * Count units (pcs/box/pack) do not cross-convert. Mass and volume use
 * integer milli-units internally to limit float drift.
 */

import { InventoryServiceError } from './inventory';

export const ALLOWED_INVENTORY_UNITS = ['pcs', 'box', 'pack', 'kg', 'g', 'L', 'ml'] as const;
export type InventoryUnit = (typeof ALLOWED_INVENTORY_UNITS)[number];

export const WASTAGE_REASONS = ['SPOILAGE', 'DAMAGED', 'EXPIRED', 'SPILLAGE', 'OTHER'] as const;
export type WastageReason = (typeof WASTAGE_REASONS)[number];

const COUNT_UNITS = new Set<string>(['pcs', 'box', 'pack']);
const MASS_UNITS = new Set<string>(['kg', 'g']);
const VOLUME_UNITS = new Set<string>(['L', 'ml']);

function familyOf(unit: string): 'count' | 'mass' | 'volume' | null {
  if (COUNT_UNITS.has(unit)) return 'count';
  if (MASS_UNITS.has(unit)) return 'mass';
  if (VOLUME_UNITS.has(unit)) return 'volume';
  return null;
}

export function isAllowedInventoryUnit(unit: string): unit is InventoryUnit {
  return (ALLOWED_INVENTORY_UNITS as readonly string[]).includes(unit);
}

/** Throws InventoryServiceError(400) on unknown or cross-dimension units. */
export function assertCompatibleUnits(from: string, to: string): void {
  if (!isAllowedInventoryUnit(from) || !isAllowedInventoryUnit(to)) {
    throw new InventoryServiceError(400, `Unknown inventory unit: ${from} → ${to}`);
  }
  if (from === to) return;

  const fromFamily = familyOf(from);
  const toFamily = familyOf(to);
  if (!fromFamily || !toFamily || fromFamily !== toFamily) {
    throw new InventoryServiceError(
      400,
      `Incompatible inventory units: cannot convert ${from} to ${to}`,
    );
  }
  // Count family: 1:1 only when units are identical (already returned above).
  if (fromFamily === 'count') {
    throw new InventoryServiceError(
      400,
      `Incompatible inventory units: cannot convert ${from} to ${to}`,
    );
  }
}

/**
 * Convert quantity between compatible units.
 * Mass/volume use integer milli-units (mg / µL) internally.
 */
export function convertQuantity(amount: number, from: string, to: string): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new InventoryServiceError(400, 'quantity must be a finite number');
  }
  assertCompatibleUnits(from, to);
  if (from === to) return amount;

  if (MASS_UNITS.has(from) && MASS_UNITS.has(to)) {
    const milligrams = from === 'kg' ? Math.round(amount * 1_000_000) : Math.round(amount * 1_000);
    return to === 'kg' ? milligrams / 1_000_000 : milligrams / 1_000;
  }

  if (VOLUME_UNITS.has(from) && VOLUME_UNITS.has(to)) {
    const microliters = from === 'L' ? Math.round(amount * 1_000_000) : Math.round(amount * 1_000);
    return to === 'L' ? microliters / 1_000_000 : microliters / 1_000;
  }

  throw new InventoryServiceError(
    400,
    `Incompatible inventory units: cannot convert ${from} to ${to}`,
  );
}
