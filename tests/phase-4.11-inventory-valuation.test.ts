/**
 * Phase 4.11 — Catalog-cost inventory on-hand valuation.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.11-inventory-valuation.test.ts
 *    or: npm run test:phase-4.11
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.11-valuation-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-411-valuation-secret';

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
  now,
} = require('./helpers/test-setup');

const { reportRoutes } = require('../main/routes/reports');
const { productRoutes } = require('../main/routes/products');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function seedCashierUser(db: any): { authHeader: Record<string, string> } {
  const { getJWTSecret } = require('../main/routes/auth');
  const userId = 'cashier-phase411-001';
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, 'Test Cashier', 'cashier@test.local', passwordHash, 'cashier', 1, now(), now());
  const token = jwt.sign({ userId, email: 'cashier@test.local', role: 'cashier' }, getJWTSecret(), {
    expiresIn: '1h',
  });
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('Phase 4.11 — Inventory on-hand valuation');
  console.log('='.repeat(60));

  console.log('\nA. Frontend contracts');
  const client = readFrontend('lib/inventory-valuation.ts');
  assert(client.includes('/reports/inventory-valuation'), 'client hits valuation report route');
  assert(!client.includes("'/stock'"), 'valuation client does not POST stock');
  assert(!client.includes('recordMovement'), 'valuation client does not touch ledger');
  console.log('   ✓ valuation client is read-only');

  const page = readFrontend('app/(dashboard)/products/valuation/page.tsx');
  assert(page.includes('fetchInventoryValuation'), 'valuation page uses fetch helper');
  assert(page.includes('inventoryValuation.disclaimer'), 'page shows catalog-cost disclaimer');
  assert(
    page.includes("role === 'owner'") || page.includes('isOwnerOrManager'),
    'page gates owner/manager',
  );
  assert(page.includes("isModuleEnabled('inventory')"), 'page gates inventory module');
  console.log('   ✓ valuation page contracts');

  const productsPage = readFrontend('app/(dashboard)/products/page.tsx');
  assert(productsPage.includes('/products/valuation'), 'products toolbar links to valuation');
  const nav = readFrontend('config/navigation.ts');
  assert(nav.includes('/products/valuation'), 'nav title maps valuation path');
  console.log('   ✓ products + nav links');

  const reportsTs = fs.readFileSync(path.join(ROOT, 'main/routes/reports.ts'), 'utf8');
  assert(reportsTs.includes("'/inventory-valuation'"), 'reports route mounts inventory-valuation');
  assert(!reportsTs.includes('UPDATE products'), 'valuation route does not write products');
  assert(!reportsTs.includes('inventory_movements'), 'valuation does not read movements for math');
  console.log('   ✓ backend route is read-only catalog cost');

  for (const [label, rel] of [
    ['en', 'lib/i18n/en.json'],
    ['es', 'lib/i18n/es.json'],
    ['pt', 'lib/i18n/pt.json'],
  ] as const) {
    const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
    assert(src.includes('"inventoryValuation.title"'), `${label} inventoryValuation.title`);
    assert(
      src.includes('"inventoryValuation.disclaimer"'),
      `${label} inventoryValuation.disclaimer`,
    );
  }
  console.log('   ✓ i18n keys');

  const db = initTestDb();
  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader: cashierAuth } = seedCashierUser(db);
  seedCategory(db, 'cat-p411', 'Valuation Cat');

  seedProduct(db, 'p411-beans', 'cat-p411', 'Beans', 200, {
    track_inventory: true,
    stock_quantity: 10,
  });
  seedProduct(db, 'p411-cups', 'cat-p411', 'Cups', 20, {
    track_inventory: true,
    stock_quantity: 4,
  });
  seedProduct(db, 'p411-menu', 'cat-p411', 'Menu item', 150, {
    track_inventory: false,
    stock_quantity: 99,
  });
  seedProduct(db, 'p411-zero', 'cat-p411', 'Zero cost beans', 80, {
    track_inventory: true,
    stock_quantity: 3,
  });
  seedProduct(db, 'p411-gone', 'cat-p411', 'Deleted tracked', 10, {
    track_inventory: true,
    stock_quantity: 50,
  });
  seedProduct(db, 'p411-inactive', 'cat-p411', 'Inactive tracked', 30, {
    track_inventory: true,
    stock_quantity: 2,
  });

  db.prepare('UPDATE products SET cost = ? WHERE id = ?').run(12.5, 'p411-beans');
  db.prepare('UPDATE products SET cost = ? WHERE id = ?').run(5, 'p411-cups');
  db.prepare('UPDATE products SET cost = ? WHERE id = ?').run(999, 'p411-menu');
  db.prepare('UPDATE products SET cost = ? WHERE id = ?').run(0, 'p411-zero');
  db.prepare('UPDATE products SET cost = ?, deleted_at = ? WHERE id = ?').run(
    8,
    now(),
    'p411-gone',
  );
  db.prepare('UPDATE products SET cost = ?, is_active = 0 WHERE id = ?').run(7, 'p411-inactive');

  const stockBefore = db
    .prepare('SELECT id, stock_quantity FROM products ORDER BY id')
    .all() as Array<{ id: string; stock_quantity: number }>;

  const app = createApp({
    '/api/reports': reportRoutes,
    '/api/products': productRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\nB. HTTP');
    const cashierRes = await api(baseUrl, '/api/reports/inventory-valuation', {
      headers: cashierAuth,
    });
    assertEqual(cashierRes.status, 403, 'cashier valuation forbidden');

    const res = await api(baseUrl, '/api/reports/inventory-valuation', { headers: ownerAuth });
    assertEqual(res.status, 200, 'owner valuation 200');
    const body = res.data;
    assert(Array.isArray(body.lines), 'lines array');
    assert(body.totals, 'totals present');
    assertEqual(typeof body.currency, 'string', 'currency string');

    const ids = body.lines.map((l: { product_id: string }) => l.product_id);
    assert(ids.includes('p411-beans'), 'tracked beans included');
    assert(ids.includes('p411-cups'), 'tracked cups included');
    assert(ids.includes('p411-zero'), 'zero-cost tracked included');
    assert(ids.includes('p411-inactive'), 'inactive tracked included');
    assert(!ids.includes('p411-menu'), 'untracked excluded');
    assert(!ids.includes('p411-gone'), 'deleted excluded');

    const beans = body.lines.find((l: { product_id: string }) => l.product_id === 'p411-beans');
    assertEqual(beans.unit_cost, 12.5, 'beans unit cost');
    assertEqual(beans.on_hand_qty, 10, 'beans qty');
    assertEqual(beans.extended_cost, 125, 'beans 12.5 × 10');
    assertEqual(Boolean(beans.zero_cost), false, 'beans not zero-cost');

    const zero = body.lines.find((l: { product_id: string }) => l.product_id === 'p411-zero');
    assertEqual(Boolean(zero.zero_cost), true, 'zero cost flagged');
    assertEqual(zero.extended_cost, 0, 'zero extended');

    // 12.5*10 + 5*4 + 0*3 + 7*2 = 125 + 20 + 0 + 14 = 159
    assertEqual(body.totals.extended_cost, 159, 'extended total 159');
    assertEqual(body.totals.on_hand_qty, 19, 'qty 10+4+3+2');
    assertEqual(body.totals.line_count, 4, 'four tracked lines');
    assertEqual(body.totals.zero_cost_count, 1, 'one zero-cost line');
    console.log('   ✓ valuation math + filters');

    const stockAfter = db
      .prepare('SELECT id, stock_quantity FROM products ORDER BY id')
      .all() as Array<{ id: string; stock_quantity: number }>;
    assertEqual(
      JSON.stringify(stockAfter),
      JSON.stringify(stockBefore),
      'GET does not change stock',
    );
    console.log('   ✓ no stock writes');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
    console.error('Phase 4.11 inventory valuation tests failed.');
    return;
  }
  console.log('Phase 4.11 inventory valuation tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
