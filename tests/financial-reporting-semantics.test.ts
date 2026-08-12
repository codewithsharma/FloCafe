/**
 * P0.2 — Reporting financial semantics (Gross / Refunds / Net / Payments Received).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/financial-reporting-semantics.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-fin-report-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'financial-reporting-test-secret';

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory, seedProduct,
  api, assert, assertEqual, getResults, closeDatabase, now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');
const { reportRoutes } = require('../main/routes/reports');
const { utcTodayDate } = require('../main/db');

async function main() {
  console.log('P0.2 Financial reporting semantics');
  console.log('='.repeat(60));

  const db = initTestDb();
  seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  seedCategory(db, 'cat-fin', 'Finance Menu');
  seedProduct(db, 'prod-fin-1', 'cat-fin', 'Report Latte', 1000);

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);

  const { baseUrl, server } = await startServer(app);

  try {
    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-fin-1', quantity: 1 }] },
      headers: managerAuth,
    });
    assertEqual(order.status, 201, 'order created');
    const saleTotal = Number(order.data.order.total);

    const bill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: order.data.order.id },
      headers: managerAuth,
    });
    assertEqual(bill.status, 201, 'bill created');
    const billId = bill.data.bill.id;

    const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: saleTotal },
      headers: managerAuth,
    });
    assertEqual(pay.status, 200, 'payment accepted');

    const refundAmount = Math.round(saleTotal * 30) / 100;
    const refund = await api(baseUrl, `/api/bills/${billId}/refund`, {
      method: 'POST',
      body: { amount: refundAmount, method: 'cash', reason: 'Reporting semantics fixture', override_pin: '1234' },
      headers: { ...managerAuth, 'Idempotency-Key': `fin-report-${billId}` },
    });
    assertEqual(refund.status, 200, 'partial refund ok');
    assertEqual(refund.data.bill.payment_status, 'partially_refunded', 'partially_refunded');

    const today = utcTodayDate();
    const summary = await api(baseUrl, `/api/reports/summary?date=${today}`, {
      method: 'GET',
      headers: managerAuth,
    });
    assertEqual(summary.status, 200, 'summary 200');
    const bills = summary.data.summary.bills;
    assertEqual(bills.grossSales, saleTotal, 'Gross Sales = sale total');
    assertEqual(bills.refunds, refundAmount, 'Refunds = refund amount');
    assertEqual(bills.netSales, Math.round((saleTotal - refundAmount) * 100) / 100, 'Net Sales = Gross - Refunds');

    const methodTotal = (summary.data.summary.paymentMethods || []).reduce(
      (sum: number, row: { total: number }) => sum + Number(row.total || 0),
      0,
    );
    assertEqual(methodTotal, saleTotal, 'Payments Received remains gross tender');

    const sales = await api(baseUrl, `/api/reports/sales?start_date=${today}&end_date=${today}`, {
      method: 'GET',
      headers: managerAuth,
    });
    assertEqual(sales.status, 200, 'sales 200');
    const salesMethodTotal = (sales.data.sales.byPaymentMethod || []).reduce(
      (sum: number, row: { total: number }) => sum + Number(row.total || 0),
      0,
    );
    assertEqual(salesMethodTotal, saleTotal, '/sales method mix keeps tender after refund');

    const daily = await api(baseUrl, '/api/reports/daily-stats', {
      method: 'GET',
      headers: managerAuth,
    });
    assertEqual(daily.status, 200, 'daily-stats 200');
    assertEqual(daily.data.grossSales, saleTotal, 'daily-stats Gross Sales');
    assertEqual(daily.data.refunds, refundAmount, 'daily-stats Refunds');
    assertEqual(daily.data.netSales, Math.round((saleTotal - refundAmount) * 100) / 100, 'daily-stats Net Sales');

    // Touch now() so the fixture timestamp stays in-range if clocks skew in CI noise.
    void now;
  } finally {
    server.close();
    closeDatabase();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Financial reporting semantics tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
