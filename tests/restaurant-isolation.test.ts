/**
 * Phase 2.17 — Restaurant isolation (shared Order must not require tables/kds).
 *
 * Source contract: orders.ts soft-gates table occupy/free and KDS notify behind
 * isModuleEnabled. Restaurant ACTIVE vertical keeps tables+kds enabled → UX
 * unchanged. retail-test composition excludes restaurant-only modules (not
 * production-enabled).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/restaurant-isolation.test.ts
 *    or: npm run test:restaurant-isolation
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-restaurant-isolation-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct, seedTable,
  api, assert, assertEqual,
  getResults, closeDatabase,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const {
  isModuleEnabled,
  getCompositionSnapshot,
  ACTIVE_VERTICAL_ID,
  MODULE_CATALOG,
} = require('../main/modules');

const RESTAURANT_ONLY = ['tables', 'kitchen', 'kds', 'menu', 'addons'] as const;

async function main() {
  console.log('Phase 2.17 Restaurant Isolation');
  console.log('='.repeat(60));

  // ── 1. Source contract: orders.ts soft-gates tables + kds ─────────────
  console.log('\n1. Source contract: orders.ts uses isModuleEnabled for tables/kds');
  const ordersSrc = fs.readFileSync(path.join(__dirname, '../main/routes/orders.ts'), 'utf8');
  assert(
    /import\s*\{[^}]*isModuleEnabled[^}]*\}\s*from\s*['"]\.\.\/modules['"]/.test(ordersSrc),
    'orders.ts imports isModuleEnabled from modules',
  );
  assert(
    /isModuleEnabled\(\s*['"]tables['"]\s*\)/.test(ordersSrc),
    "orders.ts soft-gates tables with isModuleEnabled('tables')",
  );
  assert(
    /isModuleEnabled\(\s*['"]kds['"]\s*\)/.test(ordersSrc),
    "orders.ts soft-gates KDS with isModuleEnabled('kds')",
  );
  // Every notifyKdsUpdate call site must be soft-gated (no bare call left).
  const bareNotify = ordersSrc.match(/^\s*notifyKdsUpdate\(\);/gm) || [];
  assertEqual(bareNotify.length, 0, 'no ungated notifyKdsUpdate() call sites in orders.ts');
  const gatedNotify = ordersSrc.match(/isModuleEnabled\(\s*['"]kds['"]\s*\)\s*\)?\s*notifyKdsUpdate\(\)/g)
    || ordersSrc.match(/if\s*\(\s*isModuleEnabled\(\s*['"]kds['"]\s*\)\s*\)\s*notifyKdsUpdate\(\)/g)
    || [];
  assert(gatedNotify.length >= 6, `at least 6 KDS soft-gates (found ${gatedNotify.length})`);

  // Shared modules must not declare restaurant deps (catalog contract).
  console.log('\n2. Catalog: shared modules do not depend on restaurant modules');
  const restaurantIds = new Set(
    MODULE_CATALOG.filter((m: { kind: string }) => m.kind === 'restaurant').map((m: { id: string }) => m.id),
  );
  for (const mod of MODULE_CATALOG) {
    if (mod.kind === 'restaurant') continue;
    const bad = (mod.dependencies || []).filter((d: string) => restaurantIds.has(d));
    assertEqual(bad.length, 0, `${mod.id} (${mod.kind}) must not depend on restaurant modules`);
  }

  // ── 3. Composition: restaurant vs retail-test ─────────────────────────
  console.log('\n3. Composition: restaurant enables tables/kds; retail-test excludes restaurant-only');
  assertEqual(ACTIVE_VERTICAL_ID, 'restaurant', 'production ACTIVE remains restaurant');
  assert(isModuleEnabled('tables'), 'restaurant enables tables');
  assert(isModuleEnabled('kds'), 'restaurant enables kds');
  assert(isModuleEnabled('order'), 'restaurant enables order');
  assert(isModuleEnabled('payment'), 'restaurant enables payment');

  for (const id of RESTAURANT_ONLY) {
    assert(!isModuleEnabled(id, 'retail-test'), `retail-test excludes ${id}`);
  }
  assert(isModuleEnabled('order', 'retail-test'), 'retail-test still includes order');
  assert(isModuleEnabled('payment', 'retail-test'), 'retail-test still includes payment');

  const retailSnap = getCompositionSnapshot({ verticalId: 'retail-test' });
  assertEqual(retailSnap.vertical.id, 'retail-test', 'retail-test snapshot vertical');
  const retailModules: string[] = retailSnap.modules.enabled || [];
  for (const id of RESTAURANT_ONLY) {
    assert(!retailModules.includes(id), `retail-test snapshot excludes ${id}`);
  }
  assert(retailModules.includes('order'), 'retail-test snapshot includes order');
  assert(retailModules.includes('payment'), 'retail-test snapshot includes payment');

  // ── 4. Restaurant UX unchanged: dine-in still occupies table ──────────
  console.log('\n4. Restaurant default: dine-in create still occupies table');
  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-ri', 'Restaurant Isolation Menu');
  seedProduct(db, 'prod-ri-1', 'cat-ri', 'Isolation Latte', 400);
  seedTable(db, 'tbl-ri-1', 21, 4);

  const app = createApp({
    '/api/orders': orderRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const dineIn = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'dine_in',
        table_id: 'tbl-ri-1',
        items: [{ product_id: 'prod-ri-1', quantity: 1 }],
      },
      headers: authHeader,
    });
    assertEqual(dineIn.status, 201, 'dine_in order created');
    assertEqual(dineIn.data.order.table_id, 'tbl-ri-1', 'order linked to table');
    const tableAfter = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-ri-1') as { status: string };
    assertEqual(tableAfter.status, 'occupied', 'table occupied when tables module enabled (restaurant)');

    // Complete frees table (still soft-gated; restaurant has tables on).
    console.log('\n5. Restaurant default: complete still frees table');
    const complete = await api(baseUrl, `/api/orders/${dineIn.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'completed' },
      headers: authHeader,
    });
    assertEqual(complete.status, 200, 'order completed');
    const tableFreed = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-ri-1') as { status: string };
    assertEqual(tableFreed.status, 'available', 'completed order frees table when tables enabled');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll restaurant-isolation checks passed.');
  } finally {
    server.close();
    closeDatabase();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
