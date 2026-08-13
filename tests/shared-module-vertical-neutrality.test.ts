/**
 * Phase 2.18 — shared modules must not depend on Restaurant-kind modules.
 *
 * Architecture test (catalog + source contracts). Not production Retail.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/shared-module-vertical-neutrality.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MODULE_CATALOG,
  getModule,
  isModuleEnabled,
  validateEnabledSetDependencies,
  validateVerticalDependencies,
} from '../main/modules';
import type { ModuleId } from '../main/modules';

const RESTAURANT_ONLY: readonly ModuleId[] = [
  'tables',
  'kitchen',
  'kds',
  'menu',
  'addons',
];

const SHARED_COMMERCE: readonly ModuleId[] = [
  'order',
  'payment',
  'pos',
  'inventory',
  'tax',
  'refund',
  'customer',
  'product',
];

function readRepo(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function main(): void {
  console.log('Phase 2.18 Shared Module Vertical Neutrality');
  console.log('='.repeat(60));

  const restaurantIds = new Set(RESTAURANT_ONLY);

  for (const mod of MODULE_CATALOG) {
    if (mod.kind === 'restaurant') continue;
    for (const dep of mod.dependencies) {
      assert.ok(
        !restaurantIds.has(dep),
        `${mod.id} (${mod.kind}) must not depend on restaurant module ${dep}`,
      );
    }
  }
  console.log('   ✓ no core/shared catalog deps on restaurant modules');

  for (const id of SHARED_COMMERCE) {
    const mod = getModule(id);
    assert.ok(mod, `${id} in catalog`);
    assert.ok(mod!.kind === 'core' || mod!.kind === 'shared', `${id} is not restaurant-kind`);
    assert.equal(isModuleEnabled(id, 'retail-test'), true, `${id} enabled in retail-test`);
    for (const rest of RESTAURANT_ONLY) {
      assert.equal(isModuleEnabled(rest, 'retail-test'), false);
    }
  }
  console.log('   ✓ Order/Payment/POS/Inventory/Tax compose into retail-test');

  const retailDeps = validateVerticalDependencies('retail-test');
  assert.equal(retailDeps.valid, true);
  assert.deepEqual(retailDeps.missing, []);
  const sharedSet = MODULE_CATALOG.filter((m) => m.kind !== 'restaurant').map((m) => m.id);
  const sharedValid = validateEnabledSetDependencies(sharedSet);
  assert.equal(sharedValid.valid, true, 'all non-restaurant modules form a valid set');
  console.log('   ✓ retail-test and shared-only set dependencies valid');

  const ordersSrc = readRepo('main/routes/orders.ts');
  assert.match(ordersSrc, /isModuleEnabled\('tables'\)/);
  assert.match(ordersSrc, /isModuleEnabled\('kds'\)/);
  const tenderSrc = readRepo('main/services/payment-tender.ts');
  assert.match(tenderSrc, /isModuleEnabled\('tables'\)/);
  const billsSrc = readRepo('main/routes/bills.ts');
  assert.match(billsSrc, /isModuleEnabled\('kds'\)/);
  console.log('   ✓ Order/Payment restaurant side effects are module-gated');

  console.log('='.repeat(60));
  console.log('✅ Phase 2.18 shared-module vertical neutrality passed');
}

main();
