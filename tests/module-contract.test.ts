/**
 * Phase 2.6 — Module contract & capability integrity.
 *
 * Soft diagnostics remain non-throwing for valid verticals.
 * Fail-closed remount / unknown-vertical throw: Phase 3.1 (`fail-closed-remount.test.ts`).
 * Capabilities describe what a module provides; they are NOT authorization.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/module-contract.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  MODULE_CATALOG,
  MODULE_IDS,
  OPERVIA_RESTAURANT_ENABLED_MODULES,
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  VERTICALS,
  SYNTHETIC_VERTICALS,
  getCompositionSnapshot,
  getModule,
  getModuleCapabilities,
  moduleOwnsCapability,
  findCapabilityOwner,
  validateRegistryIntegrity,
  validateModuleDefinitions,
  validateVerticalDependencies,
  CAPABILITY_IDS,
} from '../main/modules';
import type { CapabilityId, ModuleId, OperviaModule } from '../main/modules';

const VERSION_RE = /^\d+\.\d+\.\d+/;
const CAPABILITY_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

function main(): void {
  console.log('Phase 2.6 Module Contract & Capabilities');
  console.log('='.repeat(60));

  // ── Identity ────────────────────────────────────────────────────────────
  assert.equal(MODULE_CATALOG.length, 22);
  assert.equal(MODULE_IDS.length, 22);
  const seenIds = new Set<string>();
  for (const mod of MODULE_CATALOG) {
    assert.ok(mod.id, `module id present`);
    assert.ok(!seenIds.has(mod.id), `unique id ${mod.id}`);
    seenIds.add(mod.id);
    assert.ok(typeof mod.name === 'string' && mod.name.trim().length > 0, `${mod.id} name`);
    assert.ok(VERSION_RE.test(mod.version), `${mod.id} version ${mod.version}`);
    assert.ok(['core', 'shared', 'restaurant'].includes(mod.kind), `${mod.id} kind`);
    assert.ok(Array.isArray(mod.dependencies), `${mod.id} dependencies array`);
    assert.ok(Array.isArray(mod.capabilities), `${mod.id} capabilities array`);
    assert.ok(mod.capabilities.length >= 1, `${mod.id} has ≥1 capability`);
  }
  console.log('   ✓ identity metadata (unique ids, names, versions, kinds)');

  // ── Capabilities contract ───────────────────────────────────────────────
  const globalCaps = new Map<CapabilityId, ModuleId>();
  for (const mod of MODULE_CATALOG) {
    const local = new Set<string>();
    for (const cap of mod.capabilities) {
      assert.ok(CAPABILITY_RE.test(cap), `${mod.id} capability format: ${cap}`);
      assert.ok(CAPABILITY_IDS.includes(cap), `${cap} in CapabilityId union`);
      assert.ok(!local.has(cap), `${mod.id} no duplicate capability ${cap}`);
      local.add(cap);
      assert.ok(!globalCaps.has(cap), `capability ${cap} owned by one module`);
      globalCaps.set(cap, mod.id);
    }
  }
  assert.equal(getModuleCapabilities('customer')[0], 'customer.manage');
  assert.equal(moduleOwnsCapability('customer', 'customer.manage'), true);
  assert.equal(moduleOwnsCapability('customer', 'product.manage'), false);
  assert.equal(findCapabilityOwner('kds.display'), 'kds');
  assert.equal(findCapabilityOwner('tables.manage', 'retail-test'), undefined);
  console.log('   ✓ capabilities unique, formatted, owned by one module');

  // ── Dependencies ────────────────────────────────────────────────────────
  for (const mod of MODULE_CATALOG) {
    for (const dep of mod.dependencies) {
      assert.ok(getModule(dep), `${mod.id} dep ${dep} registered`);
    }
  }
  const integrity = validateRegistryIntegrity();
  assert.equal(integrity.valid, true, JSON.stringify(integrity.issues));
  console.log('   ✓ dependencies + registry integrity valid');

  // ── Invalid synthetic definitions (soft report) ─────────────────────────
  const base: OperviaModule = {
    id: 'customer',
    name: 'Customer',
    version: '1.0.0',
    dependencies: ['core'],
    kind: 'shared',
    capabilities: ['customer.manage'],
  };

  const dupId = validateModuleDefinitions([base, { ...base, name: 'Clone' }]);
  assert.equal(dupId.valid, false);
  assert.ok(dupId.issues.some((i) => i.kind === 'duplicate_module_id'));

  const unknownDep = validateModuleDefinitions([
    { ...base, dependencies: ['core', 'not_a_module' as ModuleId] },
    {
      id: 'core',
      name: 'Core',
      version: '1.0.0',
      dependencies: [],
      kind: 'core',
      capabilities: ['platform.auth'],
    },
  ]);
  assert.equal(unknownDep.valid, false);
  assert.ok(unknownDep.issues.some((i) => i.kind === 'unknown_dependency'));

  const emptyCaps = validateModuleDefinitions([{ ...base, capabilities: [] }]);
  assert.equal(emptyCaps.valid, false);
  assert.ok(emptyCaps.issues.some((i) => i.kind === 'empty_capabilities'));

  const badCapFormat = validateModuleDefinitions([
    { ...base, capabilities: ['CustomerManage' as CapabilityId] },
  ]);
  assert.equal(badCapFormat.valid, false);
  assert.ok(badCapFormat.issues.some((i) => i.kind === 'invalid_capability_format'));

  const dupCapModule = validateModuleDefinitions([
    { ...base, capabilities: ['customer.manage', 'customer.manage'] },
  ]);
  assert.equal(dupCapModule.valid, false);
  assert.ok(dupCapModule.issues.some((i) => i.kind === 'duplicate_capability_on_module'));

  const dupCapGlobal = validateModuleDefinitions([
    base,
    {
      id: 'product',
      name: 'Product',
      version: '1.0.0',
      dependencies: ['core'],
      kind: 'shared',
      capabilities: ['customer.manage'],
    },
    {
      id: 'core',
      name: 'Core',
      version: '1.0.0',
      dependencies: [],
      kind: 'core',
      capabilities: ['platform.auth'],
    },
  ]);
  assert.equal(dupCapGlobal.valid, false);
  assert.ok(dupCapGlobal.issues.some((i) => i.kind === 'duplicate_capability_across_modules'));

  const missingName = validateModuleDefinitions([{ ...base, name: '   ' }]);
  assert.equal(missingName.valid, false);
  assert.ok(missingName.issues.some((i) => i.kind === 'invalid_module_name'));

  const badVersion = validateModuleDefinitions([{ ...base, version: 'v1' }]);
  assert.equal(badVersion.valid, false);
  assert.ok(badVersion.issues.some((i) => i.kind === 'invalid_module_version'));

  assert.doesNotThrow(() => validateModuleDefinitions([{ ...base, capabilities: [] }]));
  console.log('   ✓ invalid definitions soft-reported (non-throwing)');

  // ── Vertical composition ────────────────────────────────────────────────
  assert.equal(VERTICALS.length, 2);
  assert.ok(VERTICALS.some((v) => v.id === 'restaurant'));
  assert.ok(VERTICALS.some((v) => v.id === 'retail'));
  assert.ok(!VERTICALS.some((v) => v.id === 'retail-test'));
  assert.equal(validateVerticalDependencies('restaurant').valid, true);
  assert.equal(validateVerticalDependencies('retail').valid, true);
  assert.equal(validateVerticalDependencies('retail-test').valid, true);
  for (const id of OPERVIA_RESTAURANT_ENABLED_MODULES) {
    assert.ok(getModule(id), `restaurant module ${id}`);
  }
  for (const id of OPERVIA_RETAIL_TEST_ENABLED_MODULES) {
    assert.ok(getModule(id), `retail-test module ${id}`);
  }
  assert.ok(SYNTHETIC_VERTICALS.some((v) => v.id === 'retail-test'));
  console.log('   ✓ restaurant + retail + retail-test compositions valid');

  // ── Composition snapshot unchanged for HTTP surface ─────────────────────
  const snap = getCompositionSnapshot();
  assert.equal(snap.vertical.id, 'restaurant');
  assert.equal(snap.modules.counts.enabled, 22);
  assert.ok(!('capabilities' in (snap.modules.entries[0] || {})));
  console.log('   ✓ composition snapshot unchanged (no capability leak)');

  // ── Security boundary reminder ──────────────────────────────────────────
  assert.ok(
    !moduleOwnsCapability.toString().includes('requireRole'),
    'capability helpers are not auth',
  );
  console.log('   ✓ capabilities remain metadata (not authorization)');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.6 module contract tests passed');
}

main();
