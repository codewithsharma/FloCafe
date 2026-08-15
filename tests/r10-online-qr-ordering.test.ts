/**
 * R10 — Online / QR Ordering (pay-at-counter).
 * Usage: npm run test:r10
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r10-qr-'));
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

process.env.JWT_SECRET = 'r10-qr-ordering-secret';

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

const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { tableRoutes } = require('../main/routes/tables');
const { publicQrRoutes, tableQrStaffRoutes } = require('../main/routes/public-qr');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `r10-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function seedCashier(db: any): string {
  const id = 'cashier-r10';
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, 'Cashier', 'cashier-r10@test.local', ?, 'cashier', 1, ?, ?)`,
  ).run(id, bcrypt.hashSync('Pass1234!', 10), now(), now());
  return id;
}

async function main(): Promise<void> {
  console.log('\nR10 — Online / QR Ordering');
  console.log('='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 84, 'schema tip is v84');
  initTestDb();
  const db = getDatabase();
  assertEqual(Number(db.pragma('user_version', { simple: true })), 84, 'fresh DB tip 84');

  const systemUser = db.prepare(`SELECT id, is_active FROM users WHERE id = 'usr-system-qr-guest'`).get() as
    | { id: string; is_active: number }
    | undefined;
  assert(!!systemUser, 'system QR guest user exists');
  assertEqual(Number(systemUser!.is_active), 0, 'system QR guest is inactive for login');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashierId = seedCashier(db);

  const catId = 'cat-r10';
  db.prepare(
    `INSERT INTO categories (id, name, is_active, created_at, updated_at) VALUES (?, 'Drinks', 1, ?, ?)`,
  ).run(catId, now(), now());
  const productId = 'prod-r10-latte';
  db.prepare(
    `INSERT INTO products (id, category_id, name, price, price_cents, is_active, created_at, updated_at)
     VALUES (?, ?, 'Latte', 5, 500, 1, ?, ?)`,
  ).run(productId, catId, now(), now());
  db.prepare(
    `INSERT INTO products (id, category_id, name, price, price_cents, cost, is_active, created_at, updated_at)
     VALUES ('prod-r10-hidden', ?, 'Hidden Cost', 9, 900, 3, 0, ?, ?)`,
  ).run(catId, now(), now());

  const tableId = 'tbl-r10-1';
  db.prepare(
    `INSERT INTO tables (id, number, capacity, status, is_active, created_at, updated_at)
     VALUES (?, 'T1', 4, 'available', 1, ?, ?)`,
  ).run(tableId, now(), now());

  const app = createApp({
    '/api/tables': tableRoutes,
  });
  app.use('/api/tables', tableQrStaffRoutes());
  app.use('/api/public/qr', publicQrRoutes());

  const { baseUrl, server } = await startServer(app);

  try {
    const qrRes = await api(baseUrl, `/api/tables/${tableId}/qr`, {
      headers: owner.authHeader,
    });
    assertEqual(qrRes.status, 200, 'owner can fetch table QR');
    const token = qrRes.data.token as string;
    assert(typeof token === 'string' && token.length >= 16, 'token opaque length');
    assertEqual(qrRes.data.pay_at_counter, true, 'staff QR marks pay-at-counter');

    const cashierQr = await api(baseUrl, `/api/tables/${tableId}/qr`, {
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(cashierQr.status, 403, 'cashier cannot fetch table QR');

    const badSession = await api(baseUrl, `/api/public/qr/session?token=not-a-real-token-xxxxxx`);
    assert(badSession.status === 401 || badSession.status === 400, 'invalid token rejected');

    const session = await api(baseUrl, `/api/public/qr/session?token=${encodeURIComponent(token)}`);
    assertEqual(session.status, 200, 'public session ok without JWT');
    assertEqual(session.data.table_id, tableId, 'session table id');
    assertEqual(session.data.pay_at_counter, true, 'session pay-at-counter');

    const menu = await api(baseUrl, `/api/public/qr/menu?token=${encodeURIComponent(token)}`);
    assertEqual(menu.status, 200, 'public menu ok');
    const menuItems = menu.data.items as any[];
    assert(menuItems.some((i) => i.id === productId), 'active product listed');
    assert(!menuItems.some((i) => i.id === 'prod-r10-hidden'), 'inactive product hidden');
    assert(!menuItems.some((i) => 'cost' in i), 'public menu omits cost');

    const create = await api(baseUrl, `/api/public/qr/orders`, {
      method: 'POST',
      body: {
        token,
        items: [{ product_id: productId, quantity: 2 }],
      },
    });
    assertEqual(create.status, 201, 'guest can create dine_in order');
    assertEqual(create.data.pay_at_counter, true, 'create response pay-at-counter');
    assertEqual(create.data.order.type, 'dine_in', 'order type dine_in');
    assertEqual(create.data.order.table_id, tableId, 'order bound to table');
    assertEqual(create.data.order.user_id, 'usr-system-qr-guest', 'system attribution user');
    const orderId = create.data.order.id;

    const tableRow = db.prepare('SELECT status FROM tables WHERE id = ?').get(tableId) as {
      status: string;
    };
    assertEqual(tableRow.status, 'occupied', 'table occupied after QR order');

    const status = await api(
      baseUrl,
      `/api/public/qr/orders/${orderId}?token=${encodeURIComponent(token)}`,
    );
    assertEqual(status.status, 200, 'guest can poll own order status');
    assertEqual(status.data.status, 'pending', 'order pending');

    const rotate = await api(baseUrl, `/api/tables/${tableId}/qr-token/rotate`, {
      method: 'POST',
      body: {},
      headers: manager.authHeader,
    });
    assertEqual(rotate.status, 200, 'manager can rotate token');
    const newToken = rotate.data.token as string;
    assert(newToken !== token, 'rotated token differs');

    const stale = await api(baseUrl, `/api/public/qr/session?token=${encodeURIComponent(token)}`);
    assertEqual(stale.status, 401, 'old token revoked after rotate');

    const audit = db
      .prepare(
        `SELECT action FROM audit_logs WHERE action = 'table.qr_token_rotated' ORDER BY id DESC LIMIT 1`,
      )
      .get() as { action: string } | undefined;
    assert(!!audit, 'qr rotate audit written');

    const orderAudit = db
      .prepare(
        `SELECT metadata_json FROM audit_logs
         WHERE action = 'order.created' AND entity_id = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(String(orderId)) as { metadata_json: string } | undefined;
    assert(!!orderAudit, 'order.created audit present');
    const meta = JSON.parse(orderAudit!.metadata_json || '{}');
    assertEqual(meta.source, 'qr_guest', 'audit source qr_guest');
    assertEqual(meta.pay_at_counter, true, 'audit pay_at_counter');

    const page = fs.readFileSync(path.join(__dirname, '../frontend/src/app/qr/page.tsx'), 'utf8');
    assert(page.includes('pay at the counter') || page.includes('Pay at counter'), 'guest UI pay-at-counter');
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(en.includes('tables.qrTitle'), 'en QR i18n');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('\nR10 COMPLETE — Online / QR Ordering scenarios passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
