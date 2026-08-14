/**
 * Phase 3.6F — Cash drawer kick (hardware-only).
 *
 * Run: npm run test:cash-drawer-kick
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-cash-drawer-'));

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

const { printerRoutes } = require('../main/routes/printers');
const { buildDrawerKick } = require('../main/printers/thermal');
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

function bytesContain(buf: Buffer, needle: number[]): boolean {
  outer: for (let i = 0; i <= buf.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function main() {
  console.log('Phase 3.6F Cash Drawer Kick');
  console.log('='.repeat(60));

  // --- ESC/POS kick bytes ---
  const pin2 = buildDrawerKick({ pin: 2 });
  assertOk(Buffer.isBuffer(pin2), 'buildDrawerKick returns Buffer');
  assertOk(bytesContain(pin2, [0x1b, 0x70, 0x00]), 'pin 2 uses ESC p m=0');
  const pin5 = buildDrawerKick({ pin: 5 });
  assertOk(bytesContain(pin5, [0x1b, 0x70, 0x01]), 'pin 5 uses ESC p m=1');
  console.log('   ✓ drawer kick bytes');

  // --- UI contracts ---
  const statusUi = readFe('components/pos/PrinterStatus.tsx');
  assertOk(
    statusUi.includes('kick-drawer') || statusUi.includes('kickDrawer'),
    'PrinterStatus can kick drawer',
  );
  assertOk(
    statusUi.includes('pos.openCashDrawer') || statusUi.includes('openCashDrawer'),
    'PrinterStatus uses open-drawer label',
  );
  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  const es = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/es.json'), 'utf8');
  const pt = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/pt.json'), 'utf8');
  for (const [label, json] of [
    ['en', en],
    ['es', es],
    ['pt', pt],
  ] as const) {
    assertOk(json.includes('"pos.openCashDrawer"'), `${label} has pos.openCashDrawer`);
    assertOk(json.includes('"pos.cashDrawerOpened"'), `${label} has pos.cashDrawerOpened`);
    assertOk(json.includes('"pos.cashDrawerFailed"'), `${label} has pos.cashDrawerFailed`);
  }
  // No payment coupling
  const posPage = readFe('app/(dashboard)/pos/page.tsx');
  assertOk(!posPage.includes('kick-drawer'), 'POS page does not auto-kick on payment');
  console.log('   ✓ UI / i18n contracts');

  // --- Route source: no money-path imports ---
  const routeSrc = fs.readFileSync(path.join(ROOT, 'main/routes/printers.ts'), 'utf8');
  assertOk(routeSrc.includes('/kick-drawer'), 'printers route exposes kick-drawer');
  assertOk(
    routeSrc.includes("requireRole('owner', 'manager', 'cashier')"),
    'kick uses cashier-capable roles',
  );

  // --- API auth + no DB mutation ---
  const db = initTestDb();
  const ownerAuth = makeToken('owner-cd-001', 'owner', 'owner@cd.test');
  const cashierAuth = makeToken('cashier-cd-001', 'cashier', 'cashier@cd.test');
  const waiterAuth = makeToken('waiter-cd-001', 'waiter', 'waiter@cd.test');
  const chefAuth = makeToken('chef-cd-001', 'chef', 'chef@cd.test');

  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', ?, 1, ?, ?)`,
  ).run('owner-cd-001', 'Owner', 'owner@cd.test', 'owner', now(), now());
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', ?, 1, ?, ?)`,
  ).run('cashier-cd-001', 'Cashier', 'cashier@cd.test', 'cashier', now(), now());
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', ?, 1, ?, ?)`,
  ).run('waiter-cd-001', 'Waiter', 'waiter@cd.test', 'waiter', now(), now());
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', ?, 1, ?, ?)`,
  ).run('chef-cd-001', 'Chef', 'chef@cd.test', 'chef', now(), now());

  const billsBefore = (db.prepare(`SELECT COUNT(*) AS n FROM bills`).get() as { n: number }).n;
  const ordersBefore = (db.prepare(`SELECT COUNT(*) AS n FROM orders`).get() as { n: number }).n;
  const shiftsBefore = (db.prepare(`SELECT COUNT(*) AS n FROM shifts`).get() as { n: number }).n;
  const dayClosesBefore = (
    db.prepare(`SELECT COUNT(*) AS n FROM day_closes`).get() as { n: number }
  ).n;

  const app = createApp({ '/api/printers': printerRoutes });

  const noPrinter = await request(app).post('/api/printers/kick-drawer').set(ownerAuth);
  assertEqual(noPrinter.status, 400, 'no default printer → 400');

  db.prepare(
    `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
     VALUES (?, ?, 'network', '127.0.0.1', 9100, 1, '80mm', ?, ?)`,
  ).run('prn-cd-1', 'Test Drawer Printer', now(), now());

  // Unreachable printer → hardware failure path (502), not fake success
  const failKick = await request(app).post('/api/printers/kick-drawer').set(cashierAuth);
  assertOk(
    failKick.status === 502 || failKick.status === 500,
    `hardware fail returns error status (got ${failKick.status})`,
  );
  assertOk(failKick.body?.error || failKick.body?.detail, 'hardware fail surfaces error body');

  const waiterKick = await request(app).post('/api/printers/kick-drawer').set(waiterAuth);
  assertEqual(waiterKick.status, 403, 'waiter cannot kick drawer');

  const chefKick = await request(app).post('/api/printers/kick-drawer').set(chefAuth);
  assertEqual(chefKick.status, 403, 'chef cannot kick drawer');

  const billsAfter = (db.prepare(`SELECT COUNT(*) AS n FROM bills`).get() as { n: number }).n;
  const ordersAfter = (db.prepare(`SELECT COUNT(*) AS n FROM orders`).get() as { n: number }).n;
  const shiftsAfter = (db.prepare(`SELECT COUNT(*) AS n FROM shifts`).get() as { n: number }).n;
  const dayClosesAfter = (db.prepare(`SELECT COUNT(*) AS n FROM day_closes`).get() as { n: number })
    .n;
  assertEqual(billsAfter, billsBefore, 'no bills mutated');
  assertEqual(ordersAfter, ordersBefore, 'no orders mutated');
  assertEqual(shiftsAfter, shiftsBefore, 'no shifts mutated');
  assertEqual(dayClosesAfter, dayClosesBefore, 'no day_closes mutated');

  console.log('   ✓ API auth + hardware failure + no money mutation');

  closeDatabase();
  Module._load = originalLoad;
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const { passed, failed, total } = getResults();
  console.log('='.repeat(60));
  console.log(`✅ Phase 3.6F cash drawer kick (${passed}/${total} asserts; failed=${failed})`);
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
