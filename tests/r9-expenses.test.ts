/**
 * R9 Slice 1 — Expenses + schema v83.
 *
 * Usage: npm run test:r9
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r9-expenses-'));
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

process.env.JWT_SECRET = 'r9-expenses-os-secret';

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

const { expenseRoutes } = require('../main/routes/expenses');
const { getSupportedSchemaVersion, getCurrentSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(
  db: any,
  id: string,
  role: string,
  email: string,
): { id: string; token: string; authHeader: Record<string, string> } {
  const hash = bcrypt.hashSync('Password1', 4);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, `${role} ${id}`, email, hash, role, now(), now());
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '2h' });
  return { id, token, authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('\nR9 — Expenses Slice 1\n' + '='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 87, 'R9-EXP schema tip is v87 (post R10–R14 tip)');
  assertEqual(getCurrentSchemaVersion(), 87, 'R9-EXP fresh install migrates to tip v86');

  const table = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'`)
    .get() as { name?: string } | undefined;
  assert(!!table?.name, 'R9-EXP expenses table exists');

  const cols = db.prepare(`PRAGMA table_info(expenses)`).all() as Array<{ name: string; type: string }>;
  const amountCol = cols.find((c) => c.name === 'amount_cents');
  assert(!!amountCol, 'R9-EXP amount_cents column exists');
  assert(!cols.some((c) => c.name === 'amount' && c.name !== 'amount_cents'), 'R9-NEG no REAL amount column');
  assert(!cols.some((c) => c.name === 'service_charge'), 'R9-NEG no service_charge column');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRole(db, 'user-cashier-r9', 'cashier', 'cashier-r9@test.local');
  const waiter = seedRole(db, 'user-waiter-r9', 'waiter', 'waiter-r9@test.local');
  const chef = seedRole(db, 'user-chef-r9', 'chef', 'chef-r9@test.local');

  const paymentsBefore = db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE name LIKE '%payment%'`).get();

  const app = createApp({
    '/api/expenses': expenseRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\nR9-EXP create / list / filter');
    const created = await api(baseUrl, '/api/expenses', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        amount_cents: 1250,
        category: 'supplies',
        description: 'Napkins',
        notes: 'Weekly stock',
        expense_date: '2026-08-15',
      },
    });
    assertEqual(created.status, 201, 'create returns 201');
    assertEqual(created.data.expense.amount_cents, 1250, 'integer cents stored');
    assertEqual(created.data.expense.status, 'posted', 'default status posted');
    const expenseId = created.data.expense.id as string;

    const listed = await api(baseUrl, '/api/expenses?status=posted&category=supplies', {
      headers: owner.authHeader,
    });
    assertEqual(listed.status, 200, 'list ok');
    assert(
      (listed.data.expenses as Array<{ id: string }>).some((e) => e.id === expenseId),
      'list includes created expense',
    );

    const filteredOut = await api(baseUrl, '/api/expenses?category=rent', {
      headers: owner.authHeader,
    });
    assertEqual(
      (filteredOut.data.expenses as unknown[]).length,
      0,
      'category filter excludes other categories',
    );

    console.log('\nR9-EXP get / update');
    const got = await api(baseUrl, `/api/expenses/${expenseId}`, {
      headers: manager.authHeader,
    });
    assertEqual(got.status, 200, 'get ok');
    assertEqual(got.data.expense.description, 'Napkins', 'get returns description');

    const updated = await api(baseUrl, `/api/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: owner.authHeader,
      body: { amount_cents: 1500, description: 'Napkins XL' },
    });
    assertEqual(updated.status, 200, 'update ok');
    assertEqual(updated.data.expense.amount_cents, 1500, 'updated cents');
    assertEqual(updated.data.expense.description, 'Napkins XL', 'updated description');

    console.log('\nR9-EXP validation');
    const zero = await api(baseUrl, '/api/expenses', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        amount_cents: 0,
        category: 'other',
        expense_date: '2026-08-15',
      },
    });
    assertEqual(zero.status, 400, 'zero amount rejected');

    const negative = await api(baseUrl, '/api/expenses', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        amount_cents: -5,
        category: 'other',
        expense_date: '2026-08-15',
      },
    });
    assertEqual(negative.status, 400, 'negative amount rejected');

    const floatish = await api(baseUrl, '/api/expenses', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        amount_cents: 12.5,
        category: 'other',
        expense_date: '2026-08-15',
      },
    });
    assertEqual(floatish.status, 400, 'non-integer cents rejected');

    const badDate = await api(baseUrl, '/api/expenses', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        amount_cents: 100,
        category: 'other',
        expense_date: '15-08-2026',
      },
    });
    assertEqual(badDate.status, 400, 'invalid date rejected');

    console.log('\nR9-EXP RBAC');
    for (const [role, user] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const denied = await api(baseUrl, '/api/expenses', {
        method: 'POST',
        headers: user.authHeader,
        body: {
          amount_cents: 100,
          category: 'other',
          expense_date: '2026-08-15',
        },
      });
      assertEqual(denied.status, 403, `${role} denied create`);
      const deniedList = await api(baseUrl, '/api/expenses', { headers: user.authHeader });
      assertEqual(deniedList.status, 403, `${role} denied list`);
    }

    console.log('\nR9-EXP void + audits');
    const voided = await api(baseUrl, `/api/expenses/${expenseId}/void`, {
      method: 'POST',
      headers: manager.authHeader,
      body: { reason: 'Entered twice' },
    });
    assertEqual(voided.status, 200, 'void ok');
    assertEqual(voided.data.expense.status, 'voided', 'status voided');

    const voidAgain = await api(baseUrl, `/api/expenses/${expenseId}/void`, {
      method: 'POST',
      headers: owner.authHeader,
      body: { reason: 'again' },
    });
    assertEqual(voidAgain.status, 409, 'double void rejected');

    const updateVoided = await api(baseUrl, `/api/expenses/${expenseId}`, {
      method: 'PATCH',
      headers: owner.authHeader,
      body: { description: 'nope' },
    });
    assertEqual(updateVoided.status, 409, 'voided not editable');

    const audits = db
      .prepare(
        `SELECT action FROM audit_logs WHERE entity_type = 'expense' AND entity_id = ? ORDER BY id`,
      )
      .all(expenseId) as Array<{ action: string }>;
    const actions = audits.map((a) => a.action);
    assert(actions.includes('expense.created'), 'audit expense.created');
    assert(actions.includes('expense.updated'), 'audit expense.updated');
    assert(actions.includes('expense.voided'), 'audit expense.voided');

    console.log('\nR9-NEG money / payments / ADR-014');
    const paymentsAfter = db.prepare(`SELECT COUNT(*) AS c FROM sqlite_master WHERE name LIKE '%payment%'`).get();
    assertEqual(paymentsAfter.c, paymentsBefore.c, 'no payment schema side effects');

    const tip = getSupportedSchemaVersion();
    assertEqual(tip, 87, 'schema tip includes R10–R14 + KDS outbox (v87); REAL cutover still deferred');

    // Offline / local SoR: second create persists without network simulation (in-process SQLite).
    const offlineCreate = await api(baseUrl, '/api/expenses', {
      method: 'POST',
      headers: owner.authHeader,
      body: {
        amount_cents: 999,
        category: 'utilities',
        description: 'Local only',
        expense_date: '2026-08-14',
      },
    });
    assertEqual(offlineCreate.status, 201, 'local SQLite create works');
    const row = db.prepare('SELECT amount_cents FROM expenses WHERE id = ?').get(offlineCreate.data.expense.id) as
      | { amount_cents: number }
      | undefined;
    assertEqual(row?.amount_cents, 999, 'SQLite is authoritative');

  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nR9 FAILED');
    process.exit(1);
  }
  console.log('\nR9 Slice 1 COMPLETE — expenses scenarios passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
