/**
 * Phase 4.12 — Retail POS fulfillment-type honesty.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.12-retail-fulfillment-types.test.ts
 *    or: npm run test:phase-4.12
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.12-fulfill-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const { assert, getResults } = require('./helpers/test-setup');
const {
  isModuleEnabled,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RETAIL_VERTICAL_ID,
} = require('../main/modules');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main() {
  console.log('Phase 4.12 — Retail POS fulfillment types');
  console.log('='.repeat(60));

  const cart = readFrontend('components/pos/CartPanel.tsx');
  assert(
    cart.includes("'dine_in', 'takeaway', 'delivery'"),
    'CartPanel lists three restaurant types',
  );
  assert(
    cart.includes("tablesModuleEnabled || type === 'takeaway'") ||
      cart.includes('tablesModuleEnabled || type === "takeaway"'),
    'no-tables POS shows takeaway only (hides delivery)',
  );
  assert(!cart.includes("type !== 'dine_in'"), 'old dine-in-only filter removed');
  console.log('   ✓ CartPanel gates delivery on tables module');

  const pos = readFrontend('app/(dashboard)/pos/page.tsx');
  assert(
    pos.includes('!tablesModuleEnabled') && pos.includes("!== 'takeaway'"),
    'POS coerces leftover delivery to takeaway when tables off',
  );
  console.log('   ✓ POS coerce');

  assert(
    isModuleEnabled('tables', OPERVIA_RESTAURANT_VERTICAL_ID),
    'restaurant still has tables (delivery chrome stays)',
  );
  assert(
    !isModuleEnabled('tables', OPERVIA_RETAIL_VERTICAL_ID),
    'retail has no tables (delivery chrome hidden)',
  );
  console.log('   ✓ vertical isolation');

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
    console.error('Phase 4.12 fulfillment tests failed.');
    return;
  }
  console.log('Phase 4.12 fulfillment tests passed.');
}

main();
