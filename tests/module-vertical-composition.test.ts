/**
 * Phase 2.5 — multi-vertical composition validation (synthetic retail-test).
 *
 * Proves shared modules can be composed into Restaurant and a non-production
 * Retail Test vertical without duplicating implementations.
 * Soft diagnostics remain non-throwing for valid verticals.
 * Fail-closed remount / unknown-vertical throw: Phase 3.1 (`fail-closed-remount.test.ts`).
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/module-vertical-composition.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  ACTIVE_VERTICAL_ID,
  MODULE_CATALOG,
  OPERVIA_RESTAURANT_ENABLED_MODULES,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL,
  VERTICALS,
  getActiveVerticalId,
  getCompositionSnapshot,
  getModule,
  getPlatformCompositionResponse,
  getVerticalDefinition,
  isModuleEnabled,
  validateEnabledSetDependencies,
  validateRegistryIntegrity,
  validateVerticalDependencies,
  verticalIdForBusinessType,
} from '../main/modules';
import type { ModuleId } from '../main/modules';

const RESTAURANT_ONLY: readonly ModuleId[] = ['tables', 'kitchen', 'kds', 'menu', 'addons'];

function intersection(a: readonly ModuleId[], b: readonly ModuleId[]): ModuleId[] {
  const bSet = new Set(b);
  return [...a].filter((id) => bSet.has(id)).sort();
}

function main(): void {
  console.log('Phase 2.5 Vertical Composition Validation');
  console.log('='.repeat(60));

  // ── Active production vertical unchanged ────────────────────────────────
  assert.equal(getActiveVerticalId(), 'restaurant');
  assert.equal(ACTIVE_VERTICAL_ID, OPERVIA_RESTAURANT_VERTICAL_ID);
  assert.equal(VERTICALS.length, 1);
  assert.equal(VERTICALS[0]!.id, 'restaurant');
  assert.ok(
    !VERTICALS.some((v) => v.id === OPERVIA_RETAIL_TEST_VERTICAL_ID),
    'retail-test must not be in production VERTICALS',
  );
  console.log('   ✓ production VERTICALS remain restaurant-only');

  // ── Restaurant composition ──────────────────────────────────────────────
  const restaurant = getCompositionSnapshot({ verticalId: 'restaurant' });
  assert.equal(restaurant.vertical.id, 'restaurant');
  assert.equal(restaurant.vertical.name, 'Opervia Restaurant');
  assert.deepEqual([...restaurant.modules.enabled], [...OPERVIA_RESTAURANT_ENABLED_MODULES].sort());
  for (const id of RESTAURANT_ONLY) {
    assert.ok(restaurant.modules.enabled.includes(id), `restaurant has ${id}`);
  }
  assert.equal(restaurant.dependencies.valid, true);
  assert.equal(restaurant.diagnostics.valid, true);
  console.log('   ✓ restaurant composition');

  // ── Synthetic retail-test composition ───────────────────────────────────
  assert.equal(OPERVIA_RETAIL_TEST_VERTICAL_ID, 'retail-test');
  assert.equal(OPERVIA_RETAIL_TEST_VERTICAL.name, 'Opervia Retail Test');
  const retail = getCompositionSnapshot({ verticalId: OPERVIA_RETAIL_TEST_VERTICAL_ID });
  assert.equal(retail.vertical.id, 'retail-test');
  assert.equal(retail.vertical.name, 'Opervia Retail Test');
  assert.deepEqual([...retail.modules.enabled], [...OPERVIA_RETAIL_TEST_ENABLED_MODULES].sort());
  for (const id of RESTAURANT_ONLY) {
    assert.ok(!retail.modules.enabled.includes(id), `retail-test excludes ${id}`);
  }
  assert.equal(retail.dependencies.valid, true);
  assert.equal(retail.diagnostics.valid, true);
  console.log('   ✓ retail-test composition (no restaurant-only modules)');

  // ── Shared module intersection (architectural reuse) ────────────────────
  const shared = intersection(restaurant.modules.enabled, retail.modules.enabled);
  const expectedShared = [...OPERVIA_RETAIL_TEST_ENABLED_MODULES].sort();
  assert.deepEqual(shared, expectedShared);
  for (const id of shared) {
    const mod = getModule(id);
    assert.ok(mod, `catalog entry for shared ${id}`);
    assert.ok(
      mod!.kind === 'core' || mod!.kind === 'shared',
      `${id} must be core/shared, got ${mod!.kind}`,
    );
  }
  assert.ok(shared.includes('customer'));
  assert.ok(shared.includes('product'));
  assert.ok(shared.includes('inventory'));
  assert.ok(shared.includes('pos'));
  assert.ok(shared.includes('payment'));
  assert.ok(shared.includes('tax'));
  assert.ok(shared.includes('staff'));
  assert.ok(shared.includes('reporting'));
  assert.ok(shared.includes('printing'));
  console.log('   ✓ shared module intersection (same ModuleIds, one catalog)');

  // ── Vertical differences ────────────────────────────────────────────────
  const restaurantOnlyPresent = RESTAURANT_ONLY.filter((id) =>
    restaurant.modules.enabled.includes(id),
  );
  assert.deepEqual([...restaurantOnlyPresent].sort(), [...RESTAURANT_ONLY].sort());
  assert.equal(isModuleEnabled('kds', 'restaurant'), true);
  assert.equal(isModuleEnabled('kds', 'retail-test'), false);
  assert.equal(isModuleEnabled('tables', 'retail-test'), false);
  assert.equal(isModuleEnabled('customer', 'retail-test'), true);
  console.log('   ✓ vertical-specific differences');

  // ── Dependency validation (soft) ────────────────────────────────────────
  const restaurantDeps = validateVerticalDependencies('restaurant');
  assert.equal(restaurantDeps.valid, true);
  const retailDeps = validateVerticalDependencies('retail-test');
  assert.equal(retailDeps.valid, true);
  assert.deepEqual(retailDeps.missing, []);

  const invalid = validateEnabledSetDependencies(['kds', 'order', 'product'] as ModuleId[]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missing.some((m) => m.module === 'kds' && m.dependency === 'kitchen'));
  assert.doesNotThrow(() => getCompositionSnapshot({ enabledModules: ['kds'] as ModuleId[] }));
  const invalidSnap = getCompositionSnapshot({
    enabledModules: ['kds', 'order', 'product'] as ModuleId[],
  });
  assert.equal(invalidSnap.diagnostics.valid, false);
  console.log('   ✓ soft dependency validation (valid + invalid, non-throwing)');

  // ── Registry integrity (production VERTICALS only) ──────────────────────
  const integrity = validateRegistryIntegrity();
  assert.equal(integrity.valid, true);
  assert.ok(MODULE_CATALOG.length >= 22);
  console.log('   ✓ registry integrity');

  // ── Deterministic snapshots ─────────────────────────────────────────────
  assert.deepEqual(
    getCompositionSnapshot({ verticalId: 'restaurant' }),
    getCompositionSnapshot({ verticalId: 'restaurant' }),
  );
  assert.deepEqual(
    getCompositionSnapshot({ verticalId: 'retail-test' }),
    getCompositionSnapshot({ verticalId: 'retail-test' }),
  );
  console.log('   ✓ deterministic snapshots');

  // ── Production contamination guards ─────────────────────────────────────
  assert.equal(verticalIdForBusinessType('restaurant'), 'restaurant');
  assert.equal(verticalIdForBusinessType('retail'), 'restaurant');
  assert.equal(verticalIdForBusinessType('retail-test'), 'restaurant');
  assert.equal(getVerticalDefinition().id, 'restaurant');
  const apiDefault = getPlatformCompositionResponse();
  assert.equal(apiDefault.verticalId, 'restaurant');
  assert.equal(apiDefault.verticalName, 'Opervia Restaurant');
  assert.ok(apiDefault.enabledModules.includes('kds'));
  console.log('   ✓ business_type / API default stay restaurant');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.5 vertical composition contracts passed');
}

main();
