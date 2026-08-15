/**
 * Phase 3.6C — Manual stock adjustment UI contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/stock-adjust-ui.test.ts
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
  console.log('Phase 3.6C Manual Stock Adjustment UI');
  console.log('='.repeat(60));

  const helper = read('lib/stock-adjust.ts');
  assert.ok(
    helper.includes("'/products/${productId}/stock'") ||
      helper.includes('`/products/${productId}/stock`'),
    'client posts /products/:id/stock',
  );
  assert.ok(helper.includes('action: body.action'), 'payload includes action');
  assert.ok(helper.includes('quantity: body.quantity'), 'payload includes quantity');
  assert.ok(helper.includes('Idempotency-Key'), 'client sends Idempotency-Key');
  assert.ok(!/reason:\s*body\.reason/.test(helper), 'client must not invent free-text reason field');
  assert.ok(
    helper.includes("'set'") &&
      helper.includes("'increase'") &&
      helper.includes("'decrease'") &&
      helper.includes("'wastage'"),
    'actions match API enum',
  );
  console.log('   ✓ stock-adjust client contract');

  // Unit helpers (import via require after ts-node)
  const {
    parseStockAdjustQuantity,
    canSubmitStockAdjust,
  } = require('../frontend/src/lib/stock-adjust.ts');
  assert.equal(parseStockAdjustQuantity('5'), 5, 'parse 5');
  assert.equal(parseStockAdjustQuantity('0'), 0, 'parse 0');
  assert.equal(parseStockAdjustQuantity('-1'), null, 'reject negative');
  assert.equal(parseStockAdjustQuantity(''), null, 'reject empty');
  assert.equal(parseStockAdjustQuantity('abc'), null, 'reject NaN');
  assert.equal(canSubmitStockAdjust('increase', '2'), true, 'valid submit');
  assert.equal(canSubmitStockAdjust('increase', ''), false, 'empty qty blocked');
  assert.equal(canSubmitStockAdjust('', '2'), false, 'missing action blocked');
  console.log('   ✓ quantity validation helpers');

  const dialog = read('components/products/StockAdjustmentDialog.tsx');
  assert.ok(dialog.includes('Dialog'), 'StockAdjustmentDialog uses Dialog');
  assert.ok(
    dialog.includes('set') &&
      dialog.includes('increase') &&
      dialog.includes('decrease') &&
      dialog.includes('wastage'),
    'dialog exposes API actions',
  );
  assert.ok(
    dialog.includes('stock_quantity') ||
      dialog.includes('currentStock') ||
      dialog.includes('current'),
    'shows current stock',
  );
  assert.ok(
    dialog.includes('wastageReason') || dialog.includes('wastage_reason'),
    'wastage reason select when wastage',
  );
  assert.ok(
    dialog.includes('SPOILAGE') &&
      dialog.includes('DAMAGED') &&
      dialog.includes('EXPIRED') &&
      dialog.includes('SPILLAGE') &&
      dialog.includes('OTHER'),
    'wastage reason enum options',
  );
  assert.ok(dialog.includes('inventory_unit'), 'shows inventory_unit when present');
  assert.ok(
    !/name=["']reason["']|id=["']stockReason["']/.test(dialog),
    'no free-text reason inventing API field',
  );
  assert.ok(
    dialog.includes('disabled') || dialog.includes('submitting'),
    'loading/disabled submit',
  );
  console.log('   ✓ StockAdjustmentDialog contracts');

  const table = read('components/products/ProductsTable.tsx');
  assert.ok(table.includes('onAdjustStock'), 'ProductsTable exposes onAdjustStock');
  assert.ok(table.includes('track_inventory'), 'adjust gated by track_inventory');
  console.log('   ✓ ProductsTable adjust affordance');

  const page = read('app/(dashboard)/products/page.tsx');
  assert.ok(
    page.includes('StockAdjustmentDialog') || page.includes('stock-adjust'),
    'products page wires stock adjust',
  );
  assert.ok(
    page.includes('postProductStockAdjust') || page.includes('/stock'),
    'page calls stock endpoint',
  );
  assert.ok(page.includes('wastage_reason'), 'page passes wastage_reason on wastage');
  assert.ok(page.includes('isOwnerOrManager'), 'role gate preserved');
  console.log('   ✓ products page orchestration');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('stockAdjust.'), 'en stockAdjust i18n keys');
  assert.ok(en.includes('stockAdjust.wastageReason'), 'en wastage reason i18n');
  console.log('   ✓ i18n keys');

  const validation = fs.readFileSync(path.join(ROOT, 'main/validation/inventory.ts'), 'utf8');
  assert.ok(
    validation.includes("'wastage'"),
    'backend schema includes wastage',
  );
  assert.ok(validation.includes('wastage_reason'), 'optional wastage_reason enum');
  assert.ok(!/^\s*reason:\s*z\.string/m.test(validation), 'no free-text reason field');
  console.log('   ✓ backend contract');

  console.log('='.repeat(60));
  console.log('✅ Phase 3.6C stock adjust UI contracts passed');
}

main();
