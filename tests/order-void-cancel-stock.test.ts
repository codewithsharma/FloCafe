/**
 * Phase 3.4 — Void × cancel restock correctness.
 *
 * Void of preparing/ready does not restock (write-off). Later full-order
 * cancel must NOT restore voided or void_adjustment lines (stock stays 8).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/order-void-cancel-stock.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-order-void-cancel-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory, seedProduct,
  api, assert, assertEqual,
  getResults, closeDatabase, now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { registerRoutes } = require('../main/routes/index');

async function main() {
  console.log('Phase 3.4 Void × Cancel Stock Correctness');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  // Manager PIN 1234 — required to void preparing/ready items
  seedManagerUser(db);
  seedCategory(db, 'cat-void', 'Void Cancel Menu');
  seedProduct(db, 'prod-void-tracked', 'cat-void', 'Void Boundary Mocha', 120, {
    track_inventory: true,
    stock_quantity: 10,
  });

  const app = createApp({
    '/api/orders': orderRoutes,
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\n1. Create order (qty 2) → stock 10 → 8');
    const createRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-void-tracked', quantity: 2 }],
      },
      headers: authHeader,
    });
    assertEqual(createRes.status, 201, 'order created');
    const orderId = createRes.data.order.id;
    const item = db.prepare('SELECT id, quantity, status FROM order_items WHERE order_id = ?').get(orderId) as any;
    assertEqual(item.quantity, 2, 'line qty 2');
    let stock = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-void-tracked') as any;
    assertEqual(stock.stock_quantity, 8, 'stock after sale = 8');

    // Feasible via SQL: kitchen already started — void path requires preparing/ready
    console.log('\n2. SQL: set item status preparing');
    db.prepare('UPDATE order_items SET status = ?, updated_at = ? WHERE id = ?')
      .run('preparing', now(), item.id);
    assertEqual(
      (db.prepare('SELECT status FROM order_items WHERE id = ?').get(item.id) as any).status,
      'preparing',
      'item preparing',
    );

    console.log('\n3. Void with manager PIN → stock UNCHANGED');
    const voidRes = await api(baseUrl, `/api/orders/${orderId}/items/${item.id}/cancel`, {
      method: 'PATCH',
      body: { override_pin: '1234' },
      headers: authHeader,
    });
    assert(voidRes.status < 400, `void ok (${voidRes.status})`);
    assertEqual(
      (db.prepare('SELECT status FROM order_items WHERE id = ?').get(item.id) as any).status,
      'voided',
      'item voided',
    );
    const voidAdj = db.prepare(
      "SELECT id, quantity, status FROM order_items WHERE order_id = ? AND status = 'void_adjustment'"
    ).get(orderId) as any;
    assert(voidAdj, 'void_adjustment line exists');
    stock = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-void-tracked') as any;
    assertEqual(stock.stock_quantity, 8, 'void deliberately does not restock (stock still 8)');

    console.log('\n4. Cancel whole order → stock stays 8 (voided/void_adjustment skipped)');
    const cancelRes = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: {
        status: 'cancelled',
        reason: 'void×cancel correctness',
        override_pin: '1234',
      },
      headers: authHeader,
    });
    assert(cancelRes.status < 400, `order cancel ok (${cancelRes.status})`);

    stock = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-void-tracked') as any;
    assertEqual(
      stock.stock_quantity,
      8,
      'after void×cancel: stock stays 8 (voided/void_adjustment not restored)',
    );
    console.log('   Correct: void leaves stock alone; later cancel does not over-restore.');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll void×cancel stock checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
