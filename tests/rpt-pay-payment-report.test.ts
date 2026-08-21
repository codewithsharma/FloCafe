/**
 * RPT-PAY — Payment report deepen (period JSON + CSV).
 *
 * Usage: npm run test:rpt-pay
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rpt-pay-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(s, 'utf8'),
        decryptString: (b: Buffer) => b.toString('utf8'),
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'rpt-pay-payment-report-secret';

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
  now,
} = require('./helpers/test-setup');

const { reportRoutes } = require('../main/routes/reports');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');
const { getSupportedSchemaVersion, utcTodayDate } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs } = require('../main/services/audit-log');
const {
  PAYMENTS_CSV_HEADERS,
  paymentReportToCsv,
  queryPaymentReport,
} = require('../main/services/payment-report');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(db: any, id: string, role: string, email: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, email, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `rpt-pay-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

async function apiText(
  baseUrl: string,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; contentType: string }> {
  const response = await (globalThis as any).fetch(baseUrl + urlPath, { headers });
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: String(response.headers.get('content-type') || ''),
  };
}

function moneyClose(a: number, b: number, label: string): void {
  assert(Math.abs(a - b) < 0.005, `${label}: expected ~${b}, got ${a}`);
}

async function main() {
  console.log('RPT-PAY — Payment report deepen');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip is v89');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-rpt', 'cashier', 'cashier@test.local');
  seedRole(db, 'waiter-rpt', 'waiter', 'waiter@test.local');
  seedRole(db, 'chef-rpt', 'chef', 'chef@test.local');
  seedCategory(db, 'cat-rpt', 'Pay Report');
  seedProduct(db, 'prod-rpt-1', 'cat-rpt', 'Report Burger', 1000);
  seedProduct(db, 'prod-rpt-2', 'cat-rpt', 'Report Split', 1000);

  // Empty window unit
  const today = utcTodayDate();
  const empty = queryPaymentReport(db, today, today);
  assertEqual(empty.payments_received, 0, 'empty gross payments');
  assertEqual(empty.refunds, 0, 'empty refunds');
  assertEqual(empty.net_payments, 0, 'empty net');
  assertEqual(empty.by_method.length, 0, 'empty methods');
  assertEqual(paymentReportToCsv(empty).trim(), PAYMENTS_CSV_HEADERS.join(','), 'empty CSV header only');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    // Cash full pay
    const order1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-rpt-1', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `rpt-o1-${Date.now()}` },
    });
    assertEqual(order1.status, 201, 'order1 created');
    const total1 = Number(order1.data.order.total);
    const bill1 = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: order1.data.order.id },
      headers: owner.authHeader,
    });
    assertEqual(bill1.status, 201, 'bill1');
    const pay1 = await api(baseUrl, `/api/bills/${bill1.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: total1 },
      headers: owner.authHeader,
    });
    assertEqual(pay1.status, 200, 'cash pay');

    // Split tender: cash + card
    const order2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-rpt-2', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `rpt-o2-${Date.now()}` },
    });
    assertEqual(order2.status, 201, 'order2');
    const total2 = Number(order2.data.order.total);
    const bill2 = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: order2.data.order.id },
      headers: owner.authHeader,
    });
    const cashPart = Math.round(total2 * 40) / 100;
    const cardPart = Math.round((total2 - cashPart) * 100) / 100;
    const pay2 = await api(baseUrl, `/api/bills/${bill2.data.bill.id}/payments`, {
      method: 'POST',
      body: {
        payments: [
          { method: 'cash', amount: cashPart },
          { method: 'card', amount: cardPart },
        ],
      },
      headers: owner.authHeader,
    });
    assertEqual(pay2.status, 200, 'split pay');

    let report = queryPaymentReport(db, today, today);
    moneyClose(report.payments_received, total1 + total2, 'gross payments both bills');
    assert(report.payment_line_count >= 3, 'cash + cash + card lines');
    const cashRow = report.by_method.find((m: any) => m.method === 'cash');
    const cardRow = report.by_method.find((m: any) => m.method === 'card');
    assert(!!cashRow, 'cash method present');
    assert(!!cardRow, 'card method present');
    moneyClose(Number(cashRow.payments_received), total1 + cashPart, 'cash tender sum');
    moneyClose(Number(cardRow.payments_received), cardPart, 'card tender');
    moneyClose(report.net_payments, report.payments_received, 'net=gross before refund');

    // Partial refund on bill1 — Payments Received must stay gross
    const refundAmt = Math.round(total1 * 30) / 100;
    const refund = await api(baseUrl, `/api/bills/${bill1.data.bill.id}/refund`, {
      method: 'POST',
      body: {
        amount: refundAmt,
        method: 'cash',
        reason: 'RPT-PAY fixture',
        override_pin: '1234',
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `rpt-ref-${bill1.data.bill.id}` },
    });
    assert(
      refund.status === 201 || refund.status === 200,
      `partial refund (${refund.status})`,
    );

    report = queryPaymentReport(db, today, today);
    moneyClose(report.payments_received, total1 + total2, 'gross payments unchanged after refund');
    moneyClose(report.refunds, refundAmt, 'refund total');
    moneyClose(report.net_payments, total1 + total2 - refundAmt, 'net = gross − refunds');
    moneyClose(report.sales.refunds, refundAmt, 'sales.refunds aligns');
    assert(report.sales.grossSales > 0, 'sales context present');

    // API owner OK
    const ownerRes = await api(baseUrl, `/api/reports/payments?start_date=${today}&end_date=${today}`, {
      headers: owner.authHeader,
    });
    assertEqual(ownerRes.status, 200, 'owner payments report');
    moneyClose(ownerRes.data.payments.net_payments, report.net_payments, 'API net matches');

    const mgrRes = await api(baseUrl, `/api/reports/payments?start_date=${today}&end_date=${today}`, {
      headers: manager.authHeader,
    });
    assertEqual(mgrRes.status, 200, 'manager OK');

    // RBAC denials
    for (const [id, role] of [
      ['cashier-rpt', 'cashier'],
      ['waiter-rpt', 'waiter'],
      ['chef-rpt', 'chef'],
    ] as const) {
      const denied = await api(baseUrl, `/api/reports/payments?start_date=${today}&end_date=${today}`, {
        headers: auth(id, role),
      });
      assertEqual(denied.status, 403, `${role} denied payments report`);
    }

    // Invalid range
    const bad = await api(baseUrl, `/api/reports/payments?start_date=2026-08-21&end_date=2026-08-01`, {
      headers: owner.authHeader,
    });
    assertEqual(bad.status, 400, 'inverted range 400');

    // CSV parity + audit
    const csvRes = await apiText(
      baseUrl,
      `/api/reports/export/payments.csv?start_date=${today}&end_date=${today}`,
      owner.authHeader,
    );
    assertEqual(csvRes.status, 200, 'CSV 200');
    assert(csvRes.contentType.includes('text/csv'), 'CSV content-type');
    const csvLines = csvRes.text.trim().split('\n');
    assertEqual(csvLines[0], PAYMENTS_CSV_HEADERS.join(','), 'CSV headers');
    assert(
      csvLines.length === report.by_method.length + 2,
      `CSV rows = methods + total (got ${csvLines.length}, methods ${report.by_method.length})`,
    );
    const expectedCsv = paymentReportToCsv(report);
    assertEqual(csvRes.text, expectedCsv, 'CSV matches service serializer');

    const audits = queryAuditLogs({
      action: 'report.payments_exported',
      limit: 5,
    });
    assert(
      Array.isArray(audits) && audits.some((l: any) => l.action === 'report.payments_exported'),
      'export audited',
    );

    // Zero-result distant range
    const far = await api(baseUrl, `/api/reports/payments?start_date=2000-01-01&end_date=2000-01-01`, {
      headers: owner.authHeader,
    });
    assertEqual(far.status, 200, 'far range OK');
    assertEqual(far.data.payments.payment_line_count, 0, 'far range empty payments');
    assertEqual(far.data.payments.by_method.length, 0, 'far range empty methods');

    // FE source contracts
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const lib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/payment-report.ts'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(lib.includes('fetchPaymentReport'), 'FE lib fetchPaymentReport');
    assert(lib.includes('downloadPaymentsCsv'), 'FE lib CSV download');
    assert(page.includes('fetchPaymentReport') || page.includes('paymentReport'), 'reports page wired');
    assert(en.includes('reports.paymentsTitle'), 'i18n payments title');

    console.log('\nAll RPT-PAY checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
