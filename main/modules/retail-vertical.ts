/**
 * OPERAVIA Retail — production vertical (Phase 3.3).
 * Core commerce composition without restaurant modules.
 * Distinct from synthetic retail-test (fixtures/).
 */
import type { VerticalDefinition } from './types';
import { OPERVIA_SHARED_COMMERCE_MODULES } from './shared-commerce-modules';

export const OPERVIA_RETAIL_VERTICAL_ID = 'retail';

export const OPERVIA_RETAIL_ENABLED_MODULES = OPERVIA_SHARED_COMMERCE_MODULES;

export const OPERVIA_RETAIL_VERTICAL: VerticalDefinition = {
  id: OPERVIA_RETAIL_VERTICAL_ID,
  name: 'OPERAVIA Retail',
  version: '1.0.0',
  enabledModules: [...OPERVIA_RETAIL_ENABLED_MODULES],
  description:
    'Production retail POS vertical. Shared Core commerce modules only — no tables, kitchen, KDS, menu, or addons.',
};
