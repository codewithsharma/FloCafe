/**
 * Opervia Restaurant vertical — declarative composition of Phase 1 modules.
 * Production Retail lives in retail-vertical.ts (Phase 3.3).
 */
import type { ModuleId, VerticalDefinition } from './types';
import { OPERVIA_SHARED_COMMERCE_MODULES } from './shared-commerce-modules';
import { OPERVIA_RETAIL_VERTICAL } from './retail-vertical';

export const OPERVIA_RESTAURANT_VERTICAL_ID = 'restaurant';

/**
 * Modules enabled for Opervia Restaurant (Phase 1 product).
 * Shared commerce + restaurant-only stack.
 */
export const OPERVIA_RESTAURANT_ENABLED_MODULES: readonly ModuleId[] = [
  ...OPERVIA_SHARED_COMMERCE_MODULES,
  'tables',
  'kitchen',
  'kds',
  'menu',
  'addons',
] as const;

export const OPERVIA_RESTAURANT_VERTICAL: VerticalDefinition = {
  id: OPERVIA_RESTAURANT_VERTICAL_ID,
  name: 'OPERAVIA Restaurant',
  version: '1.0.0',
  enabledModules: [...OPERVIA_RESTAURANT_ENABLED_MODULES],
  description:
    'Phase 1 café/restaurant POS vertical. Shared commerce modules plus tables, kitchen, KDS, menu, and addons.',
};

/** Compile-time default when ACTIVE_VERTICAL_ID env is unset (Phase 3.2). */
export const ACTIVE_VERTICAL_ID = OPERVIA_RESTAURANT_VERTICAL_ID;

/** Production verticals (deploy/start selectable). Default remains restaurant. */
export const VERTICALS: readonly VerticalDefinition[] = [
  OPERVIA_RESTAURANT_VERTICAL,
  OPERVIA_RETAIL_VERTICAL,
];
