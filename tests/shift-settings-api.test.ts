/**
 * P1.5 — shifts_enabled / require_open_shift_for_cash via authorized settings API.
 *
 * Covers owner/manager enablement, staff denial, invalid values, persistence,
 * and POST /api/shifts/open behavior when enabled vs disabled.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/shift-settings-api.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-settings-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-shift-settings';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const {
  initTestDb, createApp, assert, assertEqual, closeDatabase, now,
} = require('./helpers/test-setup');

const { settingsRoutes } = require('../main/routes/settings');
const { shiftRoutes } = require('../main/routes/shifts');
const { getJWTSecret } = require('../main/routes/auth');
const { getDatabase, initDatabase, closeDatabase: closeDb, getDbPath } = require('../main/db');

function seedUser(db: any, id: string, role: string, email: string) {
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id, `${role} user`, email,
    bcrypt.hashSync('testpass123', 10),
    role,
    bcrypt.hashSync('1234', 10),
    now(), now(),
  );
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

function settingValue(db: any, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

async function main() {
  console.log('P1.5 Shift settings API (shifts_enabled / require_open_shift_for_cash)');
  console.log('='.repeat(60));

  const db = initTestDb();
  const ownerAuth = seedUser(db, 'shift-set-owner', 'owner', 'shift-set-owner@test.local');
  const managerAuth = seedUser(db, 'shift-set-manager', 'manager', 'shift-set-manager@test.local');
  const cashierAuth = seedUser(db, 'shift-set-cashier', 'cashier', 'shift-set-cashier@test.local');
  const waiterAuth = seedUser(db, 'shift-set-waiter', 'waiter', 'shift-set-waiter@test.local');
  const chefAuth = seedUser(db, 'shift-set-chef', 'chef', 'shift-set-chef@test.local');

  const app = createApp({
    '/api/settings': settingsRoutes,
    '/api/shifts': shiftRoutes,
  });

  try {
    // ── Defaults ──────────────────────────────────────────────────────────
    console.log('\n1. Defaults remain opt-in (false)');
    const shiftsDefault = await request(app).get('/api/settings/shifts_enabled').set(ownerAuth);
    assertEqual(shiftsDefault.status, 200, 'GET shifts_enabled');
    assertEqual(shiftsDefault.body.setting?.value, 'false', 'shifts_enabled defaults false');

    const cashGateDefault = await request(app).get('/api/settings/require_open_shift_for_cash').set(ownerAuth);
    assertEqual(cashGateDefault.status, 200, 'GET require_open_shift_for_cash');
    assertEqual(cashGateDefault.body.setting?.value, 'false', 'require_open_shift_for_cash defaults false');

    // ── Disabled open still 503 ───────────────────────────────────────────
    console.log('\n2. Open shift blocked while disabled');
    const disabledOpen = await request(app)
      .post('/api/shifts/open')
      .set(cashierAuth)
      .set('X-Flo-Terminal-Id', 'term-disabled-1')
      .send({ opening_float_cents: 1000 });
    assertEqual(disabledOpen.status, 503, 'open while disabled → 503');
    assert(
      String(disabledOpen.body.error || '').toLowerCase().includes('disabled')
        || String(disabledOpen.body.error || '').toLowerCase().includes('shift'),
      'disabled error message present',
    );

    // ── Staff cannot enable ───────────────────────────────────────────────
    console.log('\n3. Unauthorized staff cannot enable shifts');
    for (const [label, auth] of [
      ['cashier', cashierAuth],
      ['waiter', waiterAuth],
      ['chef', chefAuth],
    ] as const) {
      const denied = await request(app)
        .put('/api/settings/shifts_enabled')
        .set(auth)
        .send({ value: 'true' });
      assertEqual(denied.status, 403, `${label} cannot PUT shifts_enabled`);
      assertEqual(settingValue(db, 'shifts_enabled'), 'false', `${label} must not flip setting`);
    }

    // ── Owner can enable ──────────────────────────────────────────────────
    console.log('\n4. Owner can enable shifts_enabled');
    const ownerEnable = await request(app)
      .put('/api/settings/shifts_enabled')
      .set(ownerAuth)
      .send({ value: 'true' });
    assertEqual(ownerEnable.status, 200, 'owner PUT shifts_enabled 200');
    assertEqual(ownerEnable.body.setting?.value, 'true', 'owner enable returns true');
    assertEqual(settingValue(db, 'shifts_enabled'), 'true', 'owner enable persists');

    const openAfterOwner = await request(app)
      .post('/api/shifts/open')
      .set(cashierAuth)
      .set('X-Flo-Terminal-Id', 'term-after-owner')
      .send({ opening_float_cents: 1500 });
    assertEqual(openAfterOwner.status, 201, `open after owner enable (got ${openAfterOwner.status})`);
    assertEqual(openAfterOwner.body.shift?.status, 'open', 'shift is open');

    // Close so later opens are clean
    const shiftId = openAfterOwner.body.shift?.id;
    assert(!!shiftId, 'opened shift id present');
    await request(app)
      .post(`/api/shifts/${shiftId}/close`)
      .set(ownerAuth)
      .send({ counted_cash_cents: 1500 });

    // ── Manager can enable / disable ──────────────────────────────────────
    console.log('\n5. Manager can change operational shift settings');
    const managerDisable = await request(app)
      .put('/api/settings/shifts_enabled')
      .set(managerAuth)
      .send({ value: 'false' });
    assertEqual(managerDisable.status, 200, 'manager can disable');
    assertEqual(managerDisable.body.setting?.value, 'false');

    const reDisabledOpen = await request(app)
      .post('/api/shifts/open')
      .set(cashierAuth)
      .set('X-Flo-Terminal-Id', 'term-re-disabled')
      .send({ opening_float_cents: 0 });
    assertEqual(reDisabledOpen.status, 503, 'open after manager disable → 503');

    const managerEnable = await request(app)
      .put('/api/settings/shifts_enabled')
      .set(managerAuth)
      .send({ value: 'true' });
    assertEqual(managerEnable.status, 200, 'manager can enable');
    assertEqual(managerEnable.body.setting?.value, 'true');

    // ── require_open_shift_for_cash ───────────────────────────────────────
    console.log('\n6. require_open_shift_for_cash owner/manager + staff deny');
    const cashGateStaff = await request(app)
      .put('/api/settings/require_open_shift_for_cash')
      .set(cashierAuth)
      .send({ value: 'true' });
    assertEqual(cashGateStaff.status, 403, 'cashier cannot set cash gate');

    const cashGateOwner = await request(app)
      .put('/api/settings/require_open_shift_for_cash')
      .set(ownerAuth)
      .send({ value: 'true' });
    assertEqual(cashGateOwner.status, 200, 'owner sets cash gate');
    assertEqual(cashGateOwner.body.setting?.value, 'true');
    assertEqual(settingValue(db, 'require_open_shift_for_cash'), 'true');

    const cashGateManager = await request(app)
      .put('/api/settings/require_open_shift_for_cash')
      .set(managerAuth)
      .send({ value: 'false' });
    assertEqual(cashGateManager.status, 200, 'manager clears cash gate');
    assertEqual(cashGateManager.body.setting?.value, 'false');

    // ── Invalid values ────────────────────────────────────────────────────
    console.log('\n7. Invalid boolean values rejected');
    const beforeInvalid = settingValue(db, 'shifts_enabled');
    const invalid = await request(app)
      .put('/api/settings/shifts_enabled')
      .set(ownerAuth)
      .send({ value: 'maybe' });
    assertEqual(invalid.status, 400, 'invalid shifts_enabled → 400');
    assertEqual(settingValue(db, 'shifts_enabled'), beforeInvalid, 'invalid write must not persist');

    const invalidCash = await request(app)
      .put('/api/settings/require_open_shift_for_cash')
      .set(ownerAuth)
      .send({ value: 'sometimes' });
    assertEqual(invalidCash.status, 400, 'invalid cash gate → 400');

    const missing = await request(app)
      .put('/api/settings/shifts_enabled')
      .set(ownerAuth)
      .send({});
    assertEqual(missing.status, 400, 'missing value → 400');

    // ── Allowlist still protects terminal_id ──────────────────────────────
    console.log('\n8. Unrelated sensitive/host keys remain blocked');
    const terminalDenied = await request(app)
      .put('/api/settings/terminal_id')
      .set(ownerAuth)
      .send({ value: 'hacked-terminal' });
    assertEqual(terminalDenied.status, 403, 'terminal_id still blocked on wildcard');

    // ── Persist across restart ────────────────────────────────────────────
    console.log('\n9. Settings persist across DB reopen');
    await request(app).put('/api/settings/shifts_enabled').set(ownerAuth).send({ value: 'true' });
    await request(app).put('/api/settings/require_open_shift_for_cash').set(ownerAuth).send({ value: 'true' });
    assertEqual(settingValue(db, 'shifts_enabled'), 'true');
    assertEqual(settingValue(db, 'require_open_shift_for_cash'), 'true');

    closeDb();
    initDatabase();
    const reopened = getDatabase();
    assertEqual(settingValue(reopened, 'shifts_enabled'), 'true', 'shifts_enabled survives reopen');
    assertEqual(
      settingValue(reopened, 'require_open_shift_for_cash'),
      'true',
      'require_open_shift_for_cash survives reopen',
    );

    // Re-mount app against reopened DB for a final open check
    const app2 = createApp({
      '/api/settings': settingsRoutes,
      '/api/shifts': shiftRoutes,
    });
    const openPersisted = await request(app2)
      .post('/api/shifts/open')
      .set(cashierAuth)
      .set('X-Flo-Terminal-Id', 'term-persisted')
      .send({ opening_float_cents: 500 });
    assertEqual(openPersisted.status, 201, 'open succeeds after reopen with shifts enabled');

    // ── UI contract: Settings page exposes toggles ────────────────────────
    console.log('\n10. Settings UI exposes shift management toggles');
    const settingsPage = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/settings/page.tsx'),
      'utf8',
    );
    assert(settingsPage.includes('/settings/shifts_enabled'), 'UI writes shifts_enabled');
    assert(
      settingsPage.includes('/settings/require_open_shift_for_cash'),
      'UI writes require_open_shift_for_cash',
    );

    console.log('\n✅ Shift settings API suite passed');
    console.log(`   db path: ${getDbPath()}`);
  } finally {
    try { closeDatabase(); } catch { /* ignore */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err);
  try { closeDatabase(); } catch { /* ignore */ }
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});
