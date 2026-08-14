/**
 * Phase 3.5A — Inventory ledger UI source contract.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/inventory-ledger-ui.test.ts
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function assertIncludes(haystack: string, needle: string, label: string): void {
  assert.ok(haystack.includes(needle), `${label}: expected to include ${JSON.stringify(needle)}`);
}

function main(): void {
  console.log('Phase 3.5A Inventory Ledger UI contract');
  console.log('='.repeat(60));

  const pagePath = path.join(
    __dirname,
    '../frontend/src/app/(dashboard)/products/movements/page.tsx',
  );
  assert.ok(fs.existsSync(pagePath), 'movements page exists at products/movements/page.tsx');
  const pageSrc = fs.readFileSync(pagePath, 'utf8');

  assertIncludes(pageSrc, '/inventory/movements', 'page calls inventory movements API');
  assertIncludes(pageSrc, 'product_id', 'page filters by product_id via query helper');
  assertIncludes(pageSrc, 'buildMovementsQuery', 'page builds query via shared helper');
  assertIncludes(pageSrc, 'quantity_delta', 'page displays quantity_delta');
  assertIncludes(pageSrc, 'stock_after', 'page displays stock_after');
  assertIncludes(pageSrc, 'owner', 'page gates to owner/manager');
  assert.ok(
    !/stock_before/.test(pageSrc),
    'page must not invent stock_before (API has no such field)',
  );
  assert.ok(
    !/from ['"]better-sqlite3['"]/.test(pageSrc) && !/getDatabase\(/.test(pageSrc),
    'page must not access SQLite directly',
  );

  const helperPath = path.join(__dirname, '../frontend/src/lib/inventory-movements.ts');
  assert.ok(fs.existsSync(helperPath), 'inventory-movements helper exists');
  const helperSrc = fs.readFileSync(helperPath, 'utf8');
  assertIncludes(helperSrc, 'formatQuantityDelta', 'helper formats delta for display');
  assertIncludes(helperSrc, 'buildMovementsQuery', 'helper builds API query');
  assertIncludes(helperSrc, 'before_id', 'helper maps cursor to before_id');
  assertIncludes(helperSrc, 'product_id', 'helper sends product_id');

  console.log('  ✓ movements page + helpers contract');
  console.log('\nAll inventory-ledger-ui checks passed.');
}

main();
