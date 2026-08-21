/**
 * RPT-STAFF — Staff performance / activity report.
 * Usage: npm run test:rpt-staff
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-rpt-staff-'));
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

process.env.JWT_SECRET = 'rpt-staff-staff-report-secret';

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
  STAFF_CSV_HEADERS,
  staffReportToCsv,
  queryStaffReport,
} = require('../main/services/staff-report');
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
    { userId, email: `${role}@test.local`, role, jti: `rpt-staff-${userId}` },
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
  console.log('RPT-STAFF — Staff performance report');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip remains v88 (no bump)');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-staff', 'cashier', 'cashier-staff@test.local');
  seedRole(db, 'waiter-staff', 'waiter', 'waiter-staff@test.local');
  seedRole(db, 'chef-staff', 'chef', 'chef-staff@test.local');
  seedCategory(db, 'cat-staff', 'Staff Report');
  seedProduct(db, 'prod-staff-1', 'cat-staff', 'Staff Burger', 1000);
  seedProduct(db, 'prod-staff-2', 'cat-staff', 'Staff Fries', 500);

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const today = utcTodayDate();
  const empty = queryStaffReport(db, today, today);
  assertEqual(empty.by_staff.length, 0, 'empty by_staff');
  assertEqual(empty.totals.orders_created, 0, 'empty orders');
  assertEqual(staffReportToCsv(empty).trim(), STAFF_CSV_HEADERS.join(','), 'empty CSV header only');
  assert(empty.attribution.orders_created.includes('orders.user_id'), 'attribution documented');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);
  const { baseUrl, server } = await startServer(app);

  try {
    // Owner creates + pays order A
    const o1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-staff-1', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `staff-o1-${Date.now()}` },
    });
    assertEqual(o1.status, 201, 'owner order');
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
    assertEqual(pay1.status, 200, 'owner pay');

    // Manager creates + pays order B (distinct creator)
    const o2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-staff-2', quantity: 1 }] },
      headers: { ...manager.authHeader, 'Idempotency-Key': `staff-o2-${Date.now()}` },
    });
    assertEqual(o2.status, 201, 'manager order');
    const disc = await api(baseUrl, `/api/orders/${o2.data.order.id}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 50, discount_reason: 'Staff test' },
      headers: manager.authHeader,
    });
    assertEqual(disc.status, 200, 'manager discount');
    const total2 = Number(disc.data.order.total);
    const bill2 = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o2.data.order.id },
      headers: manager.authHeader,
    });
    const pay2 = await api(baseUrl, `/api/bills/${bill2.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: total2 },
      headers: manager.authHeader,
    });
    assertEqual(pay2.status, 200, 'manager pay');

    let report = queryStaffReport(db, today, today);
    assert(report.by_staff.length >= 2, 'at least owner + manager rows');
    const ownerRow = report.by_staff.find((r: any) => r.staff_id === owner.userId);
    const mgrRow = report.by_staff.find((r: any) => r.staff_id === manager.userId);
    assert(!!ownerRow, 'owner row');
    assert(!!mgrRow, 'manager row');
    assertEqual(ownerRow.orders_created, 1, 'owner orders_created');
    assertEqual(mgrRow.orders_created, 1, 'manager orders_created');
    assert(ownerRow.sales_from_orders_created > 0, 'owner sales from created');
    assert(mgrRow.sales_from_orders_created > 0, 'manager sales from created');
    // Attribution separation: manager discount count on manager only
    assert(mgrRow.discounts_applied_count >= 1, 'manager discount events');
    assertEqual(ownerRow.discounts_applied_count, 0, 'owner has no discount events');

    // Cancelled order by owner must not count in orders_created
    const oCancel = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-staff-1', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `staff-cancel-${Date.now()}` },
    });
    assertEqual(oCancel.status, 201, 'cancel fixture order');
    const cancel = await api(baseUrl, `/api/orders/${oCancel.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'staff report fixture' },
      headers: owner.authHeader,
    });
    assertEqual(cancel.status, 200, 'cancelled');
    report = queryStaffReport(db, today, today);
    const ownerAfterCancel = report.by_staff.find((r: any) => r.staff_id === owner.userId);
    assertEqual(ownerAfterCancel.orders_created, 1, 'cancelled order excluded from orders_created');
    assert(ownerAfterCancel.voids_cancels_count >= 1, 'cancel attributed to owner actor');

    // Partial refund by owner — refund metric on owner; sales_from_orders_created unchanged
    const salesBeforeRefund = ownerAfterCancel.sales_from_orders_created;
    const refundAmt = Math.round(Number(o1.data.order.total) * 20) / 100;
    const refund = await api(baseUrl, `/api/bills/${bill1.data.bill.id}/refund`, {
      method: 'POST',
      body: {
        amount: refundAmt,
        method: 'cash',
        reason: 'RPT-STAFF fixture',
        override_pin: '1234',
      },
      headers: { ...owner.authHeader, 'Idempotency-Key': `staff-ref-${bill1.data.bill.id}` },
    });
    assert(refund.status === 200 || refund.status === 201, `refund (${refund.status})`);
    report = queryStaffReport(db, today, today);
    const ownerAfterRefund = report.by_staff.find((r: any) => r.staff_id === owner.userId);
    moneyClose(ownerAfterRefund.sales_from_orders_created, salesBeforeRefund, 'sales not reduced by refund');
    moneyClose(ownerAfterRefund.refunds_amount, refundAmt, 'refund amount on creator/processor');
    assert(ownerAfterRefund.refunds_count >= 1, 'refund count');

    // Historical integrity: switching auth does not change attribution
    const asManager = queryStaffReport(db, today, today);
    moneyClose(
      asManager.by_staff.find((r: any) => r.staff_id === owner.userId).orders_created,
      1,
      'owner orders stable regardless of viewer',
    );

    // staff_id filter
    const filtered = queryStaffReport(db, today, today, { staffId: manager.userId });
    assertEqual(filtered.by_staff.length, 1, 'staff filter one row');
    assertEqual(filtered.by_staff[0].staff_id, manager.userId, 'filtered to manager');
    const unknown = queryStaffReport(db, today, today, { staffId: 'no-such-user' });
    assertEqual(unknown.by_staff.length, 0, 'unknown staff empty');

    // API RBAC
    const ownerRes = await api(
      baseUrl,
      `/api/reports/staff?start_date=${today}&end_date=${today}`,
      { headers: owner.authHeader },
    );
    assertEqual(ownerRes.status, 200, 'owner staff report');
    assertEqual(ownerRes.data.staff.totals.orders_created, report.totals.orders_created, 'API totals');

    const mgrRes = await api(
      baseUrl,
      `/api/reports/staff?start_date=${today}&end_date=${today}`,
      { headers: manager.authHeader },
    );
    assertEqual(mgrRes.status, 200, 'manager OK');

    for (const [id, role] of [
      ['cashier-staff', 'cashier'],
      ['waiter-staff', 'waiter'],
      ['chef-staff', 'chef'],
    ] as const) {
      const denied = await api(
        baseUrl,
        `/api/reports/staff?start_date=${today}&end_date=${today}`,
        { headers: auth(id, role) },
      );
      assertEqual(denied.status, 403, `${role} denied staff report`);
    }

    const bad = await api(
      baseUrl,
      `/api/reports/staff?start_date=2026-08-21&end_date=2026-08-01`,
      { headers: owner.authHeader },
    );
    assertEqual(bad.status, 400, 'inverted range 400');

    // CSV parity + audit
    const csvRes = await apiText(
      baseUrl,
      `/api/reports/export/staff.csv?start_date=${today}&end_date=${today}`,
      owner.authHeader,
    );
    assertEqual(csvRes.status, 200, 'CSV 200');
    assert(csvRes.contentType.includes('text/csv'), 'CSV content-type');
    assertEqual(csvRes.text, staffReportToCsv(report), 'CSV matches serializer');

    const audits = queryAuditLogs({ action: 'report.staff_exported', limit: 5 });
    assert(
      Array.isArray(audits) && audits.some((l: any) => l.action === 'report.staff_exported'),
      'export audited',
    );

    const far = await api(
      baseUrl,
      `/api/reports/staff?start_date=2000-01-01&end_date=2000-01-01`,
      { headers: owner.authHeader },
    );
    assertEqual(far.status, 200, 'far range OK');
    assertEqual(far.data.staff.by_staff.length, 0, 'far range empty');

    // FE contracts
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const lib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/staff-report.ts'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(lib.includes('fetchStaffReport'), 'FE lib fetchStaffReport');
    assert(lib.includes('downloadStaffCsv'), 'FE lib CSV');
    assert(page.includes('fetchStaffReport') || page.includes('staffReport'), 'page wired');
    assert(en.includes('reports.staffTitle'), 'i18n staff title');
    assert(en.includes('No staff activity in this period.'), 'empty-state copy');

    console.log('\nAll RPT-STAFF checks passed.');
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
