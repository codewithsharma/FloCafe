/**
 * Phase 4.9 — Customer deactivate lifecycle.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.9-customer-deactivate.test.ts
 *    or: npm run test:phase-4.9
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.9-deactivate-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-49-deactivate-secret';

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

const { customerRoutes } = require('../main/routes/customers');
const { getJWTSecret } = require('../main/routes/auth');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function seedCashier(db: any) {
  const userId = 'cashier-phase49-001';
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, 'Cashier', 'cashier49@test.local', passwordHash, 'cashier', 1, now(), now());
  const token = jwt.sign(
    { userId, email: 'cashier49@test.local', role: 'cashier' },
    getJWTSecret(),
    {
      expiresIn: '1h',
    },
  );
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('Phase 4.9 — Customer deactivate');
  console.log('='.repeat(60));

  const page = readFrontend('app/(dashboard)/customers/page.tsx');
  const table = readFrontend('components/customers/CustomersTable.tsx');
  const posSearch = readFrontend('components/pos/CustomerSearch.tsx');
  const en = readFrontend('lib/i18n/en.json');
  const es = readFrontend('lib/i18n/es.json');
  const pt = readFrontend('lib/i18n/pt.json');
  const customersRoute = fs.readFileSync(path.join(ROOT, 'main/routes/customers.ts'), 'utf8');
  const searchSql = fs.readFileSync(path.join(ROOT, 'main/routes/index.ts'), 'utf8');

  assert(page.includes('/deactivate'), 'customers page calls deactivate');
  assert(
    page.includes('canShowInactive') || page.includes("role === 'owner'"),
    'deactivate stays owner/manager gated',
  );
  assert(table.includes('onDeactivate'), 'table exposes onDeactivate');
  assert(table.includes('customer.deactivate'), 'table labels deactivate');
  assert(!posSearch.includes('include_inactive'), 'POS search still excludes inactive');
  assert(searchSql.includes('is_active = 1'), 'customers-search SQL stays active-only');
  assert(customersRoute.includes('/:id/deactivate'), 'deactivate route exists');
  assert(
    !customersRoute.includes('loyalty_ledger') || customersRoute.includes('no loyalty'),
    'deactivate does not touch loyalty',
  );
  for (const [label, json] of [
    ['en', en],
    ['es', es],
    ['pt', pt],
  ] as const) {
    assert(json.includes('"customer.deactivate"'), `${label} customer.deactivate`);
    assert(json.includes('"customer.deactivated"'), `${label} customer.deactivated`);
    assert(json.includes('"customer.deactivateFailed"'), `${label} customer.deactivateFailed`);
  }

  const db = initTestDb();
  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  const { authHeader: cashierAuth } = seedCashier(db);

  db.prepare(
    `INSERT INTO customers (id, name, phone, country_code, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run('cust-49-active', 'Active FortyNine', '+919333333333', '+91', now(), now());
  db.prepare(
    `INSERT INTO customers (id, name, phone, country_code, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run('cust-49-inactive', 'Inactive FortyNine', '+919444444444', '+91', now(), now());
  db.prepare(
    `INSERT INTO loyalty_ledger (customer_id, type, amount, description, created_at, updated_at)
     VALUES (?, 'credit', 40, 'seed', ?, ?)`,
  ).run('cust-49-active', now(), now());

  const app = createApp({ '/api/customers': customerRoutes });
  const { baseUrl, server } = await startServer(app);

  try {
    const ledgerBefore = (
      db
        .prepare('SELECT COUNT(*) AS c FROM loyalty_ledger WHERE customer_id = ?')
        .get('cust-49-active') as {
        c: number;
      }
    ).c;

    const deactivated = await api(baseUrl, '/api/customers/cust-49-active/deactivate', {
      method: 'POST',
      body: {},
      headers: ownerAuth,
    });
    assertEqual(deactivated.status, 200, 'owner deactivate 200');
    assertEqual(Number(deactivated.data.customer.is_active), 0, 'is_active is 0');

    const list = await api(baseUrl, '/api/customers', { headers: ownerAuth });
    const ids = ((list.data.data || []) as { id: string }[]).map((c) => c.id);
    assert(!ids.includes('cust-49-active'), 'default list hides deactivated customer');

    const withInactive = await api(baseUrl, '/api/customers?include_inactive=true', {
      headers: ownerAuth,
    });
    const inactiveIds = ((withInactive.data.data || []) as { id: string }[]).map((c) => c.id);
    assert(inactiveIds.includes('cust-49-active'), 'include_inactive lists deactivated customer');

    assertEqual(
      (
        db
          .prepare('SELECT COUNT(*) AS c FROM loyalty_ledger WHERE customer_id = ?')
          .get('cust-49-active') as {
          c: number;
        }
      ).c,
      ledgerBefore,
      'deactivate does not write loyalty_ledger',
    );

    const already = await api(baseUrl, '/api/customers/cust-49-inactive/deactivate', {
      method: 'POST',
      body: {},
      headers: managerAuth,
    });
    assertEqual(already.status, 400, 'already inactive is 400');
    assertEqual(already.data.error, 'Already inactive', 'already inactive message');

    const missing = await api(baseUrl, '/api/customers/no-such-cust/deactivate', {
      method: 'POST',
      body: {},
      headers: ownerAuth,
    });
    assertEqual(missing.status, 404, 'missing customer 404');

    const cashier = await api(baseUrl, '/api/customers/cust-49-inactive/deactivate', {
      method: 'POST',
      body: {},
      headers: cashierAuth,
    });
    assertEqual(cashier.status, 403, 'cashier deactivate forbidden');

    const restored = await api(baseUrl, '/api/customers/cust-49-active/reactivate', {
      method: 'POST',
      body: {},
      headers: ownerAuth,
    });
    assertEqual(restored.status, 200, 'reactivate still works after deactivate');
    assertEqual(Number(restored.data.customer.is_active), 1, 'reactivate sets is_active=1');

    const schema = (db.prepare('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    assertEqual(schema, 89, 'schema remains at tip v89');
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
  console.log('Phase 4.9 customer deactivate tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
