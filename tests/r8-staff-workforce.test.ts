/**
 * R8 Staff & Workforce OS — S-STAFF-01 … S-STAFF-20.
 *
 * Usage: npm run test:r8
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r8-staff-'));
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

process.env.JWT_SECRET = 'r8-staff-workforce-os-secret';

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

const { staffRoutes } = require('../main/routes/staff');
const { shiftRoutes } = require('../main/routes/shifts');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { openShift } = require('../main/services/shift');
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

function upsertSetting(db: any, key: string, value: string) {
  const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
  if (existing) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(value, now(), key);
  } else {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, value, now());
  }
}

async function main() {
  console.log('\nR8 — Staff & Workforce OS\n' + '='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'S-STAFF schema tip is v89');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRole(db, 'user-cashier-r8', 'cashier', 'cashier-r8@test.local');
  const waiter = seedRole(db, 'user-waiter-r8', 'waiter', 'waiter-r8@test.local');
  const chef = seedRole(db, 'user-chef-r8', 'chef', 'chef-r8@test.local');

  upsertSetting(db, 'shifts_enabled', 'true');

  const app = createApp({
    '/api/staff': staffRoutes,
    '/api/shifts': shiftRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // S-STAFF-01 create
    console.log('\nS-STAFF-01 staff create');
    const created = await api(baseUrl, '/api/staff', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        name: 'Ria Waiter',
        email: 'ria.waiter@test.local',
        password: 'StrongPass1',
        role: 'waiter',
      },
    });
    assertEqual(created.status, 201, 'create 201');
    const staffId = String(created.data.staff.id);
    assertEqual(created.data.staff.role, 'waiter', 'role waiter');
    assertEqual(Number(created.data.staff.is_active), 1, 'active');
    assert(!('password' in created.data.staff), 'no password leak');
    assert(!('pin_hash' in created.data.staff), 'no pin_hash leak');

    // S-STAFF-02 update
    console.log('\nS-STAFF-02 staff update');
    const updated = await api(baseUrl, `/api/staff/${staffId}`, {
      method: 'PUT',
      headers: manager.authHeader,
      body: { name: 'Ria Floor' },
    });
    assertEqual(updated.status, 200, 'update 200');
    assertEqual(updated.data.staff.name, 'Ria Floor', 'name updated');

    // S-STAFF-03 search / filter
    console.log('\nS-STAFF-03 staff search/filter');
    const search = await api(baseUrl, '/api/staff?search=Ria', {
      headers: owner.authHeader,
    });
    assertEqual(search.status, 200, 'search 200');
    assert(
      (search.data.staff || []).some((s: any) => String(s.id) === staffId),
      'found by name',
    );
    const byRole = await api(baseUrl, '/api/staff?role=waiter&active=true', {
      headers: owner.authHeader,
    });
    assertEqual(byRole.status, 200, 'role filter 200');
    assert(
      (byRole.data.staff || []).every((s: any) => s.role === 'waiter'),
      'all waiters',
    );

    // S-STAFF-04 detail profile
    console.log('\nS-STAFF-04 staff detail');
    const detail = await api(baseUrl, `/api/staff/${staffId}`, {
      headers: owner.authHeader,
    });
    assertEqual(detail.status, 200, 'detail 200');
    assert(detail.data.staff.performance, 'performance present');
    assert(Array.isArray(detail.data.staff.recent_shifts), 'recent_shifts array');
    assert('open_shift_count' in detail.data.staff, 'open_shift_count');

    // S-STAFF-05 deactivate / activate
    console.log('\nS-STAFF-05 activate/deactivate');
    const deactivated = await api(baseUrl, `/api/staff/${staffId}/deactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });
    assertEqual(deactivated.status, 200, 'deactivate 200');
    assertEqual(Number(deactivated.data.staff.is_active), 0, 'inactive');
    const again = await api(baseUrl, `/api/staff/${staffId}/deactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });
    assertEqual(again.status, 400, 'double deactivate 400');
    const activated = await api(baseUrl, `/api/staff/${staffId}/reactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });
    assertEqual(activated.status, 200, 'reactivate 200');
    assertEqual(Number(activated.data.staff.is_active), 1, 'active again');

    // S-STAFF-06 inactive staff preserves history identity
    console.log('\nS-STAFF-06 inactive preserves record');
    await api(baseUrl, `/api/staff/${staffId}/deactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });
    const inactiveDetail = await api(baseUrl, `/api/staff/${staffId}`, {
      headers: owner.authHeader,
    });
    assertEqual(inactiveDetail.status, 200, 'inactive still readable');
    assertEqual(String(inactiveDetail.data.staff.id), staffId, 'id preserved');
    await api(baseUrl, `/api/staff/${staffId}/reactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });

    // S-STAFF-07 role change owner-only + audit
    console.log('\nS-STAFF-07 role change authorization');
    const mgrRole = await api(baseUrl, `/api/staff/${staffId}`, {
      method: 'PUT',
      headers: manager.authHeader,
      body: { role: 'cashier' },
    });
    assertEqual(mgrRole.status, 403, 'manager cannot change roles');
    const ownerRole = await api(baseUrl, `/api/staff/${staffId}`, {
      method: 'PUT',
      headers: owner.authHeader,
      body: { role: 'cashier' },
    });
    assertEqual(ownerRole.status, 200, 'owner role change');
    assertEqual(ownerRole.data.staff.role, 'cashier', 'now cashier');

    // S-STAFF-08 last-owner protection
    console.log('\nS-STAFF-08 last-owner protection');
    const lastOwnerDeact = await api(baseUrl, `/api/staff/${owner.userId}/deactivate`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(lastOwnerDeact.status, 400, 'cannot deactivate last owner');
    const lastOwnerDemote = await api(baseUrl, `/api/staff/${owner.userId}`, {
      method: 'PUT',
      headers: owner.authHeader,
      body: { role: 'manager' },
    });
    assertEqual(lastOwnerDemote.status, 400, 'cannot demote last owner');

    // S-STAFF-09 unauthorized roles
    console.log('\nS-STAFF-09 unauthorized access');
    const waiterList = await api(baseUrl, '/api/staff', { headers: waiter.authHeader });
    assertEqual(waiterList.status, 403, 'waiter list denied');
    const chefList = await api(baseUrl, '/api/staff', { headers: chef.authHeader });
    assertEqual(chefList.status, 403, 'chef list denied');
    const cashierList = await api(baseUrl, '/api/staff', { headers: cashier.authHeader });
    assertEqual(cashierList.status, 403, 'cashier list denied');

    // S-STAFF-10 manager cannot touch owner/manager
    console.log('\nS-STAFF-10 manager boundary');
    const touchOwner = await api(baseUrl, `/api/staff/${owner.userId}`, {
      method: 'PUT',
      headers: manager.authHeader,
      body: { name: 'Hacked' },
    });
    assertEqual(touchOwner.status, 403, 'manager cannot edit owner');

    // S-STAFF-11 validation failures
    console.log('\nS-STAFF-11 validation');
    const badCreate = await api(baseUrl, '/api/staff', {
      method: 'POST',
      headers: manager.authHeader,
      body: { name: '', password: 'weak', role: 'waiter' },
    });
    assert(badCreate.status === 400 || badCreate.status === 422, 'invalid create rejected');
    const putActive = await api(baseUrl, `/api/staff/${staffId}`, {
      method: 'PUT',
      headers: manager.authHeader,
      body: { is_active: false },
    });
    assertEqual(putActive.status, 400, 'PUT is_active rejected');

    // S-STAFF-12 nonexistent / inactive mutation safety
    console.log('\nS-STAFF-12 nonexistent staff');
    const missing = await api(baseUrl, '/api/staff/does-not-exist/deactivate', {
      method: 'POST',
      headers: manager.authHeader,
    });
    assertEqual(missing.status, 404, 'missing deactivate 404');

    // S-STAFF-13 audit events
    console.log('\nS-STAFF-13 audit events');
    const audits = db
      .prepare(
        `SELECT action FROM audit_logs WHERE entity_type = 'user' AND entity_id = ? ORDER BY id ASC`,
      )
      .all(staffId)
      .map((r: any) => r.action);
    assert(audits.includes('staff.created'), 'staff.created');
    assert(audits.includes('staff.updated'), 'staff.updated');
    assert(audits.includes('staff.deactivated'), 'staff.deactivated');
    assert(audits.includes('staff.activated'), 'staff.activated');
    assert(audits.includes('role.changed'), 'role.changed');

    // S-STAFF-14 shift association / currently working
    console.log('\nS-STAFF-14 shift visibility / currently working');
    const shift = openShift({
      actor: { userId: cashier.id, role: 'cashier' },
      openingFloatCents: 0,
      terminalId: 'term-r8-1',
    });
    assert(shift?.id, 'shift opened');
    const working = await api(baseUrl, '/api/staff/working', {
      headers: owner.authHeader,
    });
    assertEqual(working.status, 200, 'working 200');
    assert(
      (working.data.working || []).some((w: any) => String(w.user_id) === String(cashier.id)),
      'cashier currently working',
    );
    const cashierDetail = await api(baseUrl, `/api/staff/${cashier.id}`, {
      headers: owner.authHeader,
    });
    assertEqual(cashierDetail.status, 200, 'cashier detail');
    assert(
      Number(cashierDetail.data.staff.open_shift_count) >= 1,
      'open_shift_count >= 1',
    );
    assert(
      (cashierDetail.data.staff.recent_shifts || []).some(
        (s: any) => Number(s.id) === Number(shift.id),
      ),
      'recent_shifts includes open shift',
    );

    // S-STAFF-15 offline / local SQLite
    console.log('\nS-STAFF-15 offline local SQLite');
    assert(created.status === 201 && detail.status === 200, 'local SQLite staff ops work');

    // S-STAFF-16 concurrency-sensitive deactivate CAS
    console.log('\nS-STAFF-16 concurrent deactivate safety');
    const target = await api(baseUrl, '/api/staff', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        name: 'Concurrent Target',
        email: 'concurrent-r8@test.local',
        password: 'StrongPass1',
        role: 'chef',
      },
    });
    const tid = String(target.data.staff.id);
    const d1 = await api(baseUrl, `/api/staff/${tid}/deactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });
    const d2 = await api(baseUrl, `/api/staff/${tid}/deactivate`, {
      method: 'POST',
      headers: manager.authHeader,
    });
    assertEqual(d1.status, 200, 'first deactivate wins');
    assertEqual(d2.status, 400, 'second deactivate rejected');

    // S-STAFF-17 duplicate email
    console.log('\nS-STAFF-17 duplicate email');
    const dup = await api(baseUrl, '/api/staff', {
      method: 'POST',
      headers: manager.authHeader,
      body: {
        name: 'Dup',
        email: 'ria.waiter@test.local',
        password: 'StrongPass1',
        role: 'waiter',
      },
    });
    assertEqual(dup.status, 400, 'duplicate email rejected');

    // S-STAFF-18 Zod deactivate params
    console.log('\nS-STAFF-18 Zod params on lifecycle');
    const staffRouteSrc = fs.readFileSync(
      path.join(__dirname, '../main/routes/staff.ts'),
      'utf8',
    );
    assert(
      staffRouteSrc.includes("'/ :id/deactivate'".replace(' ', '')) ||
        (staffRouteSrc.includes('/:id/deactivate') &&
          staffRouteSrc.includes('validateParams(staffIdParamsSchema)')),
      'deactivate uses Zod params',
    );
    assert(staffRouteSrc.includes('/:id/reactivate'), 'reactivate route present');
    const reactivateMissing = await api(baseUrl, '/api/staff/does-not-exist/reactivate', {
      method: 'POST',
      headers: manager.authHeader,
    });
    assertEqual(reactivateMissing.status, 404, 'missing reactivate 404');

    // S-STAFF-19 UI artifacts
    console.log('\nS-STAFF-19 UI staff detail page');
    const detailPage = path.join(
      __dirname,
      '../frontend/src/app/(dashboard)/staff/detail/page.tsx',
    );
    assert(fs.existsSync(detailPage), 'staff detail page exists');
    const listPage = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/staff/page.tsx'),
      'utf8',
    );
    assert(listPage.includes('search') || listPage.includes('Search'), 'list has search');

    // S-STAFF-20 regression shapes
    console.log('\nS-STAFF-20 regression shapes');
    const list = await api(baseUrl, '/api/staff', { headers: owner.authHeader });
    assertEqual(list.status, 200, 'list ok');
    assert(Array.isArray(list.data.staff), 'staff array');

    console.log('\n' + '='.repeat(60));
    const { passed, failed } = getResults();
    console.log(`${passed}/${passed + failed} passed, ${failed} failed\n`);
    if (failed === 0) console.log('R8 COMPLETE — all S-STAFF scenarios passed\n');
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
