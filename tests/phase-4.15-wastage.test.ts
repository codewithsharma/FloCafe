/**
 * Phase 4.15 — Wastage stock decrease.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.15-wastage.test.ts
 *    or: npm run test:phase-4.15
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.15-wastage-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-415-wastage-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedCategory,
  seedProduct,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
} = require('./helpers/test-setup');

const { productRoutes } = require('../main/routes/products');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

async function main() {
  console.log('Phase 4.15 — Wastage stock decrease');
  console.log('='.repeat(60));

  const migrationsTs = fs.readFileSync(path.join(ROOT, 'main/database/migrations.ts'), 'utf8');
  assert(
    migrationsTs.includes("CHECK (movement_type IN ('sale', 'cancel_restore', 'adjustment'))"),
    'movement_type CHECK unchanged (no wastage type)',
  );
  assert(!/movement_type IN \([^)]*wastage/.test(migrationsTs), 'CHECK does not include wastage type');
  console.log('   ✓ schema CHECK intact in migrations (no wastage type)');

  const zod = fs.readFileSync(path.join(ROOT, 'main/validation/inventory.ts'), 'utf8');
  assert(zod.includes("'wastage'"), 'Zod allows wastage action');
  assert(zod.includes('wastage_reason'), 'optional wastage_reason enum');
  assert(!/^\s*reason:\s*z\.string/m.test(zod), 'no free-text reason on HTTP body');
  console.log('   ✓ Zod');

  const service = fs.readFileSync(path.join(ROOT, 'main/services/inventory.ts'), 'utf8');
  assert(service.includes("'wastage'"), 'adjustProductStock allows wastage');
  console.log('   ✓ service allowlist');

  const helper = readFrontend('lib/stock-adjust.ts');
  assert(helper.includes("'wastage'"), 'client action includes wastage');
  const dialog = readFrontend('components/products/StockAdjustmentDialog.tsx');
  assert(dialog.includes('value="wastage"'), 'dialog has wastage option');
  for (const [label, rel] of [
    ['en', 'lib/i18n/en.json'],
    ['es', 'lib/i18n/es.json'],
    ['pt', 'lib/i18n/pt.json'],
  ] as const) {
    const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
    assert(src.includes('"stockAdjust.actionWastage"'), `${label} actionWastage`);
  }
  console.log('   ✓ UI + i18n');

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-p415', 'Waste Cat');
  seedProduct(db, 'p415-milk', 'cat-p415', 'Milk', 50, {
    track_inventory: true,
    stock_quantity: 10,
  });

  const app = createApp({ '/api/products': productRoutes });
  const { baseUrl, server } = await startServer(app);

  try {
    const waste = await api(baseUrl, '/api/products/p415-milk/stock', {
      method: 'POST',
      body: { action: 'wastage', quantity: 3 },
      headers: { ...authHeader, 'Idempotency-Key': 'p415-waste-1' },
    });
    assertEqual(waste.status, 200, 'wastage 200');
    assertEqual(waste.data.product.stock_quantity, 7, 'stock 10-3=7');

    const live = getDatabase();
    const row = live
      .prepare(
        `SELECT movement_type, reference_type, reason, quantity_delta, stock_after
         FROM inventory_movements WHERE product_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get('p415-milk') as {
      movement_type: string;
      reference_type: string;
      reason: string;
      quantity_delta: number;
      stock_after: number;
    };
    assertEqual(row.movement_type, 'adjustment', 'movement_type stays adjustment');
    assertEqual(row.reference_type, 'manual', 'reference_type manual');
    assertEqual(row.reason, 'wastage', 'reason wastage');
    assertEqual(row.quantity_delta, -3, 'delta -3');
    assertEqual(row.stock_after, 7, 'stock_after 7');
    console.log('   ✓ wastage ledger');

    const over = await api(baseUrl, '/api/products/p415-milk/stock', {
      method: 'POST',
      body: { action: 'wastage', quantity: 999 },
      headers: { ...authHeader, 'Idempotency-Key': 'p415-waste-over' },
    });
    assertEqual(over.status, 400, 'oversized wastage 400');
    assertEqual(over.data.error, 'Insufficient stock', 'Insufficient stock message');
    const still = live
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('p415-milk') as {
      stock_quantity: number;
    };
    assertEqual(still.stock_quantity, 7, 'failed wastage does not change stock');
    console.log('   ✓ insufficient wastage');

    const dec = await api(baseUrl, '/api/products/p415-milk/stock', {
      method: 'POST',
      body: { action: 'decrease', quantity: 1 },
      headers: { ...authHeader, 'Idempotency-Key': 'p415-dec-1' },
    });
    assertEqual(dec.status, 200, 'decrease still works');
    assertEqual(dec.data.product.stock_quantity, 6, 'decrease 7-1=6');
    console.log('   ✓ 3.6C decrease unchanged');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
    console.error('Phase 4.15 wastage tests failed.');
    return;
  }
  console.log('Phase 4.15 wastage tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
