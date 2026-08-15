/**
 * R4 — Stock counts UI contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/inventory-counts-ui.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main(): void {
  console.log('R4 Inventory Counts UI');
  console.log('='.repeat(60));

  const helper = read('lib/inventory-counts.ts');
  assert.ok(helper.includes('/inventory/counts'), 'list/create use /inventory/counts');
  assert.ok(helper.includes('/lines'), 'upsert lines path');
  assert.ok(helper.includes('/submit'), 'submit path');
  assert.ok(helper.includes('/apply'), 'apply path');
  console.log('   ✓ inventory-counts client');

  const page = read('app/(dashboard)/products/counts/page.tsx');
  assert.ok(page.includes('isOwnerOrManager'), 'owner/manager gate');
  assert.ok(page.includes("isModuleEnabled('inventory')"), 'inventory module fail-closed');
  assert.ok(page.includes('listInventoryCounts'), 'lists counts');
  assert.ok(page.includes('createInventoryCount'), 'create count');
  assert.ok(page.includes('upsertInventoryCountLine'), 'add lines');
  assert.ok(page.includes('submitInventoryCount'), 'submit');
  assert.ok(page.includes('applyInventoryCount'), 'apply');
  assert.ok(page.includes('variance'), 'shows variance');
  console.log('   ✓ counts page contracts');

  const products = read('app/(dashboard)/products/page.tsx');
  assert.ok(products.includes('/products/counts'), 'hub link to counts');
  console.log('   ✓ products hub link');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('inventoryCounts.title'), 'en inventoryCounts keys');
  console.log('   ✓ i18n keys');

  const types = read('lib/types.ts');
  assert.ok(types.includes('inventory_unit'), 'Product has inventory_unit');
  console.log('   ✓ Product type');

  console.log('='.repeat(60));
  console.log('✅ R4 inventory counts UI contracts passed');
}

main();
