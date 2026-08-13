/**
 * Phase 2.3 — Opervia read-only composition snapshot.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/module-composition.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RESTAURANT_ENABLED_MODULES,
  MODULE_CATALOG,
  getRouteModuleMap,
  getCompositionSnapshot,
  getPlatformCompositionResponse,
  validateRegistryIntegrity,
  getModuleDiagnosticsSnapshot,
} from '../main/modules';
import type { ModuleId } from '../main/modules';

function main(): void {
  console.log('Phase 2.3 Module Composition Snapshot');
  console.log('='.repeat(60));

  const snapshot = getCompositionSnapshot();
  assert.equal(snapshot.schemaVersion, '2.3');
  assert.equal(snapshot.vertical.id, 'restaurant');
  assert.equal(snapshot.vertical.id, OPERVIA_RESTAURANT_VERTICAL_ID);
  assert.equal(snapshot.vertical.name, 'Opervia Restaurant');
  assert.equal(snapshot.vertical.version, '1.0.0');
  console.log('   ✓ restaurant vertical identity');

  assert.equal(snapshot.modules.counts.enabled, OPERVIA_RESTAURANT_ENABLED_MODULES.length);
  assert.equal(snapshot.modules.counts.enabled, 22);
  assert.equal(snapshot.modules.counts.registered, MODULE_CATALOG.length);
  assert.equal(snapshot.modules.enabled.length, snapshot.modules.counts.enabled);
  assert.equal(snapshot.modules.entries.length, snapshot.modules.counts.enabled);
  assert.equal(
    Object.keys(getRouteModuleMap()).length,
    snapshot.modules.counts.registeredRoutePrefixes,
  );
  console.log('   ✓ module counts');

  const sortedEnabled = [...OPERVIA_RESTAURANT_ENABLED_MODULES].sort();
  assert.deepEqual([...snapshot.modules.enabled], sortedEnabled);
  for (const id of sortedEnabled) {
    assert.ok(snapshot.modules.entries.some((e) => e.id === id), `entry for ${id}`);
  }
  assert.ok(snapshot.modules.enabled.includes('core'));
  assert.ok(snapshot.modules.enabled.includes('kds'));
  assert.ok(snapshot.modules.enabled.includes('tables'));
  assert.ok(snapshot.modules.enabled.includes('addons'));
  console.log('   ✓ enabled module identity');

  const again = getCompositionSnapshot();
  assert.deepEqual(snapshot, again);
  assert.deepEqual(
    getCompositionSnapshot({ verticalId: 'restaurant' }),
    getCompositionSnapshot({ verticalId: 'restaurant' }),
  );
  console.log('   ✓ deterministic output');

  assert.equal(snapshot.dependencies.valid, true);
  assert.deepEqual(snapshot.dependencies.missing, []);
  assert.equal(snapshot.dependencies.verticalId, 'restaurant');
  assert.equal(snapshot.diagnostics.valid, true);
  assert.deepEqual(snapshot.diagnostics.warnings, []);
  console.log('   ✓ dependency validity (restaurant)');

  const integrity = validateRegistryIntegrity();
  const diag = getModuleDiagnosticsSnapshot('restaurant');
  assert.deepEqual(snapshot.dependencies, {
    verticalId: diag.vertical.verticalId,
    valid: diag.vertical.valid,
    missing: diag.vertical.missing,
    enabledModuleCount: diag.vertical.enabledModuleCount,
  });
  assert.deepEqual(snapshot.registryIntegrity, {
    valid: integrity.valid,
    issues: integrity.issues,
  });
  console.log('   ✓ reuses Phase 2.2 diagnostics');

  const invalid = getCompositionSnapshot({
    enabledModules: ['kds', 'order', 'product'] as ModuleId[],
  });
  assert.equal(invalid.dependencies.valid, false);
  assert.ok(
    invalid.dependencies.missing.some((m) => m.module === 'kds' && m.dependency === 'kitchen'),
  );
  assert.equal(invalid.registryIntegrity.valid, true);
  assert.equal(invalid.diagnostics.valid, false);
  assert.ok(invalid.diagnostics.warnings.length >= 1);

  const invalidAgain = getCompositionSnapshot({
    enabledModules: ['kds', 'order', 'product'] as ModuleId[],
  });
  assert.deepEqual(invalid.dependencies.missing, invalidAgain.dependencies.missing);
  assert.doesNotThrow(() => getCompositionSnapshot({ enabledModules: ['kds'] as ModuleId[] }));
  console.log('   ✓ invalid synthetic set (non-throwing)');

  const apiProjection = getPlatformCompositionResponse();
  assert.equal(apiProjection.verticalId, 'restaurant');
  assert.equal(apiProjection.verticalName, 'Opervia Restaurant');
  assert.deepEqual([...apiProjection.enabledModules], sortedEnabled);
  assert.equal(apiProjection.diagnostics.valid, true);
  assert.ok(!('schemaVersion' in apiProjection));
  assert.ok(!('dependencies' in apiProjection));
  console.log('   ✓ minimal platform HTTP projection');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.3 module composition contracts passed');
}

main();
