/**
 * Phase 2.2 — Opervia soft dependency diagnostics + registry integrity.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/module-diagnostics.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  validateVerticalDependencies,
  validateEnabledSetDependencies,
  validateRegistryIntegrity,
  formatModuleDiagnosticsLog,
  getModuleDiagnosticsSnapshot,
  detectDependencyCycles,
} from '../main/modules';
import type { ModuleId } from '../main/modules';

function main(): void {
  console.log('Phase 2.2 Module Diagnostics + Registry Integrity');
  console.log('='.repeat(60));

  // ── Restaurant vertical: deps satisfied ───────────────────────────
  const restaurant = validateVerticalDependencies('restaurant');
  assert.equal(restaurant.verticalId, 'restaurant');
  assert.equal(restaurant.valid, true);
  assert.deepEqual(restaurant.missing, []);
  assert.equal(restaurant.enabledModuleCount, 22);

  const activeDefault = validateVerticalDependencies();
  assert.equal(activeDefault.valid, true);
  assert.deepEqual(activeDefault.missing, []);
  console.log('   ✓ restaurant vertical dependencies valid');

  // ── Soft missing-deps (synthetic enabled set) ─────────────────────
  const kdsPartial = validateEnabledSetDependencies([
    'kds',
    'order',
    'product',
  ] as ModuleId[]);
  assert.equal(kdsPartial.valid, false);
  assert.ok(
    kdsPartial.missing.some((m) => m.module === 'kds' && m.dependency === 'kitchen'),
    'kds missing kitchen',
  );

  const refundOnly = validateEnabledSetDependencies(['refund'] as ModuleId[]);
  assert.equal(refundOnly.valid, false);
  assert.ok(
    refundOnly.missing.some((m) => m.module === 'refund' && m.dependency === 'payment'),
    'refund missing payment',
  );

  const coreOnly = validateEnabledSetDependencies(['core'] as ModuleId[]);
  assert.equal(coreOnly.valid, true);
  assert.deepEqual(coreOnly.missing, []);

  const again = validateEnabledSetDependencies([
    'kds',
    'order',
    'product',
  ] as ModuleId[]);
  assert.deepEqual(again.missing, kdsPartial.missing, 'missing list is deterministic');
  console.log('   ✓ soft missing-dependency diagnostics');

  // ── Registry integrity ────────────────────────────────────────────
  const integrity = validateRegistryIntegrity();
  assert.equal(integrity.valid, true, `integrity issues: ${JSON.stringify(integrity.issues)}`);
  assert.deepEqual(integrity.issues, []);
  console.log('   ✓ registry integrity (unique ids, deps, verticals, no cycles)');

  // ── Cycle detection helper ────────────────────────────────────────
  const cycleMap = new Map<string, readonly string[]>([
    ['a', ['b']],
    ['b', ['a']],
  ]);
  const cycles = detectDependencyCycles(cycleMap);
  assert.ok(cycles.length >= 1, 'detects a→b→a');
  assert.ok(cycles[0].includes('a') && cycles[0].includes('b'));
  console.log('   ✓ circular dependency detection');

  // ── Log formatter (pure, non-throwing) ────────────────────────────
  const okLog = formatModuleDiagnosticsLog('restaurant');
  assert.ok(okLog.includes('[Opervia Modules]'));
  assert.ok(okLog.toLowerCase().includes('restaurant'));
  assert.ok(/valid|Dependencies:\s*valid/i.test(okLog));

  const warnLog = formatModuleDiagnosticsLog(
    undefined,
    validateEnabledSetDependencies(['kds', 'product'] as ModuleId[]),
  );
  assert.ok(/warning|missing|kds/i.test(warnLog));
  console.log('   ✓ diagnostics log formatting');

  // ── Snapshot never throws; soft (valid=false is a report, not Error)
  const snapshot = getModuleDiagnosticsSnapshot();
  assert.equal(typeof snapshot.vertical.valid, 'boolean');
  assert.equal(typeof snapshot.integrity.valid, 'boolean');
  assert.equal(snapshot.vertical.valid, true);
  assert.equal(snapshot.integrity.valid, true);
  console.log('   ✓ diagnostics snapshot non-blocking');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.2 module diagnostics contracts passed');
}

main();
