/**
 * Phase 2.9 — Product ↔ Inventory stock write ownership.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/product-inventory-boundary.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-prod-inv-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory,
  api, assert, assertEqual,
  getResults, closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');

const { productRoutes } = require('../main/routes/products');
const { orderRoutes } = require('../main/routes/orders');
const { registerRoutes } = require('../main/routes/index');
const { withTxn } = require('../main/db');
const {
  getMovements,
  applyAbsoluteStockChange,
  compareCurrentStockToLedger,
} = require('../main/services/inventory');

async function main() {
  console.log('Phase 2.9 Product ↔ Inventory Boundary');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-pi', 'PI Boundary');

  const app = createApp({
    '/api/products': productRoutes,
    '/api/orders': orderRoutes,
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // ── Create with opening stock ─────────────────────────────────────
    console.log('\n1. Product create with initial stock → opening adjustment');
    const create = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Boundary Latte',
        price: 120,
        category_id: 'cat-pi',
        track_inventory: true,
        stock_quantity: 25,
        low_stock_threshold: 5,
      },
      headers: authHeader,
    });
    assertEqual(create.status, 201, 'create 201');
    const prodId = create.data.product.id;
    assertEqual(create.data.product.stock_quantity, 25, 'stock cache = 25');
    const openMoves = getMovements(prodId);
    assertEqual(openMoves.length, 1, 'one opening movement');
    assertEqual(openMoves[0].movement_type, 'adjustment', 'type=adjustment');
    assertEqual(openMoves[0].quantity_delta, 25, 'delta=+25');
    assertEqual(openMoves[0].reason, 'opening', 'reason=opening');
    assertEqual(openMoves[0].stock_after, 25, 'stock_after=25');

    // ── Create zero stock → no movement ───────────────────────────────
    console.log('\n2. Product create stock 0 → no movement');
    const zero = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Zero Stock Tea',
        price: 50,
        category_id: 'cat-pi',
        track_inventory: true,
        stock_quantity: 0,
      },
      headers: authHeader,
    });
    assertEqual(zero.status, 201, 'zero create 201');
    assertEqual(getMovements(zero.data.product.id).length, 0, 'no movement for zero stock');

    // ── Metadata-only update (same stock) → no movement ───────────────
    console.log('\n3. PUT same stock → no new movement');
    const beforeCount = getMovements(prodId).length;
    const same = await api(baseUrl, `/api/products/${prodId}`, {
      method: 'PUT',
      body: {
        name: 'Boundary Latte Renamed',
        price: 130,
        stock_quantity: 25,
        track_inventory: true,
      },
      headers: authHeader,
    });
    assertEqual(same.status, 200, 'put same stock 200');
    assertEqual(same.data.product.name, 'Boundary Latte Renamed', 'name updated');
    assertEqual(same.data.product.stock_quantity, 25, 'stock unchanged');
    assertEqual(getMovements(prodId).length, beforeCount, 'no new movement');

    // ── Stock increase via PUT ────────────────────────────────────────
    console.log('\n4. PUT stock increase → positive adjustment');
    const up = await api(baseUrl, `/api/products/${prodId}`, {
      method: 'PUT',
      body: { stock_quantity: 40, name: 'Boundary Latte Renamed' },
      headers: authHeader,
    });
    assertEqual(up.status, 200, 'put increase 200');
    assertEqual(up.data.product.stock_quantity, 40, 'stock=40');
    const upMove = getMovements(prodId)[0];
    assertEqual(upMove.quantity_delta, 15, 'delta=+15 (40-25)');
    assertEqual(upMove.reason, 'product_update', 'reason=product_update');
    assertEqual(upMove.stock_after, 40, 'stock_after=40');

    // ── Stock decrease via PUT ────────────────────────────────────────
    console.log('\n5. PUT stock decrease → negative adjustment');
    const down = await api(baseUrl, `/api/products/${prodId}`, {
      method: 'PUT',
      body: { stock_quantity: 37 },
      headers: authHeader,
    });
    assertEqual(down.status, 200, 'put decrease 200');
    assertEqual(down.data.product.stock_quantity, 37, 'stock=37');
    assertEqual(getMovements(prodId)[0].quantity_delta, -3, 'delta=-3');

    // ── Dedicated stock endpoint still works ──────────────────────────
    console.log('\n6. POST /:id/stock still works');
    const adj = await api(baseUrl, `/api/products/${prodId}/stock`, {
      method: 'POST',
      body: { action: 'increase', quantity: 3 },
      headers: authHeader,
    });
    assertEqual(adj.status, 200, 'stock endpoint 200');
    assertEqual(adj.data.product.stock_quantity, 40, 'stock=40 after increase');

    // ── Atomicity: inventory failure rolls back metadata ──────────────
    console.log('\n7. CRITICAL — inventory failure rolls back product metadata');
    const nameBefore = (db.prepare('SELECT name, stock_quantity FROM products WHERE id = ?').get(prodId) as any);
    let failed = false;
    try {
      withTxn(() => {
        db.prepare('UPDATE products SET name = ?, updated_at = ? WHERE id = ?')
          .run('SHOULD_ROLLBACK', now(), prodId);
        applyAbsoluteStockChange(db, prodId, -1, { reason: 'force_fail' });
      });
    } catch {
      failed = true;
    }
    assert(failed, 'txn threw on invalid stock');
    const afterFail = db.prepare('SELECT name, stock_quantity FROM products WHERE id = ?').get(prodId) as any;
    assertEqual(afterFail.name, nameBefore.name, 'name rolled back');
    assertEqual(afterFail.stock_quantity, nameBefore.stock_quantity, 'stock rolled back');

    // ── Soft-delete preserves ledger ──────────────────────────────────
    console.log('\n8. Soft-delete preserves inventory_movements');
    const moveCount = (db.prepare(
      'SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?',
    ).get(prodId) as any).c;
    assert(moveCount > 0, 'movements exist before delete');
    const del = await api(baseUrl, `/api/products/${prodId}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    assert(del.status < 400, `soft-delete ok (${del.status})`);
    const deleted = db.prepare('SELECT deleted_at FROM products WHERE id = ?').get(prodId) as any;
    assert(!!deleted.deleted_at, 'deleted_at set');
    assertEqual(
      (db.prepare('SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?').get(prodId) as any).c,
      moveCount,
      'ledger rows preserved after soft-delete',
    );

    // ── No direct stock SQL in products route (source check) ──────────
    console.log('\n9. products route has no direct stock_quantity mutation SQL');
    const src = fs.readFileSync(path.join(__dirname, '../main/routes/products.ts'), 'utf8');
    assert(!/stock_quantity\s*=\s*COALESCE/.test(src), 'no COALESCE stock update');
    assert(!/stock_quantity\s*\|\|\s*0/.test(src), 'create does not inline stock_quantity||0');
    assert(src.includes('applyAbsoluteStockChange'), 'uses applyAbsoluteStockChange');

    // ── Refund policy unchanged ───────────────────────────────────────
    console.log('\n10. Refund still does not restock');
    const refundSrc = fs.readFileSync(path.join(__dirname, '../main/services/refund.ts'), 'utf8');
    assert(refundSrc.includes('No inventory restock'), 'refund no restock');

    // ── Sale still works on a fresh product ───────────────────────────
    console.log('\n11. Sale still records sale movement');
    const saleProd = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Sale Bound',
        price: 10,
        category_id: 'cat-pi',
        track_inventory: true,
        stock_quantity: 5,
      },
      headers: authHeader,
    });
    const saleId = saleProd.data.product.id;
    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: saleId, quantity: 2 }] },
      headers: authHeader,
    });
    assertEqual(order.status, 201, 'sale order ok');
    assertEqual(
      (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(saleId) as any).stock_quantity,
      3,
      'sale stock 5→3',
    );
    const saleMove = getMovements(saleId).find((m: any) => m.movement_type === 'sale');
    assert(!!saleMove, 'sale movement present');
    assertEqual(saleMove.quantity_delta, -2, 'sale delta=-2');
    assertEqual(compareCurrentStockToLedger(saleId).valid, true, 'reconcile valid');

    const { failed: failCount } = getResults();
    if (failCount > 0) {
      console.error(`\nFAILED: ${failCount} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll product-inventory-boundary checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
