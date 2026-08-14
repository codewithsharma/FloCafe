/**
 * Phase 4.1 — Retail floor usability contracts + product search unit checks.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/phase-4.1-retail-floor-usability.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isFeatureAvailable,
  isModuleEnabled,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
} from '../main/modules';
import {
  findProductByScanCode,
  productMatchesPosSearch,
} from '../frontend/src/lib/pos/product-search';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function readMain(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const SAMPLE = {
  id: 'p1',
  name: 'Classic White T-Shirt',
  sku: 'TSHIRT-WHT-M',
  barcode: '8901234567890',
};

function main(): void {
  console.log('Phase 4.1 — Retail Floor Usability');
  console.log('='.repeat(60));

  // ── Capability truth (retail-test = shared commerce without tables) ──
  assert.equal(isModuleEnabled('tables', OPERVIA_RESTAURANT_VERTICAL_ID), true);
  assert.equal(isModuleEnabled('tables', OPERVIA_RETAIL_TEST_VERTICAL_ID), false);
  assert.equal(isFeatureAvailable('tables', true, OPERVIA_RETAIL_TEST_VERTICAL_ID), false);
  assert.equal(isFeatureAvailable('tables', true, OPERVIA_RESTAURANT_VERTICAL_ID), true);
  assert.equal(isFeatureAvailable('tables', false, OPERVIA_RESTAURANT_VERTICAL_ID), false);
  console.log('   ✓ tables module available only when restaurant floor modules enabled');

  // ── A. Settings: tablesRequired gated by tables module ──────────
  const settings = readFrontend('app/(dashboard)/settings/page.tsx');
  assert.ok(
    settings.includes("isModuleEnabled('tables'"),
    'settings gates tables controls via isModuleEnabled(tables)',
  );
  assert.ok(
    /showTablesBusinessControls|showTablesSettings/.test(settings),
    'settings defines a show* variable for tables business controls',
  );
  assert.ok(
    settings.includes("t('settings.tablesRequired')") &&
      (settings.includes('{showTablesBusinessControls &&') ||
        settings.includes('{showTablesSettings &&')),
    'tablesRequired UI wrapped by tables module gate',
  );
  console.log('   ✓ Settings tablesRequired gated when tables module off');

  // ── B. /tables fail-closed ──────────────────────────────────────
  const tablesPage = readFrontend('app/(dashboard)/tables/page.tsx');
  assert.ok(
    tablesPage.includes('isFeatureAvailable') || tablesPage.includes('isModuleEnabled'),
    'tables page uses capability helpers',
  );
  assert.ok(
    tablesPage.includes('usePlatformComposition'),
    'tables page resolves vertical via platform composition',
  );
  assert.ok(
    tablesPage.includes('EmptyState') && tablesPage.includes('LoadingState'),
    'tables page keeps EmptyState/LoadingState for fail-closed',
  );
  assert.ok(
    /tables (is |are )?unavailable|Table management is (disabled|unavailable)|not available/i.test(
      tablesPage,
    ) ||
      tablesPage.includes('tablesUnavailable') ||
      tablesPage.includes('tablesDisabled'),
    'tables page shows explicit unavailable messaging when gated off',
  );
  console.log('   ✓ /tables fail-closed pattern present');

  // ── C/D. POS search helper semantics ────────────────────────────
  assert.equal(productMatchesPosSearch(SAMPLE, 'Classic'), true, 'name substring');
  assert.equal(productMatchesPosSearch(SAMPLE, 'TSHIRT'), true, 'sku substring');
  assert.equal(productMatchesPosSearch(SAMPLE, '890123'), true, 'barcode substring');
  assert.equal(productMatchesPosSearch(SAMPLE, 'nope'), false, 'non-match');
  assert.equal(productMatchesPosSearch(SAMPLE, ''), true, 'empty query matches all');

  assert.equal(findProductByScanCode([SAMPLE], '8901234567890')?.id, 'p1', 'exact barcode');
  assert.equal(findProductByScanCode([SAMPLE], 'TSHIRT-WHT-M')?.id, 'p1', 'exact sku');
  assert.equal(findProductByScanCode([SAMPLE], 'Classic'), undefined, 'name is not scan code');
  assert.equal(findProductByScanCode([SAMPLE], '0000000000000'), undefined, 'unknown barcode');
  console.log('   ✓ POS search matches name / SKU / barcode');

  const grid = readFrontend('components/pos/ProductGrid.tsx');
  assert.ok(grid.includes('productMatchesPosSearch'), 'ProductGrid uses shared search helper');
  assert.ok(grid.includes('findProductByScanCode'), 'ProductGrid uses scan-code helper on Enter');

  const posPage = readFrontend('app/(dashboard)/pos/page.tsx');
  assert.ok(
    posPage.includes('findProductByScanCode') || posPage.includes('productMatchesPosSearch'),
    'POS page uses shared scan/search helpers',
  );
  assert.ok(
    posPage.includes('toast.success') && posPage.includes('barcodeNotFound'),
    'POS scanner gives success and not-found feedback',
  );
  assert.ok(
    /barcodeAdded|barcodeScanned|productAdded/.test(posPage) ||
      posPage.includes("toast.success(t('pos."),
    'POS scanner success toast uses i18n key',
  );
  console.log('   ✓ POS scan feedback contracts');

  // ── API search includes barcode ─────────────────────────────────
  const productsRoute = readMain('main/routes/products.ts');
  assert.ok(
    /search[\s\S]{0,200}name LIKE[\s\S]{0,80}sku LIKE[\s\S]{0,80}barcode LIKE/i.test(
      productsRoute,
    ) || productsRoute.includes('p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?'),
    'GET /products?search= matches name OR sku OR barcode',
  );
  console.log('   ✓ products search API includes barcode');

  console.log('='.repeat(60));
  console.log('✅ Phase 4.1 retail floor usability contracts passed');
}

main();
