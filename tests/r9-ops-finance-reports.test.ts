/**
 * R9 Slice 5 — Operations finance reports.
 * Usage: npm run test:r9.5
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r9-ops-'));
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

process.env.JWT_SECRET = 'r9-ops-finance-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { reportRoutes } = require('../main/routes/reports');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs } = require('../main/services/audit-log');
const { EXPENSES_CSV_HEADERS } = require('../main/services/ops-finance-report');
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
    { userId, email: `${role}@test.local`, role, jti: `r9o-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function countAction(action: string): number {
  return Number(
    getDatabase().prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = ?`).get(action).c,
  );
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

function seedExpense(
  db: any,
  id: string,
  cents: number,
  category: string,
  date: string,
  actor: string,
): void {
  const ts = now();
  db.prepare(
    `INSERT INTO expenses (
      id, amount_cents, category, description, notes, expense_date, status,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NULL, ?, 'posted', ?, ?, ?, ?)`,
  ).run(id, cents, category, `Expense ${category}`, date, actor, actor, ts, ts);
}

async function main(): Promise<void> {
  console.log('\nR9 Slice 5 — Operations Finance Reports');
  console.log('='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip is v88');
  initTestDb();
  const db = getDatabase();
  assertEqual(Number(db.pragma('user_version', { simple: true })), 88, 'fresh DB tip 88');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashierId = seedRole(db, 'cashier-r9o', 'cashier', 'cashier-r9o@test.local');

  seedExpense(db, 'exp-1', 2500, 'supplies', '2026-08-10', owner.userId);
  seedExpense(db, 'exp-2', 1500, 'utilities', '2026-08-11', owner.userId);
  seedExpense(db, 'exp-void', 9999, 'supplies', '2026-08-10', owner.userId);
  db.prepare(`UPDATE expenses SET status = 'voided' WHERE id = ?`).run('exp-void');

  // Settled bill for sales semantics
  const billAt = '2026-08-10T12:00:00.000Z';
  const orderInfo = db
    .prepare(
      `INSERT INTO orders (order_number, type, status, subtotal, tax_amount, total, created_at, updated_at)
       VALUES ('R9O-1', 'dine_in', 'completed', 100, 0, 100, ?, ?)`,
    )
    .run(billAt, billAt);
  const orderId = Number(orderInfo.lastInsertRowid);
  db.prepare(
    `INSERT INTO bills (
      bill_number, order_id, subtotal, tax_amount, total, total_cents, paid_amount, paid_amount_cents,
      balance, payment_status, created_at, updated_at
    ) VALUES (?, ?, 100, 0, 100, 10000, 100, 10000, 0, 'paid', ?, ?)`,
  ).run(`BILL-${orderId}`, orderId, billAt, billAt);

  const app = createApp({ '/api/reports': reportRoutes });
  const { baseUrl, server } = await startServer(app);
  const q = 'start_date=2026-08-10&end_date=2026-08-11';

  try {
    console.log('\nAC — ops-finance RBAC + composition');
    const ok = await api(baseUrl, `/api/reports/ops-finance?${q}`, {
      headers: owner.authHeader,
    });
    assertEqual(ok.status, 200, 'Owner ops-finance 200');
    const report = ok.data.opsFinance;
    assertEqual(report.expenses.posted_total_cents, 4000, 'posted expenses exclude voided');
    assertEqual(report.expenses.posted_count, 2, 'posted count');
    assert(report.expenses.by_category.length >= 2, 'category breakdown');
    assertEqual(typeof report.sales.netSales, 'number', 'net sales present');
    assertEqual(typeof report.net_after_expenses, 'number', 'net after expenses');

    const mgr = await api(baseUrl, `/api/reports/ops-finance?${q}`, {
      headers: manager.authHeader,
    });
    assertEqual(mgr.status, 200, 'Manager ops-finance 200');

    const denied = await api(baseUrl, `/api/reports/ops-finance?${q}`, {
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(denied.status, 403, 'cashier ops-finance 403');

    console.log('\nAC — expenses CSV + audit');
    const before = countAction('expense.exported');
    const csv = await apiText(baseUrl, `/api/reports/export/expenses.csv?${q}`, owner.authHeader);
    assertEqual(csv.status, 200, 'Owner expenses CSV 200');
    assert(csv.contentType.includes('text/csv'), 'csv content-type');
    assertEqual(csv.text.trim().split(/\r?\n/)[0], EXPENSES_CSV_HEADERS.join(','), 'csv header');
    assert(csv.text.includes('2500'), 'includes supplies cents');
    assert(!csv.text.includes('9999'), 'excludes voided');
    assertEqual(countAction('expense.exported'), before + 1, 'expense.exported written');
    const row = queryAuditLogs({ action: 'expense.exported', limit: 1 })[0];
    assertEqual(row.entity_type, 'expense_report', 'export entity_type');

    const csvDenied = await apiText(
      baseUrl,
      `/api/reports/export/expenses.csv?${q}`,
      auth(cashierId, 'cashier'),
    );
    assertEqual(csvDenied.status, 403, 'cashier csv 403');
    assertEqual(countAction('expense.exported'), before + 1, 'cashier no expense.exported');

    console.log('\nAC — UI contract');
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(page.includes('ops-finance') || page.includes('opsFinance'), 'reports UI ops finance');
    assert(en.includes('reports.opsFinanceTitle'), 'en ops finance title');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('\nR9 Slice 5 COMPLETE — ops finance scenarios passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
