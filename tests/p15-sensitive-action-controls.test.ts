/**
 * P15 — Sensitive-Action Controls Hardening
 * Usage: npm run test:p15
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-p15-sens-'));
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

process.env.JWT_SECRET = 'p15-sensitive-action-controls-secret';

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

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { settingsRoutes } = require('../main/routes/settings');
const { databaseRoutes } = require('../main/routes/database');
const { databaseToolsRoutes } = require('../main/routes/database-tools');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { setMasterPin, isMasterPinSet } = require('../main/services/master-pin');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const MANAGER_PIN = '1234';
const WRONG_PIN = '9999';
const MASTER_PIN = '4321';

function seedRole(db: any, id: string, role: string, withPin = false): string {
  const pinHash = withPin ? bcrypt.hashSync(MANAGER_PIN, 10) : null;
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    role,
    `${id}@test.local`,
    bcrypt.hashSync('Pass1234!', 10),
    role,
    pinHash,
    now(),
    now(),
  );
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `p15-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function countAudit(db: any, action: string, entityId?: string): number {
  if (entityId != null) {
    return (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM audit_logs WHERE action = ? AND entity_id = ?`,
        )
        .get(action, String(entityId)) as { c: number }
    ).c;
  }
  return (db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action = ?`).get(action) as {
    c: number;
  }).c;
}

async function createOrder(baseUrl: string, headers: Record<string, string>, productId: string) {
  return api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers,
  });
}

async function main() {
  console.log('P15 — Sensitive-Action Controls Hardening');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip remains v88');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-p15', 'cashier');
  seedRole(db, 'waiter-p15', 'waiter');
  seedRole(db, 'chef-p15', 'chef');
  // Owner also needs a PIN for some override paths that scan all managers/owners
  db.prepare(`UPDATE users SET pin_hash = ? WHERE id = ?`).run(
    bcrypt.hashSync(MANAGER_PIN, 10),
    owner.userId,
  );

  seedCategory(db, 'cat-p15', 'P15 Cat');
  seedProduct(db, 'prod-p15', 'cat-p15', 'P15 Latte', 200);

  setMasterPin(MASTER_PIN);
  assert(isMasterPinSet(), 'master PIN set for gated tests');

  const ownerAuth = owner.authHeader;
  const managerAuth = manager.authHeader;
  const cashierAuth = auth('cashier-p15', 'cashier');
  const waiterAuth = auth('waiter-p15', 'waiter');
  const chefAuth = auth('chef-p15', 'chef');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/settings': settingsRoutes,
    '/api/db': databaseRoutes,
    '/api/db-tools': databaseToolsRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // --- Unauthenticated ---
    const unauth = await api(baseUrl, '/api/db/export', { method: 'GET' });
    assertEqual(unauth.status, 401, 'unauthenticated export denied');

    // --- Bill discount tender guard (H1 parity) ---
    const oPay = await createOrder(baseUrl, ownerAuth, 'prod-p15');
    const orderPayId = oPay.data.order.id;
    const billGen = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: orderPayId },
      headers: ownerAuth,
    });
    assertEqual(billGen.status, 201, 'bill generate');
    const billId = billGen.data.bill.id;
    const total = Number(billGen.data.bill.total);
    const partialAmount = Math.max(1, Math.floor(total / 2));
    const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: partialAmount },
      headers: {
        ...ownerAuth,
        'Idempotency-Key': 'p15-pay-partial-1',
      },
    });
    assert(pay.status === 200 || pay.status === 201, `partial pay ok got ${pay.status}`);

    const discAfterTender = await api(baseUrl, `/api/bills/${billId}/applyDiscount`, {
      method: 'POST',
      body: { type: 'percentage', value: 10, reason: 'late' },
      headers: ownerAuth,
    });
    assertEqual(discAfterTender.status, 409, 'bill discount after tender → 409');
    assertEqual(
      discAfterTender.data.code,
      'ORDER_HAS_SUCCESSFUL_TENDER',
      'ORDER_HAS_SUCCESSFUL_TENDER',
    );
    assertEqual(
      countAudit(db, 'bill.discount_applied', billId),
      0,
      'no success audit on rejected bill discount',
    );

    // Cashier cannot bill-discount
    const cashDisc = await api(baseUrl, `/api/bills/${billId}/applyDiscount`, {
      method: 'POST',
      body: { type: 'percentage', value: 5 },
      headers: cashierAuth,
    });
    assertEqual(cashDisc.status, 403, 'cashier bill discount denied');

    console.log('   ✓ bill discount tender guard + RBAC');

    // --- Order cancel PIN accountability ---
    const oCancel = await createOrder(baseUrl, ownerAuth, 'prod-p15');
    const cancelId = oCancel.data.order.id;
    await api(baseUrl, `/api/orders/${cancelId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'pending' },
      headers: ownerAuth,
    });

    const badPin = await api(baseUrl, `/api/orders/${cancelId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', expected_status: 'preparing', override_pin: WRONG_PIN },
      headers: cashierAuth,
    });
    assertEqual(badPin.status, 403, 'bad cancel PIN → 403');
    assert(
      countAudit(db, 'order.cancel_pin_failed', cancelId) >= 1,
      'failed cancel PIN audited',
    );
    assertEqual(
      countAudit(db, 'order.cancelled', cancelId),
      0,
      'no success cancel audit after failed PIN',
    );

    const goodCancel = await api(baseUrl, `/api/orders/${cancelId}/status`, {
      method: 'PATCH',
      body: {
        status: 'cancelled',
        expected_status: 'preparing',
        override_pin: MANAGER_PIN,
        reason: 'p15',
      },
      headers: cashierAuth,
    });
    assertEqual(goodCancel.status, 200, 'cancel with PIN succeeds');
    const cancelRow = db
      .prepare(
        `SELECT metadata_json FROM audit_logs WHERE action = 'order.cancelled' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(String(cancelId)) as { metadata_json: string };
    const cancelMeta = JSON.parse(cancelRow.metadata_json || '{}');
    assert(!!cancelMeta.pin_approved_by, 'pin_approved_by on order.cancelled');
    assertEqual(
      cancelRow && countAudit(db, 'order.cancelled', cancelId),
      1,
      'one success cancel audit',
    );

    // Actor spoof: body user_id must not become actor
    const actorRow = db
      .prepare(
        `SELECT actor_user_id FROM audit_logs WHERE action = 'order.cancelled' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(String(cancelId)) as { actor_user_id: string };
    assertEqual(actorRow.actor_user_id, 'cashier-p15', 'cancel actor is JWT cashier');

    console.log('   ✓ order cancel PIN failure/success audits');

    // --- Item void failed PIN audit ---
    const oVoid = await createOrder(baseUrl, ownerAuth, 'prod-p15');
    const voidOrderId = oVoid.data.order.id;
    const itemId = oVoid.data.order.items[0].id;
    db.prepare(`UPDATE order_items SET status = 'preparing', updated_at = ? WHERE id = ?`).run(
      now(),
      itemId,
    );
    const badVoid = await api(baseUrl, `/api/orders/${voidOrderId}/items/${itemId}/cancel`, {
      method: 'PATCH',
      body: { override_pin: WRONG_PIN },
      headers: cashierAuth,
    });
    assertEqual(badVoid.status, 403, 'bad void PIN → 403');
    assert(
      countAudit(db, 'order.item_void_pin_failed', itemId) >= 1,
      'failed void PIN audited',
    );

    console.log('   ✓ item void PIN failure audit');

    // --- network_mode sensitive control ---
    const mgrLan = await api(baseUrl, '/api/settings/network_mode', {
      method: 'PUT',
      body: { value: 'lan', master_pin: MASTER_PIN },
      headers: managerAuth,
    });
    assertEqual(mgrLan.status, 403, 'manager cannot enable lan');

    const ownerLanNoPin = await api(baseUrl, '/api/settings/network_mode', {
      method: 'PUT',
      body: { value: 'lan' },
      headers: ownerAuth,
    });
    assert(ownerLanNoPin.status === 400 || ownerLanNoPin.status === 403, 'owner lan without Master PIN denied');

    const beforeNet = countAudit(db, 'settings.network_mode_changed');
    const ownerLan = await api(baseUrl, '/api/settings/network_mode', {
      method: 'PUT',
      body: { value: 'lan', master_pin: MASTER_PIN },
      headers: ownerAuth,
    });
    assertEqual(ownerLan.status, 200, 'owner + Master PIN enables lan');
    assertEqual(
      countAudit(db, 'settings.network_mode_changed'),
      beforeNet + 1,
      'network_mode change audited',
    );

    const ownerLocal = await api(baseUrl, '/api/settings/network_mode', {
      method: 'PUT',
      body: { value: 'localhost' },
      headers: ownerAuth,
    });
    assertEqual(ownerLocal.status, 200, 'localhost without Master PIN ok for owner');

    console.log('   ✓ network_mode owner+PIN + audit');

    // --- Master PIN reset audit ---
    const cashReset = await api(baseUrl, '/api/db-tools/master-pin/reset', {
      method: 'POST',
      body: { pin: '1111', confirm_pin: '1111' },
      headers: cashierAuth,
    });
    assertEqual(cashReset.status, 403, 'cashier cannot reset Master PIN');

    const beforeReset = countAudit(db, 'master_pin.reset');
    const resetOk = await api(baseUrl, '/api/db-tools/master-pin/reset', {
      method: 'POST',
      body: { pin: '5555', confirm_pin: '5555' },
      headers: ownerAuth,
    });
    assertEqual(resetOk.status, 200, 'owner reset Master PIN');
    assertEqual(countAudit(db, 'master_pin.reset'), beforeReset + 1, 'master_pin.reset audited');
    setMasterPin(MASTER_PIN); // restore for remaining tests

    console.log('   ✓ master_pin.reset audit + RBAC');

    // --- DB export audit ---
    const cashExport = await api(baseUrl, '/api/db/export', {
      method: 'GET',
      headers: cashierAuth,
    });
    assertEqual(cashExport.status, 403, 'cashier export denied');

    const beforeExport = countAudit(db, 'db.exported');
    const exportOk = await api(baseUrl, '/api/db/export', {
      method: 'GET',
      headers: ownerAuth,
    });
    assertEqual(exportOk.status, 200, 'owner export ok');
    assertEqual(countAudit(db, 'db.exported'), beforeExport + 1, 'db.exported audited');

    console.log('   ✓ db export audit + RBAC');

    // --- Forged JWT role does not elevate ---
    const forged = auth('cashier-p15', 'owner');
    const forgedLan = await api(baseUrl, '/api/settings/network_mode', {
      method: 'PUT',
      body: { value: 'kds_lan', master_pin: MASTER_PIN },
      headers: forged,
    });
    assertEqual(forgedLan.status, 403, 'forged JWT role cannot enable LAN');

    // Waiter/chef bill discount
    assertEqual(
      (
        await api(baseUrl, `/api/bills/${billId}/applyDiscount`, {
          method: 'POST',
          body: { type: 'percentage', value: 1 },
          headers: waiterAuth,
        })
      ).status,
      403,
      'waiter bill discount denied',
    );
    assertEqual(
      (
        await api(baseUrl, `/api/bills/${billId}/applyDiscount`, {
          method: 'POST',
          body: { type: 'percentage', value: 1 },
          headers: chefAuth,
        })
      ).status,
      403,
      'chef bill discount denied',
    );

    // P14 conflict still works
    const oCas = await createOrder(baseUrl, ownerAuth, 'prod-p15');
    const casId = oCas.data.order.id;
    await api(baseUrl, `/api/orders/${casId}/status`, {
      method: 'PATCH',
      body: { status: 'ready', expected_status: 'pending' },
      headers: ownerAuth,
    });
    const stale = await api(baseUrl, `/api/orders/${casId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'pending' },
      headers: ownerAuth,
    });
    assertEqual(stale.status, 409, 'P14 ORDER_STATUS_CONFLICT preserved');
    assertEqual(stale.data.code, 'ORDER_STATUS_CONFLICT', 'conflict code');

    console.log('   ✓ actor integrity + role matrix + P14 preserved');
    console.log('   ✓ schema remains v88');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('='.repeat(60));
  console.log(`P15 results: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
