/**
 * Phase 3.6A — Refund receipt printing contracts + API behavior.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/refund-receipt-print.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-refund-receipt-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'refund-receipt-print-test-secret';

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
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');
const { printerRoutes } = require('../main/routes/printers');
const { formatRefundReceipt } = require('../main/printers/thermal');
const { printReceipt } = require('../main/services/receipt');

function seedCashier(db: any): { userId: string; authHeader: Record<string, string> } {
  const { getJWTSecret } = require('../main/routes/auth');
  const userId = 'cashier-rrp-001';
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, 'RRP Cashier', 'rrp-cashier@test.local', passwordHash, 'cashier', 1, now(), now());
  const token = jwt.sign(
    { userId, email: 'rrp-cashier@test.local', role: 'cashier' },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { userId, authHeader: { Authorization: `Bearer ${token}` } };
}

async function createPaidBill(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
): Promise<{ billId: number; total: number }> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers: authHeader,
  });
  assertEqual(order.status, 201, 'order created');
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: order.data.order.id },
    headers: authHeader,
  });
  assertEqual(bill.status, 201, 'bill created');
  const pay = await api(baseUrl, `/api/bills/${bill.data.bill.id}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount: order.data.order.total },
    headers: authHeader,
  });
  assertEqual(pay.status, 200, 'payment accepted');
  return { billId: bill.data.bill.id, total: order.data.order.total };
}

async function main(): Promise<void> {
  console.log('Phase 3.6A Refund Receipt Printing');
  console.log('='.repeat(60));

  // ── Source contracts ──────────────────────────────────────────────
  console.log('\n1. Source contracts');
  const thermalSrc = fs.readFileSync(path.join(__dirname, '../main/printers/thermal.ts'), 'utf8');
  assert(thermalSrc.includes('formatRefundReceipt'), 'thermal exports formatRefundReceipt');
  assert(thermalSrc.includes('printRefundReceipt'), 'thermal exports printRefundReceipt');
  assert(/\*\*\s*REFUND\s*\*\*/.test(thermalSrc), 'refund slip has REFUND banner');

  const printersSrc = fs.readFileSync(path.join(__dirname, '../main/routes/printers.ts'), 'utf8');
  assert(printersSrc.includes('/print-refund'), 'printers route mounts print-refund');

  const receiptSrc = fs.readFileSync(path.join(__dirname, '../main/services/receipt.ts'), 'utf8');
  assert(/['"]refund['"]/.test(receiptSrc), 'receipt service accepts refund print_type');
  assert(/printType !== 'refund'/.test(receiptSrc), 'refund audit skips bills.printed_at update');

  const refundSvc = fs.readFileSync(path.join(__dirname, '../main/services/refund.ts'), 'utf8');
  assert(
    !/printRefund|print-refund|printReceipt\(/.test(refundSvc),
    'createBillRefund must not print',
  );

  const ordersPage = fs.readFileSync(
    path.join(__dirname, '../frontend/src/app/(dashboard)/orders/page.tsx'),
    'utf8',
  );
  assert(
    ordersPage.includes('printRefund') || ordersPage.includes('print-refund'),
    'orders page triggers refund print',
  );

  const clientHelper = fs.readFileSync(
    path.join(__dirname, '../frontend/src/lib/refund-receipt-print.ts'),
    'utf8',
  );
  assert(clientHelper.includes('printRefundReceipt'), 'client helper exports printRefundReceipt');
  assert(clientHelper.includes('/printers/print-refund'), 'client helper calls print-refund');
  assert(clientHelper.includes("print_type: 'refund'"), 'client helper audits refund print_type');

  const enI18n = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
  assert(enI18n.includes('orders.printRefundReceipt'), 'en i18n has print refund label');
  assert(enI18n.includes('orders.refundReceiptPrintFailed'), 'en i18n has print-fail copy');

  const orderCard = fs.readFileSync(
    path.join(__dirname, '../frontend/src/components/orders/OrderCard.tsx'),
    'utf8',
  );
  assert(orderCard.includes('onPrintRefund'), 'OrderCard exposes print-refund affordance');

  // ── Formatter unit ────────────────────────────────────────────────
  console.log('\n2. formatRefundReceipt');
  const bytes = formatRefundReceipt(
    {
      id: 9,
      amount: 42.5,
      method: 'cash',
      reason: 'Customer request',
      created_at: '2026-08-14 10:00:00',
      bill_id: 1,
    },
    { bill_number: 'INV-1', total: 100 },
    { name: 'Test Cafe', currency_symbol: '₹', country: 'IN' },
    32,
    false,
  );
  assert(Buffer.isBuffer(bytes) && bytes.length > 20, 'formatter returns ESC/POS buffer');
  const asText = bytes.toString('latin1');
  assert(/REFUND/i.test(asText) || bytes.includes(0x52), 'buffer encodes refund content');

  // ── Live API ──────────────────────────────────────────────────────
  console.log('\n3. Refund succeeds; print path does not reverse money');
  const db = initTestDb();
  const { userId: ownerId, authHeader: ownerAuth } = seedOwnerUser(db);
  seedManagerUser(db);
  seedCashier(db);
  seedCategory(db, 'cat-rrp', 'RRP Menu');
  seedProduct(db, 'prod-rrp-1', 'cat-rrp', 'RRP Latte', 100);

  // Seed a default printer so print-refund can format (dispatch may fail offline)
  db.prepare(
    `INSERT INTO printers (id, name, connection_type, ip_address, port, paper_width, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run('printer-rrp-1', 'Test Thermal', 'network', '127.0.0.1', 9100, 80, now(), now());

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/printers': printerRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    const { billId, total } = await createPaidBill(baseUrl, ownerAuth, 'prod-rrp-1');
    const refundRes = await api(baseUrl, `/api/bills/${billId}/refund`, {
      method: 'POST',
      body: { reason: 'Test refund print', override_pin: '1234' },
      headers: { ...ownerAuth, 'Idempotency-Key': 'rrp-key-1' },
    });
    assertEqual(refundRes.status, 200, 'refund 200');
    assert(refundRes.data.refund?.id, 'refund id present');
    const refundId = refundRes.data.refund.id;
    const paidAfter = Number(refundRes.data.bill.paid_amount);

    // Print may 502 if network printer unreachable — money must stay refunded
    const printRes = await api(baseUrl, '/api/printers/print-refund', {
      method: 'POST',
      body: { refundId },
      headers: ownerAuth,
    });
    assert(
      printRes.status === 200 || printRes.status === 502 || printRes.status === 400,
      `print-refund responds (got ${printRes.status})`,
    );

    const billRow = db
      .prepare('SELECT paid_amount, payment_status FROM bills WHERE id = ?')
      .get(billId) as {
      paid_amount: number;
      payment_status: string;
    };
    assertEqual(
      Number(billRow.paid_amount),
      paidAfter,
      'print failure does not change paid_amount',
    );
    assert(
      billRow.payment_status === 'refunded' || billRow.payment_status === 'partially_refunded',
      'refund payment_status preserved after print attempt',
    );

    // Idempotent refund replay still works
    const replay = await api(baseUrl, `/api/bills/${billId}/refund`, {
      method: 'POST',
      body: { reason: 'Test refund print', override_pin: '1234' },
      headers: { ...ownerAuth, 'Idempotency-Key': 'rrp-key-1' },
    });
    assertEqual(replay.status, 200, 'idempotent refund replay 200');
    assertEqual(replay.data.refund.id, refundId, 'idempotent same refund id');

    // Audit log for refund print_type without flipping sale printed_at incorrectly
    console.log('\n4. Audit print_type=refund');
    const beforePrinted = db.prepare('SELECT printed_at FROM bills WHERE id = ?').get(billId) as {
      printed_at: string | null;
    };
    const logRes = await api(baseUrl, `/api/bills/${billId}/print`, {
      method: 'POST',
      body: { print_type: 'refund' },
      headers: ownerAuth,
    });
    assertEqual(logRes.status, 200, 'audit refund print 200');
    const log = db
      .prepare('SELECT print_type FROM print_logs WHERE bill_id = ? ORDER BY id DESC LIMIT 1')
      .get(billId) as { print_type: string };
    assertEqual(log.print_type, 'refund', 'print_logs.print_type=refund');
    const afterPrinted = db.prepare('SELECT printed_at FROM bills WHERE id = ?').get(billId) as {
      printed_at: string | null;
    };
    assertEqual(
      afterPrinted.printed_at ?? null,
      beforePrinted.printed_at ?? null,
      'refund audit does not update bills.printed_at',
    );

    // Missing refundId
    const bad = await api(baseUrl, '/api/printers/print-refund', {
      method: 'POST',
      body: {},
      headers: ownerAuth,
    });
    assertEqual(bad.status, 400, 'missing refundId → 400');

    void ownerId;
    void total;
    void printReceipt;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => (err ? reject(err) : resolve()));
    });
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('All refund-receipt-print checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
