/**
 * Opervia Restaurant vertical — declarative composition of Phase 1 modules.
 */
import type { ModuleId, VerticalDefinition } from './types';

export const OPERVIA_RESTAURANT_VERTICAL_ID = 'restaurant';

/**
 * Modules enabled for Opervia Restaurant (Phase 1 product).
 * Order is documentation-friendly; enablement is a set.
 */
export const OPERVIA_RESTAURANT_ENABLED_MODULES: readonly ModuleId[] = [
  'core',
  'customer',
  'product',
  'category',
  'inventory',
  'pos',
  'order',
  'payment',
  'refund',
  'tax',
  'shift',
  'staff',
  'loyalty',
  'reporting',
  'printing',
  'notification',
  'backup',
  'tables',
  'kitchen',
  'kds',
  'menu',
  'addons',
] as const;

export const OPERVIA_RESTAURANT_VERTICAL: VerticalDefinition = {
  id: OPERVIA_RESTAURANT_VERTICAL_ID,
  name: 'Opervia Restaurant',
  version: '1.0.0',
  enabledModules: [...OPERVIA_RESTAURANT_ENABLED_MODULES],
  description:
    'Phase 1 café/restaurant POS vertical. Shared commerce modules plus tables, kitchen, KDS, menu, and addons.',
};

/** Only vertical active in Phase 2.1 — maps 1:1 with business_type=restaurant. */
export const ACTIVE_VERTICAL_ID = OPERVIA_RESTAURANT_VERTICAL_ID;

export const VERTICALS: readonly VerticalDefinition[] = [OPERVIA_RESTAURANT_VERTICAL];
