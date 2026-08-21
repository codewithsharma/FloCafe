/**
 * RPT-DISC — Discount report (period JSON + CSV).
 *
 * Usage: npm run test:rpt-disc
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rpt-disc-'));
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

process.env.JWT_SECRET = 'rpt-disc-discount-report-secret';

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
const { couponRoutes } = require('../main/routes/coupons');
const { getSupportedSchemaVersion, utcTodayDate } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs } = require('../main/services/audit-log');
const {
  DISCOUNTS_CSV_HEADERS,
  discountReportToCsv,
  queryDiscountReport,
} = require('../main/services/discount-report');
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
    { userId, email: `${role}@test.local`, role, jti: `rpt-disc-${userId}` },
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
  assert(Math.abs(a - b) < 0.02, `${label}: expected ~${b}, got ${a}`);
}

async function createPaidOrder(
  baseUrl: string,
  headers: Record<string, string>,
  productId: string,
  idem: string,
): Promise<{ orderId: number; billId: number; subtotal: number; total: number; itemId: number }> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers: { ...headers, 'Idempotency-Key': idem },
  });
  assertEqual(order.status, 201, `order ${idem}`);
  const orderId = order.data.order.id;
  const itemId = order.data.order.items[0].id;
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: orderId },
    headers,
  });
  assertEqual(bill.status, 201, `bill ${idem}`);
  // Caller may discount before pay — return unpaid bill for discount path
  return {
    orderId,
    billId: bill.data.bill.id,
    subtotal: Number(order.data.order.subtotal),
    total: Number(order.data.order.total),
    itemId,
  };
}

async function payBill(
  baseUrl: string,
  headers: Record<string, string>,
  billId: number,
  amount: number,
): Promise<void> {
  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount },
    headers,
  });
  assertEqual(pay.status, 200, `pay bill ${billId}`);
}

async function main() {
  console.log('RPT-DISC — Discount report');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip is v89');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-disc', 'cashier', 'cashier-disc@test.local');
  seedRole(db, 'waiter-disc', 'waiter', 'waiter-disc@test.local');
  seedRole(db, 'chef-disc', 'chef', 'chef-disc@test.local');
  seedCategory(db, 'cat-disc', 'Disc Report');
  seedProduct(db, 'prod-disc-1', 'cat-disc', 'Disc Burger', 1000);
  seedProduct(db, 'prod-disc-2', 'cat-disc', 'Disc Split', 1000);
  seedProduct(db, 'prod-disc-3', 'cat-disc', 'Disc Coupon', 1000);
  seedProduct(db, 'prod-disc-4', 'cat-disc', 'Disc Cancel', 1000);
  seedProduct(db, 'prod-disc-5', 'cat-disc', 'Disc Item', 1000);
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const today = utcTodayDate();
  const empty = queryDiscountReport(db, today, today);
  assertEqual(empty.total_discounts, 0, 'empty total discounts');
  assertEqual(empty.order_discounts, 0, 'empty order discounts');
  assertEqual(empty.item_discounts, 0, 'empty item discounts');
  assertEqual(empty.discounted_bill_count, 0, 'empty discounted bills');
  assertEqual(empty.average_discount, 0, 'empty average');
  assertEqual(empty.by_type.length, 0, 'empty by_type');
  assertEqual(empty.by_source.length, 0, 'empty by_source');
  assertEqual(empty.by_scope.length, 0, 'empty by_scope');
  assertEqual(discountReportToCsv(empty).trim(), DISCOUNTS_CSV_HEADERS.join(','), 'empty CSV header only');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
    '/api/coupons': couponRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    // --- Fixed (amount) order discount ---
    const o1 = await createPaidOrder(baseUrl, owner.authHeader, 'prod-disc-1', `disc-o1-${Date.now()}`);
    // Regenerate flow: discount on order then refresh bill — bill generate already ran; apply discount then re-sync via payment after bill update
    const d1 = await api(baseUrl, `/api/orders/${o1.orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 100, discount_reason: 'Staff meal' },
      headers: owner.authHeader,
    });
    assertEqual(d1.status, 200, 'fixed discount applied');
    const total1 = Number(d1.data.order.total);
    const discAmt1 = Number(d1.data.order.discount_amount);
    moneyClose(discAmt1, 100, 'fixed discount amount');
    // Refresh unpaid bill from order (generate returns existing + sync)
    const bill1Refresh = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o1.orderId },
      headers: owner.authHeader,
    });
    assert(bill1Refresh.status === 200 || bill1Refresh.status === 201, 'bill1 refresh');
    const bill1Id = bill1Refresh.data.bill.id;
    await payBill(baseUrl, owner.authHeader, bill1Id, total1);

    // --- Percentage order discount ---
    const o2 = await createPaidOrder(baseUrl, owner.authHeader, 'prod-disc-2', `disc-o2-${Date.now()}`);
    const d2 = await api(baseUrl, `/api/orders/${o2.orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'percentage', discount_value: 10, discount_reason: 'Happy hour' },
      headers: owner.authHeader,
    });
    assertEqual(d2.status, 200, 'pct discount applied');
    const discAmt2 = Number(d2.data.order.discount_amount);
    const total2 = Number(d2.data.order.total);
    const bill2Refresh = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o2.orderId },
      headers: owner.authHeader,
    });
    await payBill(baseUrl, owner.authHeader, bill2Refresh.data.bill.id, total2);

    let report = queryDiscountReport(db, today, today);
    moneyClose(report.order_discounts, discAmt1 + discAmt2, 'order discounts sum');
    assertEqual(report.item_discounts, 0, 'no item discounts yet');
    moneyClose(report.total_discounts, discAmt1 + discAmt2, 'total = order');
    assertEqual(report.discounted_bill_count, 2, 'two discounted bills');
    moneyClose(report.average_discount, (discAmt1 + discAmt2) / 2, 'average discount');

    const pctRow = report.by_type.find((r: any) => r.type === 'percentage');
    const amtRow = report.by_type.find((r: any) => r.type === 'amount');
    assert(!!pctRow, 'percentage type row');
    assert(!!amtRow, 'amount type row');
    moneyClose(Number(amtRow.amount), discAmt1, 'amount type total');
    moneyClose(Number(pctRow.amount), discAmt2, 'percentage type total');

    const manualSrc = report.by_source.find((r: any) => r.source === 'manual');
    assert(!!manualSrc, 'manual source');
    moneyClose(Number(manualSrc.amount), discAmt1 + discAmt2, 'manual source total');

    const orderScope = report.by_scope.find((r: any) => r.scope === 'order');
    assert(!!orderScope, 'order scope');
    moneyClose(Number(orderScope.amount), discAmt1 + discAmt2, 'order scope amount');

    // --- Coupon (automatic) discount ---
    const coupon = await api(baseUrl, '/api/coupons', {
      method: 'POST',
      body: { code: 'SAVE50', amount_cents: 5000 },
      headers: owner.authHeader,
    });
    assertEqual(coupon.status, 201, 'coupon created');
    const o3 = await createPaidOrder(baseUrl, owner.authHeader, 'prod-disc-3', `disc-o3-${Date.now()}`);
    const c3 = await api(baseUrl, `/api/orders/${o3.orderId}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE50' },
      headers: owner.authHeader,
    });
    assertEqual(c3.status, 200, 'coupon applied');
    const discAmt3 = Number(c3.data.order.discount_amount);
    const total3 = Number(c3.data.order.total);
    moneyClose(discAmt3, 50, 'coupon ₹50');
    const bill3Refresh = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o3.orderId },
      headers: owner.authHeader,
    });
    await payBill(baseUrl, owner.authHeader, bill3Refresh.data.bill.id, total3);

    report = queryDiscountReport(db, today, today);
    const couponSrc = report.by_source.find((r: any) => r.source === 'coupon');
    assert(!!couponSrc, 'coupon source');
    moneyClose(Number(couponSrc.amount), discAmt3, 'coupon source amount');
    moneyClose(report.order_discounts, discAmt1 + discAmt2 + discAmt3, 'order discounts with coupon');

    // --- Item-level discount + order discount stack ---
    const o5 = await createPaidOrder(baseUrl, owner.authHeader, 'prod-disc-5', `disc-o5-${Date.now()}`);
    const itemDisc = await api(baseUrl, `/api/orders/${o5.orderId}/items/${o5.itemId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 40 },
      headers: owner.authHeader,
    });
    assertEqual(itemDisc.status, 200, 'item discount');
    moneyClose(Number(itemDisc.data.item.discount_amount), 40, 'item disc 40');
    const d5 = await api(baseUrl, `/api/orders/${o5.orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 20, discount_reason: 'Stack test' },
      headers: owner.authHeader,
    });
    assertEqual(d5.status, 200, 'order disc after item');
    const discAmt5 = Number(d5.data.order.discount_amount);
    moneyClose(discAmt5, 20, 'order disc 20 on stacked');
    const total5 = Number(d5.data.order.total);
    const bill5Refresh = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o5.orderId },
      headers: owner.authHeader,
    });
    await payBill(baseUrl, owner.authHeader, bill5Refresh.data.bill.id, total5);

    report = queryDiscountReport(db, today, today);
    moneyClose(report.item_discounts, 40, 'item discounts total');
    moneyClose(
      report.total_discounts,
      discAmt1 + discAmt2 + discAmt3 + discAmt5 + 40,
      'total includes item + order layers',
    );
    const itemScope = report.by_scope.find((r: any) => r.scope === 'item');
    assert(!!itemScope, 'item scope');
    moneyClose(Number(itemScope.amount), 40, 'item scope amount');
    assertEqual(report.discounted_bill_count, 4, 'four discounted bills');

    // --- Cancelled discounted order must NOT inflate report ---
    const o4 = await createPaidOrder(baseUrl, owner.authHeader, 'prod-disc-4', `disc-o4-${Date.now()}`);
    const d4 = await api(baseUrl, `/api/orders/${o4.orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 200, discount_reason: 'Will cancel' },
      headers: owner.authHeader,
    });
    assertEqual(d4.status, 200, 'discount before cancel');
    const cancel = await api(baseUrl, `/api/orders/${o4.orderId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'guest left' },
      headers: owner.authHeader,
    });
    assert(
      cancel.status === 200 || cancel.status === 201,
      `cancel discounted unpaid (${cancel.status})`,
    );
    const afterCancel = queryDiscountReport(db, today, today);
    moneyClose(afterCancel.total_discounts, report.total_discounts, 'cancel does not add discounts');
    assertEqual(afterCancel.discounted_bill_count, report.discounted_bill_count, 'cancel not counted');

    // --- Refund does not reverse discount ---
    const refundAmt = Math.round(total1 * 30) / 100;
    const refund = await api(baseUrl, `/api/bills/${bill1Id}/refund`, {
      method: 'POST',
      body: {
        amount: refundAmt,
        method: 'cash',
        reason: 'RPT-DISC fixture',
        override_pin: '1234',
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `disc-ref-${bill1Id}` },
    });
    assert(
      refund.status === 201 || refund.status === 200,
      `partial refund (${refund.status})`,
    );
    const afterRefund = queryDiscountReport(db, today, today);
    moneyClose(afterRefund.order_discounts, afterCancel.order_discounts, 'refund keeps order discounts');
    moneyClose(afterRefund.total_discounts, afterCancel.total_discounts, 'refund keeps total discounts');
    assert(afterRefund.sales.refunds > 0, 'sales.refunds context present after refund');

    // Reconciliation: merchandise_subtotal − order_discounts is pre-tax order-discounted base
    // (sales.grossSales is post-discount bill total incl tax — not Gross−Discount=Net)
    assert(afterRefund.merchandise_subtotal > 0, 'merchandise subtotal context');
    moneyClose(
      afterRefund.merchandise_subtotal - afterRefund.order_discounts,
      afterRefund.discounted_merchandise,
      'discounted_merchandise = subtotal − order_discounts',
    );

    // API owner / manager
    const ownerRes = await api(
      baseUrl,
      `/api/reports/discounts?start_date=${today}&end_date=${today}`,
      { headers: owner.authHeader },
    );
    assertEqual(ownerRes.status, 200, 'owner discounts report');
    moneyClose(ownerRes.data.discounts.total_discounts, afterRefund.total_discounts, 'API total matches');

    const mgrRes = await api(
      baseUrl,
      `/api/reports/discounts?start_date=${today}&end_date=${today}`,
      { headers: manager.authHeader },
    );
    assertEqual(mgrRes.status, 200, 'manager OK');

    for (const [id, role] of [
      ['cashier-disc', 'cashier'],
      ['waiter-disc', 'waiter'],
      ['chef-disc', 'chef'],
    ] as const) {
      const denied = await api(
        baseUrl,
        `/api/reports/discounts?start_date=${today}&end_date=${today}`,
        { headers: auth(id, role) },
      );
      assertEqual(denied.status, 403, `${role} denied discounts report`);
    }

    const bad = await api(baseUrl, `/api/reports/discounts?start_date=2026-08-21&end_date=2026-08-01`, {
      headers: owner.authHeader,
    });
    assertEqual(bad.status, 400, 'inverted range 400');

    // CSV parity + audit
    const csvRes = await apiText(
      baseUrl,
      `/api/reports/export/discounts.csv?start_date=${today}&end_date=${today}`,
      owner.authHeader,
    );
    assertEqual(csvRes.status, 200, 'CSV 200');
    assert(csvRes.contentType.includes('text/csv'), 'CSV content-type');
    const expectedCsv = discountReportToCsv(afterRefund);
    assertEqual(csvRes.text, expectedCsv, 'CSV matches service serializer');

    const audits = queryAuditLogs({
      action: 'report.discounts_exported',
      limit: 5,
    });
    assert(
      Array.isArray(audits) && audits.some((l: any) => l.action === 'report.discounts_exported'),
      'export audited',
    );

    // Far empty range
    const far = await api(
      baseUrl,
      `/api/reports/discounts?start_date=2000-01-01&end_date=2000-01-01`,
      { headers: owner.authHeader },
    );
    assertEqual(far.status, 200, 'far range OK');
    assertEqual(far.data.discounts.total_discounts, 0, 'far range empty');
    assertEqual(far.data.discounts.discounted_bill_count, 0, 'far range no bills');

    // FE source contracts
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const lib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/discount-report.ts'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(lib.includes('fetchDiscountReport'), 'FE lib fetchDiscountReport');
    assert(lib.includes('downloadDiscountsCsv'), 'FE lib CSV download');
    assert(page.includes('fetchDiscountReport') || page.includes('discountReport'), 'reports page wired');
    assert(en.includes('reports.discountsTitle'), 'i18n discounts title');
    assert(en.includes('No discounts were applied during this period'), 'empty-state copy');

    console.log('\nAll RPT-DISC checks passed.');
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
