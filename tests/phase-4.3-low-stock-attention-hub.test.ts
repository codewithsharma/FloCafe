/**
 * Phase 4.3 — Low-stock attention hub characterization + contracts.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.3-low-stock-attention-hub.test.ts
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.3-low-stock-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-43-low-stock-secret';

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
  now,
} = require('./helpers/test-setup');

const { productRoutes } = require('../main/routes/products');
const { LOW_STOCK_SQL_FRAGMENT } = require('../main/services/inventory');
const {
  isModuleEnabled,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
} = require('../main/modules');
const {
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
  ACTIVE_VERTICAL_ENV_KEY,
} = require('../main/modules/vertical-config');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function lockVertical(id: string | undefined): void {
  resetActiveVerticalResolutionForTests();
  if (id === undefined) {
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
  } else {
    process.env[ACTIVE_VERTICAL_ENV_KEY] = id;
  }
  commitActiveVerticalFromEnv();
}

async function main() {
  console.log('Phase 4.3 — Low-Stock Attention Hub');
  console.log('='.repeat(60));

  // ── Frontend contracts (read-only hub) ─────────────────────────────
  console.log('\nA. Frontend contracts');
  const lowStockLib = readFrontend('lib/low-stock.ts');
  assert(lowStockLib.includes("params: { low_stock: 'true' }"), 'client uses ?low_stock=true');
  assert(!lowStockLib.includes('/stock'), 'low-stock lib does not POST stock');
  assert(!lowStockLib.includes('recordMovement'), 'low-stock lib does not touch ledger');
  console.log('   ✓ low-stock client is read-only');

  const page = readFrontend('app/(dashboard)/products/low-stock/page.tsx');
  assert(page.includes('fetchLowStockProducts'), 'low-stock page uses fetch helper');
  assert(page.includes('StockAdjustmentDialog'), 'reuses stock adjust dialog');
  assert(page.includes('postProductStockAdjust'), 'adjust uses existing stock API');
  assert(!page.includes('POST') || page.includes('postProductStockAdjust'), 'no inventing stock paths');
  assert(page.includes("router.replace('/pos')"), 'non owner/manager redirected');
  assert(page.includes("isModuleEnabled('inventory')"), 'inventory module gate');
  console.log('   ✓ low-stock page contracts');

  const dashboard = readFrontend('app/(dashboard)/dashboard/page.tsx');
  assert(dashboard.includes('fetchLowStockProducts'), 'dashboard fetches low stock');
  assert(dashboard.includes('/products/low-stock'), 'dashboard links to hub');
  assert(dashboard.includes("isModuleEnabled('inventory'"), 'dashboard gates by inventory module');
  console.log('   ✓ dashboard attention contracts');

  const {
    getLowStockAttentionStatus,
    isLowStockProduct,
  } = require('../frontend/src/lib/low-stock.ts');
  assertEqual(getLowStockAttentionStatus({ stock_quantity: 0, low_stock_threshold: 5 }), 'out_of_stock');
  assertEqual(getLowStockAttentionStatus({ stock_quantity: 2, low_stock_threshold: 5 }), 'low_stock');
  assertEqual(isLowStockProduct({ track_inventory: true, stock_quantity: 5, low_stock_threshold: 5 }), true);
  assertEqual(isLowStockProduct({ track_inventory: true, stock_quantity: 6, low_stock_threshold: 5 }), false);
  assertEqual(isLowStockProduct({ track_inventory: false, stock_quantity: 0, low_stock_threshold: 5 }), false);
  console.log('   ✓ status helpers');

  // ── Vertical composition ─────────────────────────────────────────────
  console.log('\nB. Vertical composition');
  lockVertical('restaurant');
  assert(isModuleEnabled('product', OPERVIA_RESTAURANT_VERTICAL_ID), 'restaurant has product');
  assert(isModuleEnabled('inventory', OPERVIA_RESTAURANT_VERTICAL_ID), 'restaurant has inventory');
  assert(isModuleEnabled('tables', OPERVIA_RESTAURANT_VERTICAL_ID), 'restaurant has tables');
  lockVertical('retail-test');
  assert(isModuleEnabled('product', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test has product');
  assert(isModuleEnabled('inventory', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test has inventory');
  assert(!isModuleEnabled('tables', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test no tables');
  assert(!isModuleEnabled('kds', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test no kds');
  console.log('   ✓ shared inventory; retail excludes restaurant floor modules');

  // ── API characterization ───────────────────────────────────────────
  console.log('\nC. GET /api/products?low_stock=true');
  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-ls', 'General');
  seedProduct(db, 'prod-healthy', 'cat-ls', 'Healthy Item', 100, {
    track_inventory: true,
    stock_quantity: 20,
  });
  seedProduct(db, 'prod-low', 'cat-ls', 'Low Item', 100, {
    track_inventory: true,
    stock_quantity: 3,
  });
  seedProduct(db, 'prod-out', 'cat-ls', 'Out Item', 100, {
    track_inventory: true,
    stock_quantity: 0,
  });
  seedProduct(db, 'prod-untracked', 'cat-ls', 'Untracked Item', 100, {
    track_inventory: false,
    stock_quantity: 1,
  });
  db.prepare('UPDATE products SET low_stock_threshold = 5 WHERE id IN (?, ?, ?, ?)').run(
    'prod-healthy',
    'prod-low',
    'prod-out',
    'prod-untracked',
  );
  db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run('prod-low');
  db.prepare(
    `INSERT OR IGNORE INTO products (
      id, category_id, name, price, track_inventory, stock_quantity, low_stock_threshold,
      is_active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 1, 4, 5, 1, 0, ?, ?)`,
  ).run('prod-boundary', 'cat-ls', 'Boundary Item', 100, now(), now());

  const movBefore = (
    db.prepare('SELECT COUNT(*) AS c FROM inventory_movements').get() as { c: number }
  ).c;

  const app = createApp({ '/api/products': productRoutes });
  const { baseUrl, server } = await startServer(app);

  try {
    assert(LOW_STOCK_SQL_FRAGMENT.includes('track_inventory = 1'), 'fragment requires tracked');
    assert(LOW_STOCK_SQL_FRAGMENT.includes('stock_quantity <= p.low_stock_threshold'), 'fragment threshold rule');

    const low = await api(baseUrl, '/api/products?low_stock=true', { headers: authHeader });
    assertEqual(low.status, 200, 'low stock list 200');
    const ids = (low.data.products as Array<{ id: string }>).map((p) => p.id);
    assert(ids.includes('prod-low'), 'low-stock product included');
    assert(ids.includes('prod-out'), 'out-of-stock product included');
    assert(ids.includes('prod-boundary'), 'at-threshold product included');
    assert(!ids.includes('prod-healthy'), 'healthy product excluded');
    assert(!ids.includes('prod-untracked'), 'untracked product excluded');
    assert(ids.includes('prod-low'), 'inactive low-stock still included (no active filter)');

    const movAfter = (
      db.prepare('SELECT COUNT(*) AS c FROM inventory_movements').get() as { c: number }
    ).c;
    assertEqual(movAfter, movBefore, 'low-stock list did not mutate inventory ledger');

    const all = await api(baseUrl, '/api/products', { headers: authHeader });
    assertEqual(all.status, 200, 'full list still works');
    const allIds = (all.data.products as Array<{ id: string }>).map((p) => p.id);
    assert(allIds.includes('prod-healthy'), 'healthy in full list');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed}`);
      process.exit(1);
    }
    console.log('\n✅ Phase 4.3 low-stock attention hub tests passed');
  } finally {
    resetActiveVerticalResolutionForTests();
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
    server.close();
    closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
