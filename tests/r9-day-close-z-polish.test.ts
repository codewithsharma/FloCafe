/**
 * R9 Slice 4 — Day-close / Z polish (formula-preserving).
 *
 * Usage: npm run test:r9.4
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r9-z-'));
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

process.env.JWT_SECRET = 'r9-day-close-z-polish-secret';

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
const { printerRoutes } = require('../main/routes/printers');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs } = require('../main/services/audit-log');
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
    { userId, email: `${role}@test.local`, role, jti: `r9z-${userId}` },
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

function seedClosedDay(db: any, businessDate: string, actorId: string): void {
  const summary = {
    business_date: businessDate,
    timezone: 'UTC',
    shift_count: 1,
    open_shift_count: 0,
    open_shifts_warning: false,
    opening_float_cents_total: 10000,
    expected_cash_cents_total: 15000,
    counted_cash_cents_total: 14900,
    variance_cents_total: -100,
    cash_payment_total_cents: 5000,
    cash_payment_count: 2,
    cash_refund_total_cents: 500,
    cash_refund_count: 1,
    net_cash_movement_cents: 4500,
    shifts: [
      {
        id: 1,
        terminal_id: 't1',
        opened_by_user_id: actorId,
        closed_by_user_id: actorId,
        opening_float_cents: 10000,
        expected_cash_cents: 15000,
        counted_cash_cents: 14900,
        variance_cents: -100,
        cash_payment_total_cents: 5000,
        cash_payment_count: 2,
        cash_refund_total_cents: 500,
        cash_refund_count: 1,
        net_cash_movement_cents: 4500,
        opened_at: now(),
        closed_at: now(),
      },
    ],
  };
  db.prepare(
    `INSERT INTO day_closes (business_date, closed_by_user_id, summary_json, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(businessDate, actorId, JSON.stringify(summary), now());
}

async function main(): Promise<void> {
  console.log('\nR9 Slice 4 — Day-close / Z Polish');
  console.log('='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 87, 'schema tip is v87');

  initTestDb();
  const db = getDatabase();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    86,
    'fresh DB at user_version 87',
  );

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashierId = seedRole(db, 'cashier-r9z', 'cashier', 'cashier-r9z@test.local');
  const waiterId = seedRole(db, 'waiter-r9z', 'waiter', 'waiter-r9z@test.local');
  const chefId = seedRole(db, 'chef-r9z', 'chef', 'chef-r9z@test.local');

  seedClosedDay(db, '2026-08-14', owner.userId);

  const app = createApp({
    '/api/reports': reportRoutes,
    '/api/printers': printerRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\nAC — GET frozen close + Z export RBAC');
    const ownerGet = await api(baseUrl, '/api/reports/day-close/2026-08-14', {
      headers: owner.authHeader,
    });
    assertEqual(ownerGet.status, 200, 'Owner GET 200');
    assertEqual(ownerGet.data.summary.net_cash_movement_cents, 4500, 'frozen net cash unchanged');
    assertEqual(ownerGet.data.summary.opening_float_cents_total, 10000, 'opening float present');
    assertEqual(ownerGet.data.summary.shifts.length, 1, 'per-shift rows present');

    const managerGet = await api(baseUrl, '/api/reports/day-close/2026-08-14', {
      headers: manager.authHeader,
    });
    assertEqual(managerGet.status, 200, 'Manager GET 200');

    for (const [role, id] of [
      ['cashier', cashierId],
      ['waiter', waiterId],
      ['chef', chefId],
    ] as const) {
      const denied = await api(baseUrl, '/api/reports/day-close/2026-08-14', {
        headers: auth(id, role),
      });
      assertEqual(denied.status, 403, `${role} GET 403`);
    }

    const missing = await api(baseUrl, '/api/reports/day-close/2099-01-01', {
      headers: owner.authHeader,
    });
    assertEqual(missing.status, 404, 'historical missing close 404');

    console.log('\nAC — Z text export + download audit');
    const beforeDl = countAction('day_close.z_downloaded');
    const exportRes = await apiText(
      baseUrl,
      '/api/reports/day-close/2026-08-14/export/z.txt',
      owner.authHeader,
    );
    assertEqual(exportRes.status, 200, 'Owner Z export 200');
    assert(exportRes.contentType.includes('text/plain'), 'text/plain');
    assert(exportRes.text.includes('DAY CLOSE Z'), 'Z banner');
    assert(exportRes.text.includes('Cash In'), 'Cash In line');
    assert(exportRes.text.includes('not a full sales Z'), 'cash≠sales clarity');
    assert(!/Gross Sales|Net Sales/i.test(exportRes.text), 'no Gross/Net sales in Z');
    assertEqual(countAction('day_close.z_downloaded'), beforeDl + 1, 'z_downloaded written');

    const exportAudit = queryAuditLogs({ action: 'day_close.z_downloaded', limit: 1 })[0];
    assertEqual(exportAudit.entity_type, 'day_close', 'export entity_type');
    assertEqual(exportAudit.actor_user_id, owner.userId, 'export actor');

    const cashierExport = await apiText(
      baseUrl,
      '/api/reports/day-close/2026-08-14/export/z.txt',
      auth(cashierId, 'cashier'),
    );
    assertEqual(cashierExport.status, 403, 'cashier export 403');
    assertEqual(countAction('day_close.z_downloaded'), beforeDl + 1, 'cashier no z_downloaded');

    console.log('\nAC — print audit success-only (no printer → no success audit)');
    const beforePrint = countAction('day_close.z_printed');
    const printNoPrinter = await api(baseUrl, '/api/printers/print-day-close', {
      method: 'POST',
      headers: owner.authHeader,
      body: { business_date: '2026-08-14' },
    });
    assert(printNoPrinter.status >= 400, 'print without printer fails');
    assertEqual(countAction('day_close.z_printed'), beforePrint, 'no z_printed on failure');

    const cashierPrint = await api(baseUrl, '/api/printers/print-day-close', {
      method: 'POST',
      headers: auth(cashierId, 'cashier'),
      body: { business_date: '2026-08-14' },
    });
    assertEqual(cashierPrint.status, 403, 'cashier print 403');
    assertEqual(countAction('day_close.z_printed'), beforePrint, 'cashier no z_printed');

    console.log('\nAC — UI / i18n contracts');
    const card = fs.readFileSync(
      path.join(__dirname, '../frontend/src/components/dashboard/DayCloseCard.tsx'),
      'utf8',
    );
    const ops = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/operations/page.tsx'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(card.includes('confirmClose') || card.includes('dayClose.confirmClose'), 'close confirmation');
    assert(card.includes('dayClose.cashZClarity'), 'cash clarity');
    assert(card.includes('opening_float_cents_total'), 'shows opening float');
    assert(card.includes('summary.shifts'), 'shows per-shift');
    assert(ops.includes('type="date"') || ops.includes("type='date'"), 'date control');
    assert(en.includes('dayClose.cashZClarity'), 'en cash clarity key');
    assert(en.includes('dayClose.confirmClose'), 'en confirm key');

    console.log('\nAC — no payment schema side effects');
    assertEqual(
      Number(db.pragma('user_version', { simple: true })),
      86,
      'schema tip still 87 after Z export',
    );
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('\nR9 Slice 4 COMPLETE — day-close Z polish scenarios passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
