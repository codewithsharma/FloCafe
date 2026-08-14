/**
 * Phase 2.5 / 2.18 — synthetic non-production Retail Test vertical.
 *
 * Architecture validation only. NOT Opervia Retail.
 * Production Retail is `retail` in VERTICALS (Phase 3.3).
 * May still be selected via ACTIVE_VERTICAL_ID=retail-test for synthetic checks.
 */
import type { VerticalDefinition } from '../types';
import { OPERVIA_SHARED_COMMERCE_MODULES } from '../shared-commerce-modules';

export const OPERVIA_RETAIL_TEST_VERTICAL_ID = 'retail-test';

/**
 * Same shared commerce modules as production Retail — composition fixture only.
 */
export const OPERVIA_RETAIL_TEST_ENABLED_MODULES = OPERVIA_SHARED_COMMERCE_MODULES;

export const OPERVIA_RETAIL_TEST_VERTICAL: VerticalDefinition = {
  id: OPERVIA_RETAIL_TEST_VERTICAL_ID,
  name: 'Opervia Retail Test',
  version: '0.0.0-test',
  enabledModules: [...OPERVIA_RETAIL_TEST_ENABLED_MODULES],
  description:
    'Synthetic composition fixture (Phase 2.5/2.18). Proves shared modules can be composed without tables/kitchen/KDS/menu/addons. Not a production vertical — use `retail` for production.',
};

/** Non-production vertical fixtures — looked up by id, never the compile-time default. */
export const SYNTHETIC_VERTICALS: readonly VerticalDefinition[] = [OPERVIA_RETAIL_TEST_VERTICAL];
