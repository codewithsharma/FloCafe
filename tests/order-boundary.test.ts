/**
 * Phase 2.14 (CURRENT) — Order domain boundary characterization.
 *
 * Step A: HTTP behavior only (must pass on current code before any move).
 * Step B: ownership facade assertions against main/services/order.ts.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/order-boundary.test.ts
 *    or: npm run test:order-boundary
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-order-boundary-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct,
  api, assert, assertEqual,
  getResults, closeDatabase,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { registerRoutes } = require('../main/routes/index');

async function main() {
  console.log('Phase 2.14 Order Boundary Characterization');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-ord', 'Order Boundary Menu');
  seedProduct(db, 'prod-ord-tracked', 'cat-ord', 'Order Boundary Latte', 100, {
    track_inventory: true,
    stock_quantity: 10,
  });

  const app = createApp({
    '/api/orders': orderRoutes,
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // ── 1. Create takeaway order → stock decrements ─────────────────────
    console.log('\n1. Create takeaway order with tracked product → stock decrements');
    const before = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-ord-tracked') as any;
    assertEqual(before.stock_quantity, 10, 'starting stock 10');

    const createRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [
          { product_id: 'prod-ord-tracked', quantity: 2 },
          { product_id: 'prod-ord-tracked', quantity: 1 },
        ],
      },
      headers: authHeader,
    });
    assertEqual(createRes.status, 201, 'order created');
    const orderId = createRes.data.order.id;
    const afterCreate = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-ord-tracked') as any;
    assertEqual(afterCreate.stock_quantity, 7, 'stock decremented by 3 (2+1)');

    const items = db.prepare(
      'SELECT id, quantity, status FROM order_items WHERE order_id = ? ORDER BY id'
    ).all(orderId) as any[];
    assertEqual(items.length, 2, 'two line items');
    const cancelItemId = items[0].id;
    const cancelQty = items[0].quantity;

    // ── 2. Partial item cancel → stock UNCHANGED (documented asymmetry) ─
    // Inventory is deducted on create. Soft-cancel of a pending line does NOT
    // call restoreTrackedStock unless every active item is gone. That means
    // partial cancel leaves stock low until full-order cancel / last-item path.
    console.log('\n2. Partial item cancel (2+ items) → stock UNCHANGED (asymmetry)');
    const midBefore = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-ord-tracked') as any;
    const cancelItem = await api(baseUrl, `/api/orders/${orderId}/items/${cancelItemId}/cancel`, {
      method: 'PATCH',
      body: {},
      headers: authHeader,
    });
    assert(cancelItem.status < 400, `partial cancel ok (${cancelItem.status})`);
    const cancelledRow = db.prepare('SELECT status FROM order_items WHERE id = ?').get(cancelItemId) as any;
    assertEqual(cancelledRow.status, 'cancelled', 'item marked cancelled');
    const midAfter = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-ord-tracked') as any;
    assertEqual(
      midAfter.stock_quantity,
      midBefore.stock_quantity,
      `stock unchanged after partial cancel of qty ${cancelQty} (ASYmmETRY: no restock on line cancel)`,
    );

    // ── 3. Full order cancel via PATCH status → stock restored ──────────
    // Remaining active qty was 1; create deducted 3 total. After partial cancel
    // stock is still 7. Full cancel restores ALL order_items quantities (incl.
    // the already-cancelled line) → +2 +1 = +3 → stock 10.
    console.log('\n3. Full order cancel via PATCH status cancelled → stock restored');
    const cancelOrder = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'order-boundary characterization' },
      headers: authHeader,
    });
    assert(cancelOrder.status < 400, `order cancel ok (${cancelOrder.status})`);
    const restored = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-ord-tracked') as any;
    assertEqual(restored.stock_quantity, 10, 'full cancel restored stock to 10');

    // ── 4. Ownership facade (Step B) ────────────────────────────────────
    console.log('\n4. Order service ownership facade');
    const orderServicePath = path.join(__dirname, '../main/services/order.ts');
    assert(fs.existsSync(orderServicePath), 'main/services/order.ts exists');

    const {
      ORDER_OWNED_CONCERNS,
      ORDER_DOES_NOT_OWN,
      assertOrderBoundaryInvariants,
    } = require('../main/services/order');

    assert(Array.isArray(ORDER_OWNED_CONCERNS) && ORDER_OWNED_CONCERNS.length > 0, 'ORDER_OWNED_CONCERNS exported');
    assert(Array.isArray(ORDER_DOES_NOT_OWN) && ORDER_DOES_NOT_OWN.length > 0, 'ORDER_DOES_NOT_OWN exported');

    const doesNotOwn = ORDER_DOES_NOT_OWN.map((s: string) => s.toLowerCase());
    assert(doesNotOwn.some((s: string) => s.includes('stock')), 'Order does NOT own stock mutations');
    assert(doesNotOwn.some((s: string) => s.includes('tax')), 'Order does NOT own tax engine');
    assert(
      doesNotOwn.some((s: string) => s.includes('payment') || s.includes('tender')),
      'Order does NOT own payment tender',
    );
    assert(doesNotOwn.some((s: string) => s.includes('kds')), 'Order does NOT own KDS');
    assert(
      ORDER_DOES_NOT_OWN.some((s: string) => /inventory|stock/i.test(s)),
      'stock mutations must use Inventory service',
    );
    assert(
      ORDER_DOES_NOT_OWN.some((s: string) => /tax/i.test(s)),
      'tax calculation must use Tax service',
    );

    assertOrderBoundaryInvariants();
    assert(true, 'assertOrderBoundaryInvariants() runs without throw');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll order-boundary checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
