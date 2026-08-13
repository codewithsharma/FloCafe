/**
 * Phase 2.17 — Order path restaurant isolation (behavioral companion).
 *
 * Confirms shared Order HTTP still works for takeaway without implying table
 * occupancy, and that restaurant dine-in occupy/free remains intact under the
 * ACTIVE restaurant vertical (tables+kds enabled by default).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/order-restaurant-isolation.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-order-rest-iso-'));
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

async function main() {
  console.log('Phase 2.17 Order Restaurant Isolation (behavioral)');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-ori', 'Order Restaurant Isolation');
  seedProduct(db, 'prod-ori-1', 'cat-ori', 'Takeaway Bun', 150);
  seedProduct(db, 'prod-ori-2', 'cat-ori', 'Dine Meal', 350);
  seedTable(db, 'tbl-ori-1', 31, 2);

  const app = createApp({
    '/api/orders': orderRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // Shared commerce path: takeaway never touches table status.
    console.log('\n1. Takeaway create does not require / mutate tables');
    const before = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-ori-1') as { status: string };
    assertEqual(before.status, 'available', 'table starts available');

    const takeaway = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-ori-1', quantity: 1 }] },
      headers: authHeader,
    });
    assertEqual(takeaway.status, 201, 'takeaway order created');
    assertEqual(takeaway.data.order.table_id ?? null, null, 'takeaway has no table_id');
    const afterTakeaway = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-ori-1') as { status: string };
    assertEqual(afterTakeaway.status, 'available', 'takeaway left table untouched');

    // Restaurant path unchanged with modules ON.
    console.log('\n2. Dine-in occupy + cancel free (restaurant modules ON)');
    const dineIn = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'dine_in',
        table_id: 'tbl-ori-1',
        items: [{ product_id: 'prod-ori-2', quantity: 1 }],
      },
      headers: authHeader,
    });
    assertEqual(dineIn.status, 201, 'dine_in created');
    const occupied = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-ori-1') as { status: string };
    assertEqual(occupied.status, 'occupied', 'dine_in occupies table');

    const cancel = await api(baseUrl, `/api/orders/${dineIn.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'isolation test', free_table: true },
      headers: authHeader,
    });
    assertEqual(cancel.status, 200, 'order cancelled');
    const freed = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-ori-1') as { status: string };
    assertEqual(freed.status, 'available', 'cancel frees table when tables enabled');

    // Soft-gate presence (companion to restaurant-isolation source contract).
    console.log('\n3. Soft-gate markers present in orders.ts');
    const ordersSrc = fs.readFileSync(path.join(__dirname, '../main/routes/orders.ts'), 'utf8');
    assert(/isModuleEnabled\(\s*['"]tables['"]\s*\)/.test(ordersSrc), 'tables soft-gate present');
    assert(/isModuleEnabled\(\s*['"]kds['"]\s*\)/.test(ordersSrc), 'kds soft-gate present');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll order-restaurant-isolation checks passed.');
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
