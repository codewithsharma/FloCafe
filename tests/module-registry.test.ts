/**
 * Phase 2.1 — Opervia module registry + Restaurant vertical contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/module-registry.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  MODULE_IDS,
  listModules,
  getModule,
  isModuleEnabled,
  getEnabledModules,
  getVerticalDefinition,
  getActiveVerticalId,
  isFeatureAvailable,
  getModuleDependencies,
  getRouteModuleMap,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  ACTIVE_VERTICAL_ID,
  resolveActiveVerticalIdFromConfigModule,
} from '../main/modules';

function main(): void {
  console.log('Phase 2.1 Module Registry + Restaurant Vertical');
  console.log('='.repeat(60));

  // ── Registry ──────────────────────────────────────────────────────
  const modules = listModules();
  assert.ok(modules.length >= 20, `expected ≥20 modules, got ${modules.length}`);

  const ids = modules.map((m) => m.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'module IDs must be unique');

  for (const required of [
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
  ] as const) {
    assert.ok(ids.includes(required), `registry includes ${required}`);
    const mod = getModule(required);
    assert.ok(mod, `getModule(${required})`);
    assert.equal(typeof mod!.name, 'string');
    assert.ok(mod!.name.length > 0, `${required} has name`);
    assert.equal(typeof mod!.version, 'string');
    assert.ok(mod!.version.length > 0, `${required} has version`);
    assert.ok(Array.isArray(mod!.dependencies), `${required} has dependencies array`);
  }

  assert.deepEqual([...MODULE_IDS].sort(), [...ids].sort(), 'MODULE_IDS matches catalog');
  console.log('   ✓ registry metadata');

  // ── Restaurant vertical ───────────────────────────────────────────
  assert.equal(getActiveVerticalId(), OPERVIA_RESTAURANT_VERTICAL_ID);
  // Turbopack may resolve registry's lazy require('./vertical-config') to a module
  // that does not export getCommittedActiveVerticalId → "t is not a function" in UI.
  assert.equal(
    resolveActiveVerticalIdFromConfigModule({}),
    ACTIVE_VERTICAL_ID,
    'missing getCommittedActiveVerticalId falls back (browser mis-resolve)',
  );
  assert.equal(
    resolveActiveVerticalIdFromConfigModule(null),
    ACTIVE_VERTICAL_ID,
    'null config module falls back',
  );
  assert.equal(
    resolveActiveVerticalIdFromConfigModule({
      getCommittedActiveVerticalId: () => 'retail',
    }),
    'retail',
    'valid committed resolver is used',
  );
  const vertical = getVerticalDefinition();
  assert.equal(vertical.id, 'restaurant');
  assert.ok(
    vertical.name.toLowerCase().includes('restaurant'),
    'vertical name mentions Restaurant',
  );
  assert.ok(Array.isArray(vertical.enabledModules));
  assert.ok(vertical.enabledModules.includes('core'));
  assert.ok(vertical.enabledModules.includes('customer'));
  assert.ok(vertical.enabledModules.includes('kds'));
  assert.ok(vertical.enabledModules.includes('tables'));
  assert.ok(vertical.enabledModules.includes('kitchen'));
  assert.ok(vertical.enabledModules.includes('addons'));

  const enabled = getEnabledModules();
  assert.ok(enabled.includes('payment'));
  assert.ok(enabled.includes('refund'));
  assert.ok(!enabled.includes('barcode' as never) || !isModuleEnabled('barcode' as never));
  console.log('   ✓ restaurant vertical');

  // ── Lookup ────────────────────────────────────────────────────────
  assert.equal(isModuleEnabled('customer'), true);
  assert.equal(isModuleEnabled('inventory'), true);
  assert.equal(isModuleEnabled('kds'), true);
  assert.equal(isModuleEnabled('tables'), true);
  assert.equal(isModuleEnabled('barcode' as never), false);
  assert.equal(isModuleEnabled('appointments' as never), false);
  console.log('   ✓ module lookup');

  // ── Dependencies (metadata only) ──────────────────────────────────
  const kdsDeps = getModuleDependencies('kds');
  assert.ok(kdsDeps.includes('order'), 'kds depends on order');
  assert.ok(
    kdsDeps.includes('kitchen') || kdsDeps.includes('product'),
    'kds has kitchen or product dep',
  );
  const tablesDeps = getModuleDependencies('tables');
  assert.ok(tablesDeps.includes('order'), 'tables depends on order');
  console.log('   ✓ dependency metadata');

  // ── Feature flags relationship ────────────────────────────────────
  assert.equal(isFeatureAvailable('kds', true), true);
  assert.equal(isFeatureAvailable('kds', false), false);
  assert.equal(isFeatureAvailable('tables', true), true);
  assert.equal(isFeatureAvailable('tables', false), false);
  assert.equal(isFeatureAvailable('tax', true), true);
  assert.equal(isFeatureAvailable('tax', false), false);
  assert.equal(isFeatureAvailable('shift', false), false);
  assert.equal(isFeatureAvailable('loyalty', true), true);
  assert.equal(isFeatureAvailable('barcode' as never, true), false);
  console.log('   ✓ module + flag availability');

  // ── Route map (descriptive) ───────────────────────────────────────
  const routeMap = getRouteModuleMap();
  assert.ok(
    routeMap['/api/customers'] === 'customer' ||
      routeMap['/customers'] === 'customer' ||
      Object.values(routeMap).includes('customer'),
    'route map mentions customer',
  );
  assert.ok(Object.values(routeMap).includes('kds'), 'route map mentions kds');
  console.log('   ✓ descriptive route map');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.1 module registry contracts passed');
}

main();
