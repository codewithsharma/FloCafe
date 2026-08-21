/**
 * PRC-DRAFT — Draft purchase-order line amend UI contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/purchasing-draft-amend-ui.test.ts
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
  console.log('PRC-DRAFT Draft PO Line Amend UI');
  console.log('='.repeat(60));

  const helper = read('lib/purchasing.ts');
  assert.ok(helper.includes('replacePurchaseOrderLines'), 'client exports replacePurchaseOrderLines');
  assert.ok(helper.includes('/lines'), 'client calls lines path');
  console.log('   ✓ purchasing client');

  const page = read('app/(dashboard)/products/purchasing/page.tsx');
  assert.ok(page.includes('replacePurchaseOrderLines'), 'page saves amended lines');
  assert.ok(page.includes("status === 'draft'") || page.includes('canOrder'), 'draft-only edit gate');
  assert.ok(page.includes('purchasing.saveLines') || page.includes('saveLines'), 'save lines control');
  console.log('   ✓ purchasing page contracts');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('purchasing.saveLines'), 'en saveLines');
  assert.ok(en.includes('purchasing.linesSaved'), 'en linesSaved');
  assert.ok(en.includes('purchasing.linesSaveFailed'), 'en linesSaveFailed');
  console.log('   ✓ i18n keys');

  console.log('='.repeat(60));
  console.log('✅ PRC-DRAFT purchasing draft amend UI contracts passed');
}

main();
