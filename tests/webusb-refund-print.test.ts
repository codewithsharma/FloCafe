/**
 * Phase 3.6G — WebUSB refund print parity contracts.
 *
 * Run: npm run test:webusb-refund-print
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-webusb-refund-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
  seedCategory,
  seedProduct,
  api,
  assert: assertOk,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');
const { printerRoutes } = require('../main/routes/printers');
const { formatRefundReceipt } = require('../main/printers/thermal');
const { getJWTSecret } = require('../main/routes/auth');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFe(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
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
  assertEqual(bill.status, 201, 'bill generated');
  const pay = await api(baseUrl, `/api/bills/${bill.data.bill.id}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount: bill.data.bill.total },
    headers: { ...authHeader, 'Idempotency-Key': `webusb-rf-${bill.data.bill.id}` },
  });
  assertEqual(pay.status, 200, 'bill paid');
  return { billId: bill.data.bill.id, total: bill.data.bill.total };
}

async function main() {
  console.log('Phase 3.6G WebUSB Refund Print Parity');
  console.log('='.repeat(60));

  // --- Static contracts ---
  const helper = readFe('lib/refund-receipt-print.ts');
  assertOk(helper.includes('webusb'), 'client helper handles webusb response');
  assertOk(
    helper.includes('printerService') || helper.includes('printerService.print'),
    'client sends via printerService',
  );
  assertOk(
    helper.includes('formatRefundReceipt') === false,
    'client does not reimplement server formatter',
  );
  assertOk(
    fs.existsSync(path.join(FRONTEND, 'lib/printer/PrinterService.ts')),
    'PrinterService exists',
  );

  const routeSrc = fs.readFileSync(path.join(ROOT, 'main/routes/printers.ts'), 'utf8');
  assertOk(routeSrc.includes("connection_type === 'webusb'"), 'print-refund path aware of webusb');
  assertOk(
    routeSrc.includes('buildRefundReceiptBytes'),
    'route reuses buildRefundReceiptBytes for webusb',
  );

  const thermal = fs.readFileSync(path.join(ROOT, 'main/printers/thermal.ts'), 'utf8');
  assertOk(thermal.includes('export function formatRefundReceipt'), 'formatter still exported');
  console.log('   ✓ static contracts');

  // --- API: webusb default returns bytes; money unchanged ---
  const db = initTestDb();
  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader } = seedManagerUser(db);
  void ownerAuth;
  seedCategory(db, 'cat-webusb-rf', 'WebUSB RF');
  seedProduct(db, 'prod-webusb-rf', 'cat-webusb-rf', 'WebUSB Item', 100);

  db.prepare(
    `INSERT INTO printers (id, name, connection_type, is_default, paper_width, created_at, updated_at)
     VALUES (?, ?, 'webusb', 1, '80mm', ?, ?)`,
  ).run('prn-webusb-rf', 'Browser WebUSB', now(), now());

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/printers': printerRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    const { billId, total } = await createPaidBill(baseUrl, authHeader, 'prod-webusb-rf');
    const refundRes = await api(baseUrl, `/api/bills/${billId}/refund`, {
      method: 'POST',
      body: { reason: 'webusb test', override_pin: '1234' },
      headers: { ...authHeader, 'Idempotency-Key': `webusb-refund-${billId}` },
    });
    assertEqual(
      refundRes.status,
      200,
      `refund created; got ${refundRes.status} ${JSON.stringify(refundRes.data)}`,
    );
    const refundId = refundRes.data.refund.id;
    const refundAmount = refundRes.data.refund.amount;
    void total;

    const printRes = await api(baseUrl, '/api/printers/print-refund', {
      method: 'POST',
      body: { refundId },
      headers: authHeader,
    });
    assertEqual(
      printRes.status,
      200,
      `webusb print-refund 200; got ${printRes.status} ${JSON.stringify(printRes.data)}`,
    );
    assertEqual(printRes.data.webusb, true, 'response marked webusb');
    assertOk(
      Array.isArray(printRes.data.bytes) && printRes.data.bytes.length > 10,
      'bytes payload present',
    );
    assertEqual(printRes.data.refundId, refundId, 'refundId echoed');

    const buf = Buffer.from(printRes.data.bytes);
    assertOk(buf.includes(0x1b), 'ESC present in payload');

    const after = db.prepare('SELECT amount, status FROM refunds WHERE id = ?').get(refundId) as {
      amount: number;
      status: string;
    };
    assertEqual(after.amount, refundAmount, 'refund amount unchanged after print-refund');
    assertOk(!!after.status, 'refund status still present');

    db.prepare(`UPDATE printers SET is_default = 0 WHERE id = ?`).run('prn-webusb-rf');
    db.prepare(
      `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
       VALUES (?, ?, 'network', '127.0.0.1', 9100, 1, '80mm', ?, ?)`,
    ).run('prn-net-rf', 'Net Printer', now(), now());

    const netPrint = await api(baseUrl, '/api/printers/print-refund', {
      method: 'POST',
      body: { refundId },
      headers: authHeader,
    });
    assertOk(
      netPrint.status === 502 || netPrint.status === 500,
      `network path fails closed without webusb flag (got ${netPrint.status})`,
    );
    assertOk(netPrint.data?.webusb !== true, 'network failure is not a webusb success');

    const afterNet = db.prepare('SELECT amount FROM refunds WHERE id = ?').get(refundId) as {
      amount: number;
    };
    assertEqual(
      afterNet.amount,
      refundAmount,
      'refund amount unchanged after network print failure',
    );

    const sample = formatRefundReceipt(
      { id: 1, amount: 10, method: 'cash', reason: 'x', created_at: now(), status: 'completed' },
      { id: 1, bill_number: 'B1', total: 10 },
      { name: 'Test' },
      48,
      false,
      'full',
    );
    assertOk(
      Buffer.isBuffer(sample) && sample.length > 0,
      'formatRefundReceipt still produces buffer',
    );

    console.log('   ✓ webusb bytes + money isolation + network path intact');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
    Module._load = originalLoad;
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { passed, failed, total } = getResults();
  console.log('='.repeat(60));
  console.log(`✅ Phase 3.6G webusb refund print (${passed}/${total}; failed=${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  Module._load = originalLoad;
  process.exit(1);
});
