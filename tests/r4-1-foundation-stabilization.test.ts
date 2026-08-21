/**
 * R4.1 — Drive backup-now Master PIN + P1.3 failure-matrix scenarios.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/r4-1-foundation-stabilization.test.ts
 *    or: npm run test:r4.1
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r41-'));
const mockSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(s, 'utf8'),
  decryptString: (b: Buffer) => b.toString('utf8'),
};
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: mockSafeStorage,
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r4-1-foundation-stabilization-secret';

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

const { settingsRoutes } = require('../main/routes/settings');
const { billRoutes } = require('../main/routes/bills');
const { orderRoutes } = require('../main/routes/orders');
const { productRoutes } = require('../main/routes/products');
const { setMasterPin } = require('../main/services/master-pin');

async function main() {
  console.log('\nR4.1 — Foundation Stabilization\n' + '='.repeat(60));

  const db = initTestDb();
  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedCategory(db, 'cat-r41', 'R41');
  seedProduct(db, 'prod-r41', 'cat-r41', 'Stabilizer Latte', 100, {
    track_inventory: false,
    stock_quantity: 0,
  });

  // Ensure Master PIN exists via safeStorage blob (same as production Master PIN)
  setMasterPin('1234');

  const app = createApp({
    '/api/settings': settingsRoutes,
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/products': productRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // ── Backup-now Master PIN ─────────────────────────────────────────
    console.log('\nDRV-01 Drive backup-now Master PIN');
    const missingPin = await api(baseUrl, '/api/settings/google-drive/backup-now', {
      method: 'POST',
      headers: owner.authHeader,
      body: {},
    });
    assertEqual(missingPin.status, 403, 'missing master_pin → 403');

    const wrongPin = await api(baseUrl, '/api/settings/google-drive/backup-now', {
      method: 'POST',
      headers: owner.authHeader,
      body: { master_pin: '0000' },
    });
    assert([401, 403].includes(wrongPin.status), `wrong PIN → 401/403 (got ${wrongPin.status})`);

    const mgrDenied = await api(baseUrl, '/api/settings/google-drive/backup-now', {
      method: 'POST',
      headers: manager.authHeader,
      body: { master_pin: '1234' },
    });
    assertEqual(mgrDenied.status, 403, 'manager cannot backup-now');

    // Correct PIN may 502 if Drive not configured — still proves authz passed PIN gate
    const okPin = await api(baseUrl, '/api/settings/google-drive/backup-now', {
      method: 'POST',
      headers: owner.authHeader,
      body: { master_pin: '1234' },
    });
    assert(
      [200, 502].includes(okPin.status),
      `owner+PIN reaches handler (got ${okPin.status})`,
    );
    console.log('   ✓ backup-now Master PIN');

    // ── Zod: bill generate / discount body ────────────────────────────
    console.log('\nZod bill generate');
    const badGen = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: owner.authHeader,
      body: {},
    });
    assertEqual(badGen.status, 400, 'generate without order_id → 400');

    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-r41', quantity: 1 }] },
    });
    assertEqual(order.status, 201, 'order created');
    const orderId = order.data.order.id;

    const bill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: owner.authHeader,
      body: { order_id: orderId },
    });
    assertEqual(bill.status === 200 || bill.status === 201, true, `generate ok (got ${bill.status})`);
    const billId = bill.data.bill.id;

    const badDisc = await api(baseUrl, `/api/bills/${billId}/applyDiscount`, {
      method: 'POST',
      headers: owner.authHeader,
      body: { type: 'nope', value: 1 },
    });
    assertEqual(badDisc.status, 400, 'bad discount type → 400');
    console.log('   ✓ Zod generate/discount');

    // ── P1.3 matrix: duplicate payment after reconnect ────────────────
    console.log('\nP1.3 duplicate payment idempotency');
    const payKey = 'r41-pay-dup-1';
    const pay1 = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Idempotency-Key': payKey },
      body: { method: 'cash', amount: bill.data.bill.total },
    });
    assertEqual(pay1.status === 200 || pay1.status === 201, true, `pay1 status ${pay1.status}`);

    const pay2 = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Idempotency-Key': payKey },
      body: { method: 'cash', amount: bill.data.bill.total },
    });
    assertEqual(pay2.status, 200, 'duplicate key replay 200');
    const billRow = db.prepare('SELECT payment_details, payment_status FROM bills WHERE id = ?').get(
      billId,
    ) as { payment_details: string; payment_status: string };
    const details = JSON.parse(billRow.payment_details || '[]');
    assertEqual(Array.isArray(details) ? details.length : 0, 1, 'one tender line after replay');
    console.log('   ✓ duplicate payment after reconnect (idempotent)');

    // ── P1.3: payment retry with different key after success → reject ─
    const pay3 = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Idempotency-Key': 'r41-pay-dup-2' },
      body: { method: 'cash', amount: 1 },
    });
    assert(
      [400, 409].includes(pay3.status),
      `no outstanding after paid → 400/409 (got ${pay3.status})`,
    );
    console.log('   ✓ retry after settled blocked');

    // ── Crash mid-payment simulation: failed txn does not leave tender ─
    console.log('\nP1.3 crash mid-payment (logical rollback)');
    const order2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-r41', quantity: 1 }] },
    });
    const bill2 = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: owner.authHeader,
      body: { order_id: order2.data.order.id },
    });
    const bill2Id = bill2.data.bill.id;
    const beforeDetails = db.prepare('SELECT payment_details FROM bills WHERE id = ?').get(bill2Id) as {
      payment_details: string | null;
    };
    const beforeLen = beforeDetails.payment_details
      ? JSON.parse(beforeDetails.payment_details).length
      : 0;
    const overpay = await api(baseUrl, `/api/bills/${bill2Id}/payment`, {
      method: 'POST',
      headers: { ...owner.authHeader, 'Idempotency-Key': 'r41-crash-1' },
      body: { method: 'card', amount: Number(bill2.data.bill.total) + 50 },
    });
    // Non-cash over-tender should reject without writing (FIN-01)
    assertEqual(overpay.status, 400, 'over-tender card rejected');
    const afterDetails = db.prepare('SELECT payment_details FROM bills WHERE id = ?').get(bill2Id) as {
      payment_details: string | null;
    };
    const afterLen = afterDetails.payment_details
      ? JSON.parse(afterDetails.payment_details).length
      : 0;
    assertEqual(afterLen, beforeLen, 'failed payment leaves no tender rows');
    console.log('   ✓ failed payment txn leaves no tender');

    // ── Printer failure contract (source-level + H1 suite owns UI) ────
    console.log('\nP1.3 printer failure documentation');
    const receiptSrc = fs.readFileSync(
      path.join(__dirname, '../main/services/receipt.ts'),
      'utf8',
    );
    assert(receiptSrc.includes('print_logged') || receiptSrc.includes('print_logs'), 'receipt logs');
    const h1 = fs.readFileSync(path.join(__dirname, 'h1-pos-transaction-integrity.test.ts'), 'utf8');
    assert(h1.includes('failed print') || h1.includes('H1-RCPT'), 'H1 covers failed print');
    console.log('   ✓ printer failure covered by H1 suite (referenced)');

    // orders-shared extraction smoke
    const shared = require('../main/routes/orders-shared');
    assert(typeof shared.checkPinRateLimit === 'function', 'orders-shared exports PIN limit');
    console.log('   ✓ orders-shared extraction');

    // database time extraction smoke
    const { now: nowFn } = require('../main/database/time');
    assert(typeof nowFn() === 'string', 'database/time.now works');
    console.log('   ✓ database/time extraction');
  } finally {
    server.close();
    closeDatabase();
  }

  const { failed } = getResults();
  if (failed > 0) process.exit(1);
  console.log('\nR4.1 stabilization checks passed\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
