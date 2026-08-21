/**
 * P18 — ORD-IDEM-HARDENING (Order Create Idempotency Hardening)
 * Usage: npm run test:p18
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-p18-idem-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (s: string) => Buffer.from(s, 'utf8'),
        decryptString: (b: Buffer) => b.toString('utf8'),
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'p18-order-idempotency-hardening-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
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
const { productRoutes } = require('../main/routes/products');
const { getSupportedSchemaVersion, getDatabase } = require('../main/db');
const { createRecipe } = require('../main/services/recipe');

function stockOf(db: any, productId: string): number {
  return Number(
    (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as {
        stock_quantity: number;
      }
    ).stock_quantity,
  );
}

function countOrders(db: any): number {
  return (db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number }).c;
}

function countAudit(db: any, action: string): number {
  return (
    db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action = ?`).get(action) as {
      c: number;
    }
  ).c;
}

async function main() {
  console.log('P18 — ORD-IDEM-HARDENING');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip remains v88');

  const owner = seedOwnerUser(db);
  const ownerAuth = owner.authHeader;
  seedCategory(db, 'cat-p18', 'P18 Cat');
  seedProduct(db, 'menu-p18', 'cat-p18', 'P18 Latte', 200, {
    track_inventory: true,
    stock_quantity: 50,
  });
  seedProduct(db, 'ing-p18', 'cat-p18', 'P18 Milk', 0, {
    track_inventory: true,
    stock_quantity: 100,
  });
  db.prepare(`UPDATE products SET inventory_unit = 'pcs', cost = 1, cost_cents = 100 WHERE id = ?`).run(
    'ing-p18',
  );
  createRecipe({
    productId: 'menu-p18',
    name: 'P18 Latte BOM',
    yieldQty: 1,
    actorUserId: owner.userId,
    ingredients: [{ ingredient_product_id: 'ing-p18', quantity: 1, unit: 'pcs', position: 0 }],
  });

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/products': productRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // ── Missing / empty / invalid key ─────────────────────────────────────
    const missing = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': '' },
    });
    assertEqual(missing.status, 400, 'missing key → 400');
    assertEqual(missing.data.code, 'ORDER_IDEMPOTENCY_REQUIRED', 'ORDER_IDEMPOTENCY_REQUIRED');

    const invalid = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': 'bad key with spaces' },
    });
    assertEqual(invalid.status, 400, 'invalid key → 400');
    assertEqual(invalid.data.code, 'ORDER_IDEMPOTENCY_INVALID', 'ORDER_IDEMPOTENCY_INVALID');
    console.log('   ✓ key validation');

    // ── Create + replay ───────────────────────────────────────────────────
    const stockMenuBefore = stockOf(db, 'menu-p18');
    const stockIngBefore = stockOf(db, 'ing-p18');
    const ordersBefore = countOrders(db);
    const auditsBefore = countAudit(db, 'order.created');
    const key1 = 'p18-create-stable-1';

    const first = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': key1 },
    });
    assertEqual(first.status, 201, 'first create 201');
    const orderId = first.data.order.id;
    assert(orderId, 'order id present');
    assertEqual(stockOf(db, 'menu-p18'), stockMenuBefore - 1, 'menu stock once');
    assertEqual(stockOf(db, 'ing-p18'), stockIngBefore - 1, 'recipe stock once');
    assertEqual(countOrders(db), ordersBefore + 1, 'one order');
    assertEqual(countAudit(db, 'order.created'), auditsBefore + 1, 'one create audit');

    const replay = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': key1 },
    });
    assertEqual(replay.status, 200, 'replay 200');
    assertEqual(replay.data.order.id, orderId, 'same order id');
    assertEqual(stockOf(db, 'menu-p18'), stockMenuBefore - 1, 'no double menu stock');
    assertEqual(stockOf(db, 'ing-p18'), stockIngBefore - 1, 'no double recipe stock');
    assertEqual(countOrders(db), ordersBefore + 1, 'still one order');
    assertEqual(countAudit(db, 'order.created'), auditsBefore + 1, 'no duplicate audit');
    console.log('   ✓ create replay + inventory/recipe once');

    // ── Same key + different payload → 409 ────────────────────────────────
    const conflict = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 2 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': key1 },
    });
    assertEqual(conflict.status, 409, 'different payload → 409');
    assertEqual(conflict.data.code, 'ORDER_IDEMPOTENCY_CONFLICT', 'ORDER_IDEMPOTENCY_CONFLICT');
    assertEqual(countOrders(db), ordersBefore + 1, 'conflict creates no order');
    assertEqual(stockOf(db, 'menu-p18'), stockMenuBefore - 1, 'conflict no stock change');
    console.log('   ✓ same key different request conflicts');

    // ── Canonical fingerprint (key order) ─────────────────────────────────
    const keyCanon = 'p18-create-canon-1';
    const a = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': keyCanon },
    });
    assertEqual(a.status, 201, 'canon first');
    const b = await api(baseUrl, '/api/orders', {
      method: 'POST',
      // Same semantic fields; different object key order in items object
      body: { items: [{ quantity: 1, product_id: 'menu-p18' }], type: 'takeaway' },
      headers: { ...ownerAuth, 'Idempotency-Key': keyCanon },
    });
    assertEqual(b.status, 200, 'canon replay despite key order');
    assertEqual(b.data.order.id, a.data.order.id, 'canon same order');
    console.log('   ✓ canonical fingerprint');

    // ── Different keys → different orders ─────────────────────────────────
    const d1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': 'p18-diff-a' },
    });
    const d2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': 'p18-diff-b' },
    });
    assertEqual(d1.status, 201, 'diff key a');
    assertEqual(d2.status, 201, 'diff key b');
    assert(d1.data.order.id !== d2.data.order.id, 'different keys → different orders');
    console.log('   ✓ different keys are separate operations');

    // ── Concurrent same key + same payload ────────────────────────────────
    const stockConcBefore = stockOf(db, 'menu-p18');
    const ordersConcBefore = countOrders(db);
    const concKey = 'p18-concurrent-1';
    const body = { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] };
    const [c1, c2] = await Promise.all([
      api(baseUrl, '/api/orders', {
        method: 'POST',
        body,
        headers: { ...ownerAuth, 'Idempotency-Key': concKey },
      }),
      api(baseUrl, '/api/orders', {
        method: 'POST',
        body,
        headers: { ...ownerAuth, 'Idempotency-Key': concKey },
      }),
    ]);
    const statuses = [c1.status, c2.status].sort();
    assert(
      (statuses[0] === 200 && statuses[1] === 201) || (statuses[0] === 201 && statuses[1] === 201),
      `concurrent statuses ok (${statuses.join(',')})`,
    );
    // If both 201, they must share the same order id (true replay race won by UNIQUE)
    const ids = [c1.data.order?.id, c2.data.order?.id].filter(Boolean);
    assertEqual(new Set(ids).size, 1, 'concurrent → one order id');
    assertEqual(countOrders(db), ordersConcBefore + 1, 'concurrent → one order row');
    assertEqual(stockOf(db, 'menu-p18'), stockConcBefore - 1, 'concurrent → one stock delta');
    console.log('   ✓ concurrent same-key single mutation');

    // ── Add-items requires key ────────────────────────────────────────────
    const baseOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': 'p18-add-base' },
    });
    assertEqual(baseOrder.status, 201, 'base for add-items');
    const oid = baseOrder.data.order.id;
    const stockAddBefore = stockOf(db, 'menu-p18');

    const addMissing = await api(baseUrl, `/api/orders/${oid}/items`, {
      method: 'POST',
      body: { items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': '' },
    });
    assertEqual(addMissing.status, 400, 'add-items missing key → 400');
    assertEqual(addMissing.data.code, 'ORDER_IDEMPOTENCY_REQUIRED', 'add-items REQUIRED code');

    const addKey = 'p18-add-items-1';
    const add1 = await api(baseUrl, `/api/orders/${oid}/items`, {
      method: 'POST',
      body: { items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': addKey },
    });
    assertEqual(add1.status, 200, 'add-items ok');
    assertEqual(stockOf(db, 'menu-p18'), stockAddBefore - 1, 'add-items stock once');

    const addReplay = await api(baseUrl, `/api/orders/${oid}/items`, {
      method: 'POST',
      body: { items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': addKey },
    });
    assertEqual(addReplay.status, 200, 'add-items replay');
    assertEqual(stockOf(db, 'menu-p18'), stockAddBefore - 1, 'add-items no double stock');

    const addConflict = await api(baseUrl, `/api/orders/${oid}/items`, {
      method: 'POST',
      body: { items: [{ product_id: 'menu-p18', quantity: 3 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': addKey },
    });
    assertEqual(addConflict.status, 409, 'add-items conflict');
    assertEqual(addConflict.data.code, 'ORDER_IDEMPOTENCY_CONFLICT', 'add-items CONFLICT code');
    console.log('   ✓ add-items key required + replay + conflict');

    // ── Stock failure does not poison key ─────────────────────────────────
    db.prepare(`UPDATE products SET stock_quantity = 0, updated_at = ? WHERE id = ?`).run(
      now(),
      'menu-p18',
    );
    const failKey = 'p18-fail-then-retry';
    const failRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': failKey },
    });
    assert(
      failRes.status === 400 || failRes.status === 409,
      `stock fail status (${failRes.status})`,
    );
    const storedFail = db
      .prepare(
        `SELECT COUNT(*) as c FROM order_idempotency WHERE idempotency_key = ? AND user_id = ?`,
      )
      .get(failKey, owner.userId) as { c: number };
    assertEqual(storedFail.c, 0, 'failed create does not store idempotency success');

    db.prepare(`UPDATE products SET stock_quantity = 10, updated_at = ? WHERE id = ?`).run(
      now(),
      'menu-p18',
    );
    // Recipe ingredient may also be zeroed indirectly — ensure enough
    db.prepare(`UPDATE products SET stock_quantity = 10, updated_at = ? WHERE id = ?`).run(
      now(),
      'ing-p18',
    );
    const retryOk = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': failKey },
    });
    assertEqual(retryOk.status, 201, 'same key succeeds after prior failure');
    console.log('   ✓ failure does not poison key');

    // ── Cross-user: same key string does not replay other user ────────────
    const { seedManagerUser } = require('./helpers/test-setup');
    const manager = seedManagerUser(db);
    const crossKey = 'p18-cross-user-key';
    const ownerOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...ownerAuth, 'Idempotency-Key': crossKey },
    });
    assertEqual(ownerOrder.status, 201, 'owner create');
    const mgrOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'menu-p18', quantity: 1 }] },
      headers: { ...manager.authHeader, 'Idempotency-Key': crossKey },
    });
    assertEqual(mgrOrder.status, 201, 'manager same key string → own order');
    assert(mgrOrder.data.order.id !== ownerOrder.data.order.id, 'keys are user-scoped');
    console.log('   ✓ user-scoped keys');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('='.repeat(60));
  console.log(`P18 results: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) {
    for (const f of results.failures) console.error('FAIL:', f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
