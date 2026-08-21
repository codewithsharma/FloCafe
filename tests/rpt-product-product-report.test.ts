/**
 * RPT-PRODUCT — Product performance report.
 * Usage: npm run test:rpt-product
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rpt-product-'));
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

process.env.JWT_SECRET = 'rpt-product-product-report-secret';

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
  PRODUCTS_CSV_HEADERS,
  productReportToCsv,
  queryProductReport,
} = require('../main/services/product-report');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(db: any, id: string, role: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, `${id}@test.local`, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `rpt-prod-${userId}` },
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

async function main() {
  console.log('RPT-PRODUCT — Product performance report');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip remains v88');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-prod', 'cashier');
  seedRole(db, 'waiter-prod', 'waiter');
  seedRole(db, 'chef-prod', 'chef');
  seedCategory(db, 'cat-drinks', 'Drinks');
  seedCategory(db, 'cat-food', 'Food');
  seedProduct(db, 'prod-latte', 'cat-drinks', 'Latte', 200);
  seedProduct(db, 'prod-burger', 'cat-food', 'Burger', 500);

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const today = utcTodayDate();
  const empty = queryProductReport(db, today, today);
  assertEqual(empty.by_product.length, 0, 'empty products');
  assertEqual(empty.totals.merchandise_sales, 0, 'empty merchandise');
  assertEqual(productReportToCsv(empty).trim(), PRODUCTS_CSV_HEADERS.join(','), 'empty CSV header');
  assert(empty.attribution.merchandise_sales.includes('subtotal'), 'attribution documented');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    // Order 1: latte x2 + burger x1, pay
    const o1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [
          { product_id: 'prod-latte', quantity: 2 },
          { product_id: 'prod-burger', quantity: 1 },
        ],
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-o1-${Date.now()}` },
    });
    assertEqual(o1.status, 201, 'order1');
    const bill1 = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o1.data.order.id },
      headers: owner.authHeader,
    });
    assertEqual(bill1.status, 201, 'bill1');
    const pay1 = await api(baseUrl, `/api/bills/${bill1.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: Number(o1.data.order.total) },
      headers: owner.authHeader,
    });
    assertEqual(pay1.status, 200, 'pay1');

    let report = queryProductReport(db, today, today);
    assertEqual(report.by_product.length, 2, 'two products');
    const latte = report.by_product.find((r: any) => r.product_id === 'prod-latte');
    const burger = report.by_product.find((r: any) => r.product_id === 'prod-burger');
    assert(!!latte && !!burger, 'latte + burger rows');
    assertEqual(latte.quantity_sold, 2, 'latte qty');
    assertEqual(burger.quantity_sold, 1, 'burger qty');
    moneyClose(latte.merchandise_sales, 400, 'latte merchandise 2x200');
    moneyClose(burger.merchandise_sales, 500, 'burger merchandise');
    moneyClose(
      report.totals.merchandise_sales,
      latte.merchandise_sales + burger.merchandise_sales,
      'totals = sum products',
    );

    // Category reconciliation
    const catSum = report.by_category.reduce((s: number, c: any) => s + c.merchandise_sales, 0);
    moneyClose(catSum, report.totals.merchandise_sales, 'category sum == product merchandise');
    assertEqual(report.by_product[0].product_id, 'prod-burger', 'default sort merchandise desc');

    // Cancelled unpaid order must not count
    const oCancel = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-latte', quantity: 5 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-cancel-${Date.now()}` },
    });
    assertEqual(oCancel.status, 201, 'cancel order');
    const cancel = await api(baseUrl, `/api/orders/${oCancel.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'rpt-product fixture' },
      headers: owner.authHeader,
    });
    assertEqual(cancel.status, 200, 'cancelled');
    report = queryProductReport(db, today, today);
    const latteAfterCancel = report.by_product.find((r: any) => r.product_id === 'prod-latte');
    assertEqual(latteAfterCancel.quantity_sold, 2, 'cancelled order excluded');

    // Item discount on new settled order
    const oDisc = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-burger', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-disc-${Date.now()}` },
    });
    const itemId = oDisc.data.order.items[0].id;
    const itemDisc = await api(baseUrl, `/api/orders/${oDisc.data.order.id}/items/${itemId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 50, discount_reason: 'comp' },
      headers: owner.authHeader,
    });
    assertEqual(itemDisc.status, 200, 'item discount');
    moneyClose(Number(itemDisc.data.item.discount_amount), 50, 'item disc 50');
    const billDisc = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: oDisc.data.order.id },
      headers: owner.authHeader,
    });
    assertEqual(billDisc.status, 201, 'bill after item disc');
    const totalDisc = Number(billDisc.data.bill.total);
    await api(baseUrl, `/api/bills/${billDisc.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: totalDisc },
      headers: owner.authHeader,
    });
    report = queryProductReport(db, today, today);
    const burgerDisc = report.by_product.find((r: any) => r.product_id === 'prod-burger');
    assert(burgerDisc.item_discounts >= 50, 'item discounts attributed');
    moneyClose(burgerDisc.merchandise_sales, 500 + 450, 'burger merchandise post item discount');

    // Order-level discount context only (not allocated)
    const oOrderDisc = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-latte', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-odisc-${Date.now()}` },
    });
    const od = await api(baseUrl, `/api/orders/${oOrderDisc.data.order.id}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 20, discount_reason: 'order comp' },
      headers: owner.authHeader,
    });
    const billOd = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: oOrderDisc.data.order.id },
      headers: owner.authHeader,
    });
    await api(baseUrl, `/api/bills/${billOd.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: Number(od.data.order.total) },
      headers: owner.authHeader,
    });
    report = queryProductReport(db, today, today);
    assert(report.totals.order_discounts_context >= 20, 'order discount context');
    // Latte merchandise still full line subtotal (not reduced by order discount)
    const latteMerch = report.by_product.find((r: any) => r.product_id === 'prod-latte');
    assert(latteMerch.merchandise_sales >= 600, 'order discount not allocated to lines');

    // Refund does not change merchandise
    const merchBeforeRefund = report.totals.merchandise_sales;
    const refundAmt = 50;
    const refund = await api(baseUrl, `/api/bills/${bill1.data.bill.id}/refund`, {
      method: 'POST',
      body: {
        amount: refundAmt,
        method: 'cash',
        reason: 'RPT-PRODUCT fixture',
        override_pin: '1234',
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-ref-${bill1.data.bill.id}` },
    });
    assert(refund.status === 200 || refund.status === 201, `refund (${refund.status})`);
    report = queryProductReport(db, today, today);
    moneyClose(report.totals.merchandise_sales, merchBeforeRefund, 'refund does not change merchandise');
    assert(report.sales.refunds >= refundAmt, 'sales.refunds context');

    // Split payment does not double-count
    const oSplit = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-latte', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-split-${Date.now()}` },
    });
    const billSplit = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: oSplit.data.order.id },
      headers: owner.authHeader,
    });
    const half = Number(oSplit.data.order.total) / 2;
    await api(baseUrl, `/api/bills/${billSplit.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: half },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-sp1-${billSplit.data.bill.id}` },
    });
    await api(baseUrl, `/api/bills/${billSplit.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'card', amount: half },
      headers: { ...owner.authHeader, 'Idempotency-Key': `prod-sp2-${billSplit.data.bill.id}` },
    });
    const beforeSplit = report.totals.quantity_sold;
    report = queryProductReport(db, today, today);
    assertEqual(report.totals.quantity_sold, beforeSplit + 1, 'split pay adds qty once');

    // Category filter
    const drinksOnly = queryProductReport(db, today, today, { categoryId: 'cat-drinks' });
    assert(
      drinksOnly.by_product.every((r: any) => r.category_id === 'cat-drinks'),
      'category filter',
    );

    // Sort by name
    const byName = queryProductReport(db, today, today, { sort: 'product_name' });
    assert(
      byName.by_product[0].product_name.localeCompare(byName.by_product[1]?.product_name || '') <= 0,
      'name sort',
    );

    // API RBAC
    const ownerRes = await api(
      baseUrl,
      `/api/reports/products?start_date=${today}&end_date=${today}`,
      { headers: owner.authHeader },
    );
    assertEqual(ownerRes.status, 200, 'owner products');
    moneyClose(
      ownerRes.data.products.totals.merchandise_sales,
      report.totals.merchandise_sales,
      'API merchandise',
    );

    assertEqual(
      (
        await api(baseUrl, `/api/reports/products?start_date=${today}&end_date=${today}`, {
          headers: manager.authHeader,
        })
      ).status,
      200,
      'manager OK',
    );

    for (const [id, role] of [
      ['cashier-prod', 'cashier'],
      ['waiter-prod', 'waiter'],
      ['chef-prod', 'chef'],
    ] as const) {
      const denied = await api(
        baseUrl,
        `/api/reports/products?start_date=${today}&end_date=${today}`,
        { headers: auth(id, role) },
      );
      assertEqual(denied.status, 403, `${role} denied`);
    }

    const bad = await api(
      baseUrl,
      `/api/reports/products?start_date=2026-08-21&end_date=2026-08-01`,
      { headers: owner.authHeader },
    );
    assertEqual(bad.status, 400, 'inverted range');

    const csvRes = await apiText(
      baseUrl,
      `/api/reports/export/products.csv?start_date=${today}&end_date=${today}`,
      owner.authHeader,
    );
    assertEqual(csvRes.status, 200, 'CSV 200');
    assertEqual(csvRes.text, productReportToCsv(report), 'CSV matches JSON serializer');

    const audits = queryAuditLogs({ action: 'report.products_exported', limit: 5 });
    assert(
      Array.isArray(audits) && audits.some((l: any) => l.action === 'report.products_exported'),
      'export audited',
    );

    const far = await api(
      baseUrl,
      `/api/reports/products?start_date=2000-01-01&end_date=2000-01-01`,
      { headers: owner.authHeader },
    );
    assertEqual(far.status, 200, 'far empty');
    assertEqual(far.data.products.by_product.length, 0, 'far empty rows');

    // FE contracts
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const lib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/product-report.ts'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(lib.includes('fetchProductReport'), 'FE lib');
    assert(page.includes('fetchProductReport') || page.includes('productReport'), 'page wired');
    assert(en.includes('reports.productsTitle'), 'i18n');
    assert(en.includes('No product sales in this period.'), 'empty copy');

    console.log('\nAll RPT-PRODUCT checks passed.');
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
