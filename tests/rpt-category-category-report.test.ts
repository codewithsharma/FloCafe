/**
 * RPT-CATEGORY — Category performance report.
 * Usage: npm run test:rpt-category
 *
 * Thin projection of P11 product report by_category — no duplicate settlement SQL.
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rpt-category-'));
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

process.env.JWT_SECRET = 'rpt-category-category-report-secret';

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
const { queryProductReport } = require('../main/services/product-report');
const {
  CATEGORIES_CSV_HEADERS,
  categoryReportToCsv,
  queryCategoryReport,
} = require('../main/services/category-report');
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
    { userId, email: `${role}@test.local`, role, jti: `rpt-cat-${userId}` },
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

function rowsEqual(a: any[], b: any[], label: string): void {
  assertEqual(JSON.stringify(a), JSON.stringify(b), label);
}

async function main() {
  console.log('RPT-CATEGORY — Category performance report');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip remains v88');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-cat', 'cashier');
  seedRole(db, 'waiter-cat', 'waiter');
  seedRole(db, 'chef-cat', 'chef');
  seedCategory(db, 'cat-drinks', 'Drinks');
  seedCategory(db, 'cat-food', 'Food');
  seedProduct(db, 'prod-latte', 'cat-drinks', 'Latte', 200);
  seedProduct(db, 'prod-burger', 'cat-food', 'Burger', 500);
  // Uncategorized product (null category)
  db.prepare(
    `INSERT INTO products (
       id, category_id, name, price, tax_type, tax_category_id, tax_behavior,
       cb_percent, track_inventory, stock_quantity, is_active, sort_order, created_at, updated_at
     ) VALUES (?, NULL, ?, ?, 'none', NULL, 'country_default', 0, 0, 999, 1, 1, ?, ?)`,
  ).run('prod-misc', 'Misc Item', 100, now(), now());

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const today = utcTodayDate();
  const empty = queryCategoryReport(db, today, today);
  assertEqual(empty.by_category.length, 0, 'empty categories');
  assertEqual(empty.totals.merchandise_sales, 0, 'empty merchandise');
  assertEqual(empty.totals.category_count, 0, 'empty category_count');
  assertEqual(categoryReportToCsv(empty).trim(), CATEGORIES_CSV_HEADERS.join(','), 'empty CSV header');
  assert(empty.attribution.category.includes('not snapshotted'), 'category attribution documented');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    const o1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [
          { product_id: 'prod-latte', quantity: 2 },
          { product_id: 'prod-burger', quantity: 1 },
          { product_id: 'prod-misc', quantity: 1 },
        ],
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-o1-${Date.now()}` },
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

    let cat = queryCategoryReport(db, today, today);
    const prod = queryProductReport(db, today, today);
    rowsEqual(cat.by_category, prod.by_category, 'category rows == product by_category');
    moneyClose(cat.totals.merchandise_sales, prod.totals.merchandise_sales, 'merchandise parity');
    assertEqual(cat.totals.quantity_sold, prod.totals.quantity_sold, 'qty parity');
    moneyClose(
      cat.by_category.reduce((s: number, r: any) => s + r.merchandise_sales, 0),
      cat.totals.merchandise_sales,
      'category sum == totals',
    );
    assertEqual(cat.totals.category_count, 3, 'three categories incl Uncategorized');
    const uncat = cat.by_category.find((r: any) => r.category_id == null);
    assert(!!uncat && uncat.category_name === 'Uncategorized', 'Uncategorized explicit');
    moneyClose(uncat.merchandise_sales, 100, 'uncategorized merchandise');

    // Cancelled unpaid order excluded
    const oCancel = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-latte', quantity: 9 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-cancel-${Date.now()}` },
    });
    await api(baseUrl, `/api/orders/${oCancel.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'rpt-category fixture' },
      headers: owner.authHeader,
    });
    cat = queryCategoryReport(db, today, today);
    const drinks = cat.by_category.find((r: any) => r.category_id === 'cat-drinks');
    assertEqual(drinks.quantity_sold, 2, 'cancelled order excluded from category qty');

    // Item discount
    const oDisc = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-burger', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-disc-${Date.now()}` },
    });
    const itemId = oDisc.data.order.items[0].id;
    const itemDisc = await api(
      baseUrl,
      `/api/orders/${oDisc.data.order.id}/items/${itemId}/discount`,
      {
        method: 'PATCH',
        body: { discount_type: 'amount', discount_value: 50, discount_reason: 'comp' },
        headers: owner.authHeader,
      },
    );
    assertEqual(itemDisc.status, 200, 'item discount');
    const billDisc = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: oDisc.data.order.id },
      headers: owner.authHeader,
    });
    await api(baseUrl, `/api/bills/${billDisc.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: Number(billDisc.data.bill.total) },
      headers: owner.authHeader,
    });
    cat = queryCategoryReport(db, today, today);
    const food = cat.by_category.find((r: any) => r.category_id === 'cat-food');
    assert(food.item_discounts >= 50, 'item discounts on category');

    // Order-level discount context only
    const oOd = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-latte', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-od-${Date.now()}` },
    });
    const od = await api(baseUrl, `/api/orders/${oOd.data.order.id}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 20, discount_reason: 'order comp' },
      headers: owner.authHeader,
    });
    const billOd = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: oOd.data.order.id },
      headers: owner.authHeader,
    });
    await api(baseUrl, `/api/bills/${billOd.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: Number(od.data.order.total) },
      headers: owner.authHeader,
    });
    cat = queryCategoryReport(db, today, today);
    assert(cat.totals.order_discounts_context >= 20, 'order discount context');
    rowsEqual(
      cat.by_category,
      queryProductReport(db, today, today).by_category,
      'still equals product by_category after order discount',
    );

    // Refund does not fabricate category refunds / change merchandise
    const merchBefore = cat.totals.merchandise_sales;
    const refund = await api(baseUrl, `/api/bills/${bill1.data.bill.id}/refund`, {
      method: 'POST',
      body: {
        amount: 50,
        method: 'cash',
        reason: 'RPT-CATEGORY fixture',
        override_pin: '1234',
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-ref-${bill1.data.bill.id}` },
    });
    assert(refund.status === 200 || refund.status === 201, `refund (${refund.status})`);
    cat = queryCategoryReport(db, today, today);
    moneyClose(cat.totals.merchandise_sales, merchBefore, 'refund does not change merchandise');
    assert(cat.sales.refunds >= 50, 'sales.refunds context');
    assert(!('refund_amount' in (cat.by_category[0] || {})), 'no category refund field');

    // Split payment no double-count
    const beforeQty = cat.totals.quantity_sold;
    const oSplit = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-latte', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-split-${Date.now()}` },
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
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-sp1-${billSplit.data.bill.id}` },
    });
    await api(baseUrl, `/api/bills/${billSplit.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'card', amount: half },
      headers: { ...owner.authHeader, 'Idempotency-Key': `cat-sp2-${billSplit.data.bill.id}` },
    });
    cat = queryCategoryReport(db, today, today);
    assertEqual(cat.totals.quantity_sold, beforeQty + 1, 'split pay adds qty once');

    // API + RBAC
    const ownerRes = await api(
      baseUrl,
      `/api/reports/categories?start_date=${today}&end_date=${today}`,
      { headers: owner.authHeader },
    );
    assertEqual(ownerRes.status, 200, 'owner categories');
    rowsEqual(ownerRes.data.categories.by_category, cat.by_category, 'API rows');

    assertEqual(
      (
        await api(baseUrl, `/api/reports/categories?start_date=${today}&end_date=${today}`, {
          headers: manager.authHeader,
        })
      ).status,
      200,
      'manager OK',
    );

    for (const [id, role] of [
      ['cashier-cat', 'cashier'],
      ['waiter-cat', 'waiter'],
      ['chef-cat', 'chef'],
    ] as const) {
      const denied = await api(
        baseUrl,
        `/api/reports/categories?start_date=${today}&end_date=${today}`,
        { headers: auth(id, role) },
      );
      assertEqual(denied.status, 403, `${role} denied`);
    }

    const bad = await api(
      baseUrl,
      `/api/reports/categories?start_date=2026-08-21&end_date=2026-08-01`,
      { headers: owner.authHeader },
    );
    assertEqual(bad.status, 400, 'inverted range');

    const csvRes = await apiText(
      baseUrl,
      `/api/reports/export/categories.csv?start_date=${today}&end_date=${today}`,
      owner.authHeader,
    );
    assertEqual(csvRes.status, 200, 'CSV 200');
    assertEqual(csvRes.text, categoryReportToCsv(cat), 'CSV matches JSON serializer');

    const audits = queryAuditLogs({ action: 'report.categories_exported', limit: 5 });
    assert(
      Array.isArray(audits) && audits.some((l: any) => l.action === 'report.categories_exported'),
      'export audited',
    );

    const far = await api(
      baseUrl,
      `/api/reports/categories?start_date=2000-01-01&end_date=2000-01-01`,
      { headers: owner.authHeader },
    );
    assertEqual(far.status, 200, 'far empty');
    assertEqual(far.data.categories.by_category.length, 0, 'far empty rows');

    // FE contracts
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const lib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/category-report.ts'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(lib.includes('fetchCategoryReport'), 'FE lib');
    assert(page.includes('fetchCategoryReport') || page.includes('categoryReport'), 'page wired');
    assert(en.includes('reports.categoriesTitle'), 'i18n');

    console.log('\nAll RPT-CATEGORY checks passed.');
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
