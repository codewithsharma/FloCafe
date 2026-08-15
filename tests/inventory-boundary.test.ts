/**
 * Phase 2.7 — Inventory domain boundary characterization.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/inventory-boundary.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-inv-boundary-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
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

const { orderRoutes } = require('../main/routes/orders');
const { productRoutes } = require('../main/routes/products');
const { registerRoutes } = require('../main/routes/index');
const { adjustProductStock, LOW_STOCK_SQL_FRAGMENT } = require('../main/services/inventory');

async function main() {
  console.log('Phase 2.7 Inventory Boundary Characterization');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  seedCategory(db, 'cat-inv', 'Inventory Menu');
  seedProduct(db, 'prod-tracked', 'cat-inv', 'Tracked Latte', 100, {
    track_inventory: true,
    stock_quantity: 10,
  });
  seedProduct(db, 'prod-untracked', 'cat-inv', 'Untracked Cookie', 50, {
    track_inventory: false,
    stock_quantity: 2,
  });
  seedProduct(db, 'prod-low', 'cat-inv', 'Low Stock Muffin', 40, {
    track_inventory: true,
    stock_quantity: 3,
  });
  // low_stock_threshold defaults to 5 in schema; seedProduct may not set it — set explicitly
  db.prepare('UPDATE products SET low_stock_threshold = 5 WHERE id = ?').run('prod-low');
  db.prepare('UPDATE products SET low_stock_threshold = 5 WHERE id = ?').run('prod-tracked');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/products': productRoutes,
  });
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // 1. Sale decrements tracked stock
    console.log('\n1. Order create decrements tracked stock');
    const before = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(before.stock_quantity, 10, 'starting stock 10');
    const createRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-tracked', quantity: 3 }] },
      headers: authHeader,
    });
    assertEqual(createRes.status, 201, 'order created');
    const after = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(after.stock_quantity, 7, 'stock decremented by 3');
    const orderId = createRes.data.order.id;

    // 2. Insufficient stock blocks
    console.log('\n2. Insufficient stock blocks order');
    const failRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-tracked', quantity: 100 }] },
      headers: authHeader,
    });
    assertEqual(failRes.status, 400, 'insufficient stock returns HTTP 400');
    const unchanged = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(unchanged.stock_quantity, 7, 'stock unchanged after reject');

    // 3. Untracked ignores stock
    console.log('\n3. Untracked product ignores stock check');
    const utBefore = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-untracked') as any;
    const utRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-untracked', quantity: 50 }] },
      headers: authHeader,
    });
    assertEqual(utRes.status, 201, 'untracked order ok');
    const utAfter = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-untracked') as any;
    assertEqual(utAfter.stock_quantity, utBefore.stock_quantity, 'untracked stock unchanged');

    // 4. Manual adjust via service + HTTP
    console.log('\n4. POST /products/:id/stock adjust');
    const setRes = await api(baseUrl, '/api/products/prod-tracked/stock', {
      method: 'POST',
      body: { action: 'set', quantity: 20 },
      headers: { ...authHeader, 'Idempotency-Key': 'inv-bound-set' },
    });
    assertEqual(setRes.status, 200, 'stock set');
    assertEqual(setRes.data.product.stock_quantity, 20, 'set → 20');
    const inc = await api(baseUrl, '/api/products/prod-tracked/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 5 },
      headers: { ...authHeader, 'Idempotency-Key': 'inv-bound-inc' },
    });
    assertEqual(inc.data.product.stock_quantity, 25, 'increase → 25');
    const dec = await api(baseUrl, '/api/products/prod-tracked/stock', {
      method: 'POST',
      body: { action: 'decrease', quantity: 4 },
      headers: { ...authHeader, 'Idempotency-Key': 'inv-bound-dec' },
    });
    assertEqual(dec.data.product.stock_quantity, 21, 'decrease → 21');

    // 5. Decrease below stock
    console.log('\n5. Decrease below available → Insufficient stock');
    const over = await api(baseUrl, '/api/products/prod-tracked/stock', {
      method: 'POST',
      body: { action: 'decrease', quantity: 999 },
      headers: { ...authHeader, 'Idempotency-Key': 'inv-bound-over' },
    });
    assertEqual(over.status, 400, 'decrease overflow 400');
    assertEqual(over.data.error, 'Insufficient stock', 'Insufficient stock message');

    // 6. Low stock filter
    console.log('\n6. GET products?low_stock=true');
    assert(
      LOW_STOCK_SQL_FRAGMENT.includes('track_inventory'),
      'low-stock fragment owned by inventory',
    );
    const low = await api(baseUrl, '/api/products?low_stock=true', { headers: authHeader });
    assertEqual(low.status, 200, 'low stock list');
    const products = low.data.products || low.data;
    const lowIds = (Array.isArray(products) ? products : []).map((p: any) => p.id);
    assert(lowIds.includes('prod-low'), 'prod-low in low stock');
    assert(!lowIds.includes('prod-tracked'), 'prod-tracked (21>5) not low');

    // 7. Order cancel restores
    console.log('\n7. Order cancel restores stock');
    adjustProductStock('prod-tracked', 'set', 10);
    const o2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-tracked', quantity: 2 }] },
      headers: authHeader,
    });
    assertEqual(o2.status, 201, 'order2 created');
    const oid = o2.data.order.id;
    const mid = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(mid.stock_quantity, 8, 'after sale 8');
    const cancel = await api(baseUrl, `/api/orders/${oid}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'test cancel' },
      headers: authHeader,
    });
    assert(cancel.status < 400, `cancel ok (${cancel.status})`);
    const restored = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(restored.stock_quantity, 10, 'cancel restored to 10');

    console.log('\n7b. Repeat cancel must not restock again');
    const cancelAgain = await api(baseUrl, `/api/orders/${oid}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'repeat cancel' },
      headers: authHeader,
    });
    assert(cancelAgain.status < 400, `repeat cancel ok (${cancelAgain.status})`);
    const restoredAgain = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(restoredAgain.stock_quantity, 10, 'repeat cancel leaves stock at 10');

    console.log('\n7c. Paid order cancel is 409; stock and tender unchanged (H1)');
    adjustProductStock('prod-tracked', 'set', 10);
    const paidOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-tracked', quantity: 2 }] },
      headers: authHeader,
    });
    assertEqual(paidOrder.status, 201, 'paid-cancel order created');
    const paidOrderId = paidOrder.data.order.id;
    const genBill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: paidOrderId },
      headers: authHeader,
    });
    assertEqual(genBill.status, 201, 'bill generated');
    const paidBillId = genBill.data.bill.id;
    const payRes = await api(baseUrl, `/api/bills/${paidBillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: genBill.data.bill.total },
      headers: authHeader,
    });
    assertEqual(payRes.status, 200, 'tender applied');
    const stockAfterPay = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(stockAfterPay.stock_quantity, 8, 'stock still decremented after pay');
    const billAfterPay = db
      .prepare('SELECT paid_amount, payment_status, payment_details FROM bills WHERE id = ?')
      .get(paidBillId) as any;
    const paidCancel = await api(baseUrl, `/api/orders/${paidOrderId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'must use refund', override_pin: '1234' },
      headers: authHeader,
    });
    assertEqual(paidCancel.status, 409, 'paid cancel returns 409');
    assertEqual(
      paidCancel.data.code,
      'ORDER_HAS_SUCCESSFUL_TENDER',
      '409 code is ORDER_HAS_SUCCESSFUL_TENDER',
    );
    const stockAfterPaidCancel = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(stockAfterPaidCancel.stock_quantity, 8, 'paid cancel does not restock');
    const billAfterCancel = db
      .prepare('SELECT paid_amount, payment_status, payment_details FROM bills WHERE id = ?')
      .get(paidBillId) as any;
    assertEqual(billAfterCancel.paid_amount, billAfterPay.paid_amount, 'paid_amount unchanged');
    assertEqual(
      billAfterCancel.payment_status,
      billAfterPay.payment_status,
      'payment_status unchanged',
    );
    assertEqual(
      billAfterCancel.payment_details,
      billAfterPay.payment_details,
      'payment_details unchanged',
    );

    console.log('\n7d. Fully refunded bill still 409s cancel (H1)');
    const refundPaid = await api(baseUrl, `/api/bills/${paidBillId}/refund`, {
      method: 'POST',
      body: {
        amount: billAfterPay.paid_amount,
        method: 'cash',
        reason: 'H1 refunded cancel',
        override_pin: '1234',
      },
      headers: { ...managerAuth, 'Idempotency-Key': `h1-refund-${paidBillId}` },
    });
    assertEqual(refundPaid.status, 200, 'full refund ok');
    const refundedCancel = await api(baseUrl, `/api/orders/${paidOrderId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'after refund', override_pin: '1234' },
      headers: authHeader,
    });
    assertEqual(refundedCancel.status, 409, 'refunded bill still 409s cancel');
    const stockAfterRefundCancel = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(
      stockAfterRefundCancel.stock_quantity,
      8,
      'refunded cancel does not restock via cancel path',
    );

    console.log('\n7e. Generated unpaid bill (no tender) still restocks');
    adjustProductStock('prod-tracked', 'set', 10);
    const unpaidBilled = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-tracked', quantity: 1 }] },
      headers: authHeader,
    });
    const unpaidBill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: unpaidBilled.data.order.id },
      headers: authHeader,
    });
    assertEqual(unpaidBill.status, 201, 'unpaid bill generated');
    const unpaidCancel = await api(baseUrl, `/api/orders/${unpaidBilled.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'no tender' },
      headers: authHeader,
    });
    assert(unpaidCancel.status < 400, `unpaid billed cancel ok (${unpaidCancel.status})`);
    const stockUnpaidBilled = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get('prod-tracked') as any;
    assertEqual(stockUnpaidBilled.stock_quantity, 10, 'unpaid billed cancel restocks');

    // Silence unused var from step 1
    void orderId;
    // 8. Money refund does not restock — optional restock is a separate API (ADR-011)
    console.log('\n8. Refund policy: money path does not restock (service contract)');
    const refundSrc = fs.readFileSync(path.join(__dirname, '../main/services/refund.ts'), 'utf8');
    assert(
      refundSrc.includes('does not restock') || refundSrc.includes('No inventory restock'),
      'refund.ts documents money path does not restock',
    );
    assert(!refundSrc.includes('restoreTrackedStock'), 'refund does not call inventory restore');
    assert(!refundSrc.includes('stock_quantity'), 'refund does not mutate stock_quantity');
    assert(
      !refundSrc.includes('restockTrackedForRefund'),
      'createBillRefund does not call restockTrackedForRefund',
    );

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll inventory-boundary checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
