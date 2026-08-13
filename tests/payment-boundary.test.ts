/**
 * Phase 2.15 — Payment domain boundary characterization.
 *
 * Step A: HTTP / money behavior (must pass before tender extraction).
 * Step B: ownership facade assertions against main/services/payment-tender.ts.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/payment-boundary.test.ts
 *    or: npm run test:payment-boundary
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-payment-boundary-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory, seedProduct, seedTable,
  api, assert, assertEqual,
  getResults, closeDatabase,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');

async function main() {
  console.log('Phase 2.15 Payment Boundary Characterization');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  seedCategory(db, 'cat-pay', 'Payment Boundary Menu');
  seedProduct(db, 'prod-pay-1', 'cat-pay', 'Payment Boundary Latte', 1000);
  seedProduct(db, 'prod-pay-table', 'cat-pay', 'Table Meal', 500);
  seedTable(db, 'tbl-pay-1', 11, 4);

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
  });
  app.use('/api/bills', refundRoutes);

  const { baseUrl, server } = await startServer(app);

  try {
    // ── 1. Successful full payment ──────────────────────────────────────
    console.log('\n1. Takeaway order → bill → full cash payment succeeds');
    const createRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-pay-1', quantity: 1 }] },
      headers: authHeader,
    });
    assertEqual(createRes.status, 201, 'order created');
    const orderId = createRes.data.order.id;
    const total = Number(createRes.data.order.total);
    assertEqual(total, 1000, 'order total ₹1000 (taxes off)');

    const billRes = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: orderId },
      headers: authHeader,
    });
    assertEqual(billRes.status, 201, 'bill created');
    const billId = billRes.data.bill.id;

    const payRes = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: total },
      headers: authHeader,
    });
    assertEqual(payRes.status, 200, 'full payment accepted');
    assertEqual(payRes.data.bill.payment_status, 'paid', 'bill paid');
    assertEqual(Number(payRes.data.bill.balance), 0, 'balance 0');

    // ── 2. FIN-01: no outstanding after full tender (+ refund gap) ──────
    // Uses manager + PIN like integration-refunds §20.
    console.log('\n2. FIN-01 outstanding: full tender + refund still blocks repay');
    const repayBlocked = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 100 },
      headers: authHeader,
    });
    assertEqual(repayBlocked.status, 400, 'repay on paid bill rejected');

    const refund = await api(baseUrl, `/api/bills/${billId}/refund`, {
      method: 'POST',
      body: { amount: 200, method: 'cash', reason: 'payment-boundary FIN-01', override_pin: '1234' },
      headers: { ...managerAuth, 'Idempotency-Key': `pay-bound-refund-${billId}` },
    });
    assertEqual(refund.status, 200, 'partial refund accepted');
    assertEqual(
      refund.data.bill.payment_status,
      'partially_refunded',
      'status partially_refunded after gap refund',
    );

    const gapRepay = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 200 },
      headers: managerAuth,
    });
    assertEqual(gapRepay.status, 400, 'FIN-01: refund gap does not recreate collectible');
    assertEqual(gapRepay.data.code, 'BILL_NO_OUTSTANDING_BALANCE', 'stable BILL_NO_OUTSTANDING_BALANCE');

    // ── 3. Dine-in paid bill frees table (restaurant path) ─────────────
    console.log('\n3. Dine-in pay frees occupied table');
    const dineIn = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'dine_in',
        table_id: 'tbl-pay-1',
        items: [{ product_id: 'prod-pay-table', quantity: 1 }],
      },
      headers: authHeader,
    });
    assertEqual(dineIn.status, 201, 'dine_in order created');
    const tableBefore = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-pay-1') as { status: string };
    assertEqual(tableBefore.status, 'occupied', 'table occupied after dine_in create');

    const dineBill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: dineIn.data.order.id },
      headers: authHeader,
    });
    assertEqual(dineBill.status, 201, 'dine_in bill created');
    const dineTotal = Number(dineBill.data.bill.total);
    const dinePay = await api(baseUrl, `/api/bills/${dineBill.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: dineTotal },
      headers: authHeader,
    });
    assertEqual(dinePay.status, 200, 'dine_in payment accepted');
    assertEqual(dinePay.data.bill.payment_status, 'paid', 'dine_in bill paid');
    const tableAfter = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-pay-1') as { status: string };
    assertEqual(tableAfter.status, 'available', 'paid bill frees table');

    // ── 4. Ownership facade (Step B — after PaymentTenderService exists) ─
    console.log('\n4. Payment tender service ownership facade');
    const tenderPath = path.join(__dirname, '../main/services/payment-tender.ts');
    assert(fs.existsSync(tenderPath), 'main/services/payment-tender.ts exists');

    const {
      preparePaymentBatch,
      applyPaymentBatch,
      PAYMENT_OWNED_CONCERNS,
      PAYMENT_DOES_NOT_OWN,
      assertPaymentBoundaryInvariants,
    } = require('../main/services/payment-tender');

    assert(typeof preparePaymentBatch === 'function', 'preparePaymentBatch exported');
    assert(typeof applyPaymentBatch === 'function', 'applyPaymentBatch exported');
    assert(Array.isArray(PAYMENT_OWNED_CONCERNS) && PAYMENT_OWNED_CONCERNS.length > 0, 'PAYMENT_OWNED_CONCERNS exported');
    assert(Array.isArray(PAYMENT_DOES_NOT_OWN) && PAYMENT_DOES_NOT_OWN.length > 0, 'PAYMENT_DOES_NOT_OWN exported');

    const doesNotOwn = PAYMENT_DOES_NOT_OWN.map((s: string) => s.toLowerCase());
    assert(doesNotOwn.some((s: string) => s.includes('tax')), 'Payment does NOT own tax engine');
    assert(doesNotOwn.some((s: string) => s.includes('inventory') || s.includes('stock')), 'Payment does NOT own inventory');
    assert(doesNotOwn.some((s: string) => s.includes('kds')), 'Payment does NOT own KDS');
    assert(doesNotOwn.some((s: string) => s.includes('table')), 'Payment does NOT own tables');
    assert(doesNotOwn.some((s: string) => s.includes('print')), 'Payment does NOT own printing');

    assertPaymentBoundaryInvariants();
    assert(true, 'assertPaymentBoundaryInvariants() runs without throw');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll payment-boundary checks passed.');
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
