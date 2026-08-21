/**
 * R11 — Marketing thin slice: coupon codes via order discount path.
 * Usage: npm run test:r11
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r11-coupons-'));
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

process.env.JWT_SECRET = 'r11-coupons-secret';

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
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { couponRoutes } = require('../main/routes/coupons');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `r11-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function seedCashier(db: any): string {
  const id = 'cashier-r11';
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, 'Cashier', 'cashier-r11@test.local', ?, 'cashier', 1, ?, ?)`,
  ).run(id, bcrypt.hashSync('Pass1234!', 10), now(), now());
  return id;
}

async function createUnpaidOrder(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
): Promise<string> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 2 }] },
    headers: authHeader,
  });
  assertEqual(order.status, 201, 'order created');
  return String(order.data.order.id);
}

async function payOrder(
  baseUrl: string,
  authHeader: Record<string, string>,
  orderId: string,
): Promise<void> {
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: orderId },
    headers: authHeader,
  });
  assertEqual(bill.status, 201, 'bill generated');
  const billId = bill.data.bill.id;
  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount: bill.data.bill.total },
    headers: { ...authHeader, 'Idempotency-Key': `r11-pay-${billId}` },
  });
  assertEqual(pay.status, 200, 'bill paid');
}

async function main(): Promise<void> {
  console.log('\nR11 — Coupon codes (marketing thin slice)');
  console.log('='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 87, 'schema tip is v87');
  initTestDb();
  const db = getDatabase();
  assertEqual(Number(db.pragma('user_version', { simple: true })), 87, 'fresh DB tip 87');

  const cols = (
    db.prepare(`PRAGMA table_info(coupons)`).all() as { name: string }[]
  ).map((c) => c.name);
  for (const col of [
    'id',
    'code',
    'percent_off',
    'amount_cents',
    'active',
    'max_uses',
    'uses_count',
    'created_at',
  ]) {
    assert(cols.includes(col), `coupons.${col} column exists`);
  }

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashierId = seedCashier(db);
  seedCategory(db, 'cat-r11', 'R11 Cat');
  seedProduct(db, 'prod-r11', 'cat-r11', 'R11 Latte', 100);
  const productId = 'prod-r11';

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_requires_approval', 'false', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/coupons': couponRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\nR11-CRUD-01 owner create percent coupon');
    const createPct = await api(baseUrl, '/api/coupons', {
      method: 'POST',
      body: { code: 'SAVE10', percent_off: 10, max_uses: 2 },
      headers: owner.authHeader,
    });
    assertEqual(createPct.status, 201, 'owner creates percent coupon');
    assertEqual(createPct.data.coupon.code, 'SAVE10', 'code normalized');
    assertEqual(createPct.data.coupon.percent_off, 10, 'percent_off set');
    assertEqual(createPct.data.coupon.amount_cents, null, 'amount_cents null for percent');
    assertEqual(createPct.data.coupon.active, true, 'active by default');
    const couponId = createPct.data.coupon.id as string;

    console.log('\nR11-CRUD-02 list + cashier denied create');
    const list = await api(baseUrl, '/api/coupons', { headers: manager.authHeader });
    assertEqual(list.status, 200, 'manager can list coupons');
    assert(
      Array.isArray(list.data.coupons) && list.data.coupons.some((c: any) => c.id === couponId),
      'created coupon listed',
    );

    const cashierCreate = await api(baseUrl, '/api/coupons', {
      method: 'POST',
      body: { code: 'HACK99', percent_off: 99 },
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(cashierCreate.status, 403, 'cashier cannot create coupons');

    console.log('\nR11-CRUD-03 fixed amount coupon');
    const createAmt = await api(baseUrl, '/api/coupons', {
      method: 'POST',
      body: { code: 'FLAT500', amount_cents: 500 },
      headers: manager.authHeader,
    });
    assertEqual(createAmt.status, 201, 'manager creates amount coupon');
    assertEqual(createAmt.data.coupon.amount_cents, 500, 'amount_cents set');
    assertEqual(createAmt.data.coupon.percent_off, null, 'percent_off null for amount');

    const both = await api(baseUrl, '/api/coupons', {
      method: 'POST',
      body: { code: 'BAD', percent_off: 10, amount_cents: 100 },
      headers: owner.authHeader,
    });
    assertEqual(both.status, 400, 'reject both percent and amount');

    const neither = await api(baseUrl, '/api/coupons', {
      method: 'POST',
      body: { code: 'EMPTY' },
      headers: owner.authHeader,
    });
    assertEqual(neither.status, 400, 'reject missing discount model');

    console.log('\nR11-APPLY-01 cashier applies percent coupon');
    const orderId = await createUnpaidOrder(baseUrl, owner.authHeader, productId);
    const apply = await api(baseUrl, `/api/orders/${orderId}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: {
        ...auth(cashierId, 'cashier'),
        'Idempotency-Key': `r11-apply-${orderId}`,
      },
    });
    assertEqual(apply.status, 200, 'cashier can apply coupon');
    assert(Number(apply.data.order.discount_amount) > 0, 'discount applied to order');
    assertEqual(apply.data.order.discount_type, 'percentage', 'discount_type percentage');
    assertEqual(Number(apply.data.order.discount_value), 10, 'discount_value 10');

    const uses = db.prepare('SELECT uses_count FROM coupons WHERE id = ?').get(couponId) as {
      uses_count: number;
    };
    assertEqual(uses.uses_count, 1, 'uses_count incremented');

    const audit = db
      .prepare(
        `SELECT metadata_json, reason FROM audit_logs
         WHERE action = 'order.discount_applied' AND entity_id = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(orderId) as { metadata_json: string; reason: string | null } | undefined;
    assert(!!audit, 'discount audit written');
    const meta = JSON.parse(audit!.metadata_json || '{}');
    assertEqual(meta.coupon_code, 'SAVE10', 'audit includes coupon_code');
    assert(
      String(audit!.reason || '').includes('SAVE10') || String(meta.coupon_code) === 'SAVE10',
      'audit reason or metadata references coupon',
    );

    console.log('\nR11-APPLY-02 idempotent replay');
    const replay = await api(baseUrl, `/api/orders/${orderId}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: {
        ...auth(cashierId, 'cashier'),
        'Idempotency-Key': `r11-apply-${orderId}`,
      },
    });
    assertEqual(replay.status, 200, 'idempotent replay 200');
    assertEqual(replay.data.idempotent_replay, true, 'idempotent_replay flag');
    const uses2 = db.prepare('SELECT uses_count FROM coupons WHERE id = ?').get(couponId) as {
      uses_count: number;
    };
    assertEqual(uses2.uses_count, 1, 'uses_count unchanged on replay');

    console.log('\nR11-APPLY-03 post-tender blocked');
    const paidOrder = await createUnpaidOrder(baseUrl, owner.authHeader, productId);
    await payOrder(baseUrl, owner.authHeader, paidOrder);
    const afterPay = await api(baseUrl, `/api/orders/${paidOrder}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: owner.authHeader,
    });
    assertEqual(afterPay.status, 409, 'post-tender apply returns 409');
    assertEqual(afterPay.data.code, 'ORDER_HAS_SUCCESSFUL_TENDER', 'tender conflict code');

    console.log('\nR11-APPLY-04 max_uses enforced');
    const order2 = await createUnpaidOrder(baseUrl, owner.authHeader, productId);
    const apply2 = await api(baseUrl, `/api/orders/${order2}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: manager.authHeader,
    });
    assertEqual(apply2.status, 200, 'second use within max_uses');
    const order3 = await createUnpaidOrder(baseUrl, owner.authHeader, productId);
    const apply3 = await api(baseUrl, `/api/orders/${order3}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: manager.authHeader,
    });
    assertEqual(apply3.status, 409, 'third use exceeds max_uses');

    console.log('\nR11-CRUD-04 deactivate');
    const deact = await api(baseUrl, `/api/coupons/${couponId}/deactivate`, {
      method: 'POST',
      body: {},
      headers: owner.authHeader,
    });
    assertEqual(deact.status, 200, 'deactivate ok');
    assertEqual(deact.data.coupon.active, false, 'coupon inactive');

    const order4 = await createUnpaidOrder(baseUrl, owner.authHeader, productId);
    const inactiveApply = await api(baseUrl, `/api/orders/${order4}/apply-coupon`, {
      method: 'POST',
      body: { code: 'SAVE10' },
      headers: owner.authHeader,
    });
    assertEqual(inactiveApply.status, 404, 'inactive coupon not applicable');

    const cashierDeact = await api(baseUrl, `/api/coupons/${createAmt.data.coupon.id}/deactivate`, {
      method: 'POST',
      body: {},
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(cashierDeact.status, 403, 'cashier cannot deactivate');

    console.log('\nR11-APPLY-05 fixed amount coupon');
    const order5 = await createUnpaidOrder(baseUrl, owner.authHeader, productId);
    const applyAmt = await api(baseUrl, `/api/orders/${order5}/apply-coupon`, {
      method: 'POST',
      body: { code: 'FLAT500' },
      headers: owner.authHeader,
    });
    assertEqual(applyAmt.status, 200, 'amount coupon applied');
    assertEqual(applyAmt.data.order.discount_type, 'amount', 'amount discount type');
    assertEqual(Number(applyAmt.data.order.discount_value), 5, 'amount major units from cents');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`R11 results: ${results.passed}/${results.total} passed, ${results.failed} failed`);
  if (results.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
