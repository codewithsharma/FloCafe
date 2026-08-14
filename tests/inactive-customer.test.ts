/**
 * Phase 3.6E — Inactive customer list + reactivate UX contracts.
 *
 * Run: npm run test:inactive-customer
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-inactive-customer-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => 'test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

const jwt = require('jsonwebtoken');
const request = require('supertest');
const {
  initTestDb,
  createApp,
  assertEqual,
  assert: assertOk,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');

const { customerRoutes } = require('../main/routes/customers');
const { getJWTSecret } = require('../main/routes/auth');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFe(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function makeToken(id: string, role: string, email: string) {
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  console.log('Phase 3.6E Inactive Customer UX');
  console.log('='.repeat(60));

  // --- Static UI / i18n contracts (fail before backend green) ---
  const page = readFe('app/(dashboard)/customers/page.tsx');
  const table = readFe('components/customers/CustomersTable.tsx');
  const types = readFe('lib/types.ts');
  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  const es = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/es.json'), 'utf8');
  const pt = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/pt.json'), 'utf8');
  const posSearch = readFe('components/pos/CustomerSearch.tsx');

  assert.ok(types.includes('is_active'), 'Customer type exposes is_active');
  assert.ok(page.includes('include_inactive') || page.includes('includeInactive'), 'page can request include_inactive');
  assert.ok(
    page.includes("post(`/customers/${") || page.includes('post(`/customers/${') || page.includes('/reactivate'),
    'page can call reactivate'
  );
  assert.ok(table.includes('common.inactive') || table.includes('customer.inactive'), 'table shows inactive label');
  assert.ok(table.includes('reactivate') || table.includes('onReactivate'), 'table exposes reactivate action');
  assert.ok(posSearch.includes('customers-search'), 'POS still uses customers-search');
  assert.ok(!posSearch.includes('include_inactive'), 'POS search does not include inactive');

  for (const [label, json] of [
    ['en', en],
    ['es', es],
    ['pt', pt],
  ] as const) {
    assert.ok(json.includes('"customer.reactivate"'), `${label} has customer.reactivate`);
    assert.ok(json.includes('"customers.showInactive"'), `${label} has customers.showInactive`);
    assert.ok(json.includes('"customer.reactivated"'), `${label} has customer.reactivated`);
    assert.ok(json.includes('"customer.reactivateFailed"'), `${label} has customer.reactivateFailed`);
  }
  console.log('   ✓ UI / i18n contracts');

  // --- API behavior ---
  const db = initTestDb();
  const ownerAuth = makeToken('owner-ic-001', 'owner', 'owner@ic.test');
  const cashierAuth = makeToken('cashier-ic-001', 'cashier', 'cashier@ic.test');
  const app = createApp({ '/api/customers': customerRoutes });

  db.prepare(
    `INSERT INTO customers (id, name, phone, country_code, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run('cust-active-1', 'Active Person', '+919111111111', '+91', now(), now());

  db.prepare(
    `INSERT INTO customers (id, name, phone, country_code, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`
  ).run('cust-inactive-1', 'Inactive Person', '+919222222222', '+91', now(), now());

  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run('owner-ic-001', 'Owner IC', 'owner@ic.test', 'x', 'owner', now(), now());
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run('cashier-ic-001', 'Cashier IC', 'cashier@ic.test', 'x', 'cashier', now(), now());

  db.prepare(
    `INSERT INTO loyalty_ledger (customer_id, type, amount, description, created_at, updated_at)
     VALUES (?, 'credit', 50, 'seed pts', ?, ?)`
  ).run('cust-inactive-1', now(), now());

  const walletBefore = db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount),0) FROM loyalty_ledger WHERE customer_id=? AND type='credit') -
         (SELECT COALESCE(SUM(amount),0) FROM loyalty_ledger WHERE customer_id=? AND type='debit') AS bal`
    )
    .get('cust-inactive-1', 'cust-inactive-1') as { bal: number };
  assertEqual(walletBefore.bal, 50, 'precondition: inactive customer has 50 pts');

  const defaultList = await request(app).get('/api/customers').set(ownerAuth);
  assertEqual(defaultList.status, 200, 'default list 200');
  const defaultIds = (defaultList.body.data || []).map((c: { id: string }) => c.id);
  assertOk(!defaultIds.includes('cust-inactive-1'), 'default list excludes inactive');
  assertOk(defaultIds.includes('cust-active-1'), 'default list includes active');

  const withInactive = await request(app).get('/api/customers?include_inactive=true').set(ownerAuth);
  assertEqual(withInactive.status, 200, 'include_inactive list 200');
  const withIds = (withInactive.body.data || []).map((c: { id: string }) => c.id);
  assertOk(withIds.includes('cust-inactive-1'), 'owner include_inactive returns inactive');
  assertOk(withIds.includes('cust-active-1'), 'owner include_inactive still returns active');
  const inactiveRow = (withInactive.body.data || []).find((c: { id: string }) => c.id === 'cust-inactive-1');
  assertEqual(Number(inactiveRow.is_active), 0, 'inactive row reports is_active=0');

  const cashierInclude = await request(app).get('/api/customers?include_inactive=true').set(cashierAuth);
  assertEqual(cashierInclude.status, 200, 'cashier include_inactive still 200');
  const cashierIds = (cashierInclude.body.data || []).map((c: { id: string }) => c.id);
  assertOk(!cashierIds.includes('cust-inactive-1'), 'cashier cannot widen list via include_inactive');

  const reactivate = await request(app)
    .post('/api/customers/cust-inactive-1/reactivate')
    .set(ownerAuth);
  assertEqual(reactivate.status, 200, `reactivate returns 200; got ${reactivate.status} ${JSON.stringify(reactivate.body)}`);
  assertEqual(Number(reactivate.body.customer?.is_active), 1, 'reactivate response is_active=1');

  const after = db.prepare(`SELECT is_active FROM customers WHERE id = ?`).get('cust-inactive-1') as {
    is_active: number;
  };
  assertEqual(after.is_active, 1, 'DB is_active flipped to 1');

  const ledgerCount = db
    .prepare(`SELECT COUNT(*) AS n FROM loyalty_ledger WHERE customer_id = ?`)
    .get('cust-inactive-1') as { n: number };
  assertEqual(ledgerCount.n, 1, 'loyalty ledger row count unchanged after reactivate');

  const walletAfter = db
    .prepare(
      `SELECT
         (SELECT COALESCE(SUM(amount),0) FROM loyalty_ledger WHERE customer_id=? AND type='credit') -
         (SELECT COALESCE(SUM(amount),0) FROM loyalty_ledger WHERE customer_id=? AND type='debit') AS bal`
    )
    .get('cust-inactive-1', 'cust-inactive-1') as { bal: number };
  assertEqual(walletAfter.bal, 50, 'wallet balance unchanged after reactivate');

  const already = await request(app).post('/api/customers/cust-inactive-1/reactivate').set(ownerAuth);
  assertEqual(already.status, 400, 'already-active reactivate returns 400');

  const missing = await request(app).post('/api/customers/cust-missing/reactivate').set(ownerAuth);
  assertEqual(missing.status, 404, 'missing customer reactivate returns 404');

  // POS search path lives on index routes — assert customers-search SQL still active-only via source contract
  const indexSrc = fs.readFileSync(path.join(ROOT, 'main/routes/index.ts'), 'utf8');
  assertOk(indexSrc.includes('is_active = 1'), 'customers-search source still filters is_active = 1');

  console.log('   ✓ API include_inactive + reactivate + loyalty safety');

  closeDatabase();
  Module._load = originalLoad;
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const { passed, failed, total } = getResults();
  console.log('='.repeat(60));
  console.log(`✅ Phase 3.6E inactive customer (${passed}/${total} asserts; failed=${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  try {
    closeDatabase();
  } catch {
    /* ignore */
  }
  Module._load = originalLoad;
  process.exit(1);
});
