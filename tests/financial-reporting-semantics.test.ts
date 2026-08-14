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
  seedProduct(db, 'prod-fin-2', 'cat-fin', 'Open Partial Latte', 1000);
  seedProduct(db, 'prod-fin-3', 'cat-fin', 'Stuck Partial Latte', 1000);

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
      body: {
        amount: refundAmount,
        method: 'cash',
        reason: 'Reporting semantics fixture',
        override_pin: '1234',
      },
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
    assertEqual(
      bills.netSales,
      Math.round((saleTotal - refundAmount) * 100) / 100,
      'Net Sales = Gross - Refunds',
    );

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
    assertEqual(
      daily.data.netSales,
      Math.round((saleTotal - refundAmount) * 100) / 100,
      'daily-stats Net Sales',
    );

    console.log('\nFIN-02 still-open partial is excluded from Gross/Net');
    const openOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-fin-2', quantity: 1 }] },
      headers: managerAuth,
    });
    assertEqual(openOrder.status, 201, 'open-partial order created');
    const openBill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: openOrder.data.order.id },
      headers: managerAuth,
    });
    assertEqual(openBill.status, 201, 'open-partial bill created');
    const openPay = await api(baseUrl, `/api/bills/${openBill.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 600 },
      headers: managerAuth,
    });
    assertEqual(openPay.status, 200, 'open partial tender 600');
    assertEqual(openPay.data.bill.payment_status, 'partial', 'open bill stays partial');
    const afterOpen = await api(baseUrl, `/api/reports/summary?date=${today}`, {
      method: 'GET',
      headers: managerAuth,
    });
    assertEqual(
      afterOpen.data.summary.bills.grossSales,
      saleTotal,
      'open partial does not add Gross',
    );
    assertEqual(
      afterOpen.data.summary.bills.netSales,
      Math.round((saleTotal - refundAmount) * 100) / 100,
      'open partial does not add Net',
    );

    console.log('\nFIN-02 collectible-complete stuck partial is included in Gross/Net');
    const stuckOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-fin-3', quantity: 1 }] },
      headers: managerAuth,
    });
    assertEqual(stuckOrder.status, 201, 'stuck-partial order created');
    const stuckTotal = Number(stuckOrder.data.order.total);
    const stuckBill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: stuckOrder.data.order.id },
      headers: managerAuth,
    });
    const stuckBillId = stuckBill.data.bill.id;
    const stuckPay1 = await api(baseUrl, `/api/bills/${stuckBillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 600 },
      headers: managerAuth,
    });
    assertEqual(stuckPay1.status, 200, 'stuck first tender 600');
    const stuckRefund = await api(baseUrl, `/api/bills/${stuckBillId}/refund`, {
      method: 'POST',
      body: { amount: 200, method: 'cash', reason: 'FIN-02 fixture', override_pin: '1234' },
      headers: { ...managerAuth, 'Idempotency-Key': `fin-02-${stuckBillId}` },
    });
    assertEqual(stuckRefund.status, 200, 'stuck refund 200');
    const stuckPay2 = await api(baseUrl, `/api/bills/${stuckBillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 400 },
      headers: managerAuth,
    });
    assertEqual(stuckPay2.status, 200, 'stuck repay 400');
    const stuckStored = await api(baseUrl, `/api/bills/${stuckBillId}`, {
      method: 'GET',
      headers: managerAuth,
    });
    assertEqual(stuckStored.data.bill.payment_status, 'partial', 'stored status remains partial');
    assertEqual(Number(stuckStored.data.bill.paid_amount), 800, 'stored paid_amount remains 800');

    const afterStuck = await api(baseUrl, `/api/reports/summary?date=${today}`, {
      method: 'GET',
      headers: managerAuth,
    });
    assertEqual(afterStuck.status, 200, 'summary after stuck-partial 200');
    assertEqual(
      afterStuck.data.summary.bills.grossSales,
      saleTotal + stuckTotal,
      'Gross includes collectible-complete partial',
    );
    assertEqual(
      afterStuck.data.summary.bills.refunds,
      refundAmount + 200,
      'Refunds include stuck-partial refund',
    );
    assertEqual(
      afterStuck.data.summary.bills.netSales,
      Math.round((saleTotal - refundAmount + 800) * 100) / 100,
      'Net includes stuck-partial paid_amount',
    );

    const repayBlocked = await api(baseUrl, `/api/bills/${stuckBillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 1 },
      headers: managerAuth,
    });
    assertEqual(repayBlocked.status, 400, 'FIN-01 still blocks further collect');
    assertEqual(repayBlocked.data.code, 'BILL_NO_OUTSTANDING_BALANCE', 'FIN-01 code unchanged');

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
