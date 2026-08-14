/**
 * Phase 2.18 — stronger synthetic retail-test architecture validation.
 *
 * Proves shared commerce can be composed without Restaurant modules.
 * Does NOT enable production Retail, VERTICALS, or tenant switching.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/synthetic-retail-composition.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  ACTIVE_VERTICAL_ID,
  MODULE_CATALOG,
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  SYNTHETIC_VERTICALS,
  VERTICALS,
  getCompositionSnapshot,
  getPlatformCompositionResponse,
  isModuleEnabled,
  validateRegistryIntegrity,
  validateVerticalDependencies,
  verticalIdForBusinessType,
} from '../main/modules';
import type { ModuleId } from '../main/modules';

const RESTAURANT_ONLY: readonly ModuleId[] = ['tables', 'kitchen', 'kds', 'menu', 'addons'];

const REQUIRED_RETAIL: readonly ModuleId[] = [
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
];

function main(): void {
  console.log('Phase 2.18 Synthetic Retail Composition');
  console.log('='.repeat(60));

  assert.equal(ACTIVE_VERTICAL_ID, 'restaurant');
  assert.equal(VERTICALS.length, 2);
  assert.ok(VERTICALS.some((v) => v.id === 'restaurant'));
  assert.ok(VERTICALS.some((v) => v.id === 'retail'));
  assert.ok(!VERTICALS.some((v) => v.id === 'retail-test'));
  assert.ok(SYNTHETIC_VERTICALS.some((v) => v.id === OPERVIA_RETAIL_TEST_VERTICAL_ID));
  assert.equal(verticalIdForBusinessType('retail'), 'retail');
  assert.equal(verticalIdForBusinessType('retail-test'), 'restaurant');
  const api = getPlatformCompositionResponse();
  assert.equal(api.verticalId, 'restaurant');
  console.log('   ✓ retail-test remains synthetic; VERTICALS include restaurant + retail');

  const retail = getCompositionSnapshot({ verticalId: 'retail-test' });
  assert.equal(retail.vertical.id, 'retail-test');
  assert.deepEqual([...OPERVIA_RETAIL_TEST_ENABLED_MODULES].sort(), [...REQUIRED_RETAIL].sort());
  for (const id of REQUIRED_RETAIL) {
    assert.ok(retail.modules.enabled.includes(id), `retail-test includes ${id}`);
  }
  for (const id of RESTAURANT_ONLY) {
    assert.ok(!retail.modules.enabled.includes(id), `retail-test excludes ${id}`);
    assert.equal(isModuleEnabled(id, 'retail-test'), false);
  }
  assert.equal(retail.dependencies.valid, true);
  assert.equal(retail.diagnostics.valid, true);
  console.log('   ✓ retail-test composition is shared-only and dep-valid');

  const restaurant = getCompositionSnapshot({ verticalId: 'restaurant' });
  for (const id of RESTAURANT_ONLY) {
    assert.ok(restaurant.modules.enabled.includes(id));
  }
  assert.equal(isModuleEnabled('tables', 'restaurant'), true);
  assert.equal(isModuleEnabled('kds', 'restaurant'), true);
  console.log('   ✓ restaurant still enables tables/kds/kitchen/menu/addons');

  const integrity = validateRegistryIntegrity();
  assert.equal(integrity.valid, true);
  const retailDeps = validateVerticalDependencies('retail-test');
  assert.equal(retailDeps.valid, true);
  assert.ok(MODULE_CATALOG.length === 22);
  console.log('   ✓ registry integrity + 22 modules unchanged');

  const a = getCompositionSnapshot({ verticalId: 'retail-test' });
  const b = getCompositionSnapshot({ verticalId: 'retail-test' });
  assert.deepEqual(a, b);
  console.log('   ✓ retail-test snapshot deterministic');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.18 synthetic retail composition passed');
}

main();
