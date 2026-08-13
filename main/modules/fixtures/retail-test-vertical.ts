/**
 * Phase 2.5 / 2.18 — synthetic non-production Retail Test vertical.
 *
 * Architecture validation only. NOT Opervia Retail.
 * May be selected via ACTIVE_VERTICAL_ID=retail-test at deploy/start for composition
 * validation (Phase 3.2). Must never be the compile-time default or appear in
 * production VERTICALS (production Retail is Phase 3.3).
 */
import type { ModuleId, VerticalDefinition } from '../types';

export const OPERVIA_RETAIL_TEST_VERTICAL_ID = 'retail-test';

/**
 * Shared commerce modules without restaurant-only stack.
 * Same ModuleId catalog entries as Restaurant — composition differs, not implementations.
 */
export const OPERVIA_RETAIL_TEST_ENABLED_MODULES: readonly ModuleId[] = [
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
] as const;

export const OPERVIA_RETAIL_TEST_VERTICAL: VerticalDefinition = {
  id: OPERVIA_RETAIL_TEST_VERTICAL_ID,
  name: 'Opervia Retail Test',
  version: '0.0.0-test',
  enabledModules: [...OPERVIA_RETAIL_TEST_ENABLED_MODULES],
  description:
    'Synthetic composition fixture (Phase 2.5/2.18). Proves shared modules can be composed without tables/kitchen/KDS/menu/addons. Not a production vertical.',
};

/** Non-production vertical fixtures — looked up by id, never active by default. */
export const SYNTHETIC_VERTICALS: readonly VerticalDefinition[] = [OPERVIA_RETAIL_TEST_VERTICAL];
