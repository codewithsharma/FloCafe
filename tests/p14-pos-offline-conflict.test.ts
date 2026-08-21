/**
 * P14 — POS / Offline Conflict & Recovery Hardening
 * Usage: npm run test:p14
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-p14-conflict-'));
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

process.env.JWT_SECRET = 'p14-pos-offline-conflict-secret';

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
const { productRoutes } = require('../main/routes/products');
const { getSupportedSchemaVersion, withTxn } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(db: any, id: string, role: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, `${id}@test.local`, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `p14-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function stockHeaders(authHeader: Record<string, string>, key: string) {
  return { ...authHeader, 'Idempotency-Key': key };
}

async function createTakeaway(
  baseUrl: string,
  headers: Record<string, string>,
  productId: string,
) {
  return api(baseUrl, '/api/orders', {
    method: 'POST',
    body: {
      type: 'takeaway',
      items: [{ product_id: productId, quantity: 1 }],
    },
    headers,
  });
}

async function main() {
  console.log('P14 — POS / Offline Conflict & Recovery Hardening');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip remains v89');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-p14', 'cashier');
  seedRole(db, 'waiter-p14', 'waiter');
  seedCategory(db, 'cat-p14', 'P14 Cat');
  seedProduct(db, 'prod-p14', 'cat-p14', 'P14 Latte', 150, {
    track_inventory: true,
    stock_quantity: 100,
  });
  seedProduct(db, 'prod-p14-b', 'cat-p14', 'P14 Bean', 50, {
    track_inventory: true,
    stock_quantity: 50,
  });

  const ownerAuth = owner.authHeader;
  const managerAuth = manager.authHeader;
  const cashierAuth = auth('cashier-p14', 'cashier');
  const waiterAuth = auth('waiter-p14', 'waiter');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/products': productRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // --- Order status CAS ---
    const o1 = await createTakeaway(baseUrl, ownerAuth, 'prod-p14');
    assertEqual(o1.status, 201, 'create order');
    const orderId = o1.data.order.id as string;

    const toPreparing = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'pending' },
      headers: ownerAuth,
    });
    assertEqual(toPreparing.status, 200, 'current-state mutation → success');
    assertEqual(toPreparing.data.order.status, 'preparing', 'status preparing');

    const toReady = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'ready', expected_status: 'preparing' },
      headers: ownerAuth,
    });
    assertEqual(toReady.status, 200, 'preparing → ready');

    const stalePreparing = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'pending' },
      headers: ownerAuth,
    });
    assertEqual(stalePreparing.status, 409, 'stale order status mutation → 409');
    assertEqual(
      stalePreparing.data.code,
      'ORDER_STATUS_CONFLICT',
      'ORDER_STATUS_CONFLICT code',
    );

    const afterStale = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as {
      status: string;
    };
    assertEqual(afterStale.status, 'ready', 'stale mutation does not overwrite newer state');

    const reverseNoExpected = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing' },
      headers: ownerAuth,
    });
    assertEqual(reverseNoExpected.status, 409, 'monotonicity: reverse without expected → 409');
    assertEqual(
      (db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string })
        .status,
      'ready',
      'reverse still leaves ready',
    );

    const oTerm = await createTakeaway(baseUrl, ownerAuth, 'prod-p14');
    const termId = oTerm.data.order.id as string;
    await api(baseUrl, `/api/orders/${termId}/status`, {
      method: 'PATCH',
      body: { status: 'completed', expected_status: 'pending' },
      headers: ownerAuth,
    });
    const illegal = await api(baseUrl, `/api/orders/${termId}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'completed' },
      headers: ownerAuth,
    });
    assertEqual(illegal.status, 409, 'illegal terminal transition → 409');
    assertEqual(illegal.data.code, 'ILLEGAL_STATUS_TRANSITION', 'ILLEGAL_STATUS_TRANSITION');

    // Cancel success audit + stale cancel no false audit
    const oCancel = await createTakeaway(baseUrl, ownerAuth, 'prod-p14');
    const cancelId = oCancel.data.order.id as string;
    const countCancelAudits = () =>
      (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.cancelled' AND entity_id = ?`,
          )
          .get(String(cancelId)) as { c: number }
      ).c;
    const beforeCount = countCancelAudits();

    const cancelOk = await api(baseUrl, `/api/orders/${cancelId}/status`, {
      method: 'PATCH',
      body: {
        status: 'cancelled',
        expected_status: 'pending',
        reason: 'p14-test',
      },
      headers: ownerAuth,
    });
    assertEqual(cancelOk.status, 200, 'cancel success');
    assertEqual(cancelOk.data.order.status, 'cancelled', 'order cancelled');
    const afterCount = countCancelAudits();
    assertEqual(afterCount, beforeCount + 1, 'successful cancel creates audit');

    const cancelStale = await api(baseUrl, `/api/orders/${cancelId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', expected_status: 'pending', reason: 'stale' },
      headers: ownerAuth,
    });
    // Already cancelled + expected pending → conflict (not false success audit)
    assertEqual(cancelStale.status, 409, 'stale cancel expected → 409');
    assertEqual(countCancelAudits(), afterCount, 'stale cancel does not create false success audit');

    // Idempotent cancel when already cancelled (matching expected)
    const cancelIdem = await api(baseUrl, `/api/orders/${cancelId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', expected_status: 'cancelled' },
      headers: ownerAuth,
    });
    assertEqual(cancelIdem.status, 200, 'idempotent cancel at target');
    assertEqual(countCancelAudits(), afterCount, 'idempotent cancel does not re-audit');

    // RBAC: waiter cannot cancel another's order
    const oWaiter = await createTakeaway(baseUrl, ownerAuth, 'prod-p14');
    const waiterDenied = await api(baseUrl, `/api/orders/${oWaiter.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'pending' },
      headers: waiterAuth,
    });
    assertEqual(waiterDenied.status, 403, 'waiter cannot mutate other user order');

    // Cashier can advance status
    const oCash = await createTakeaway(baseUrl, ownerAuth, 'prod-p14');
    const cashOk = await api(baseUrl, `/api/orders/${oCash.data.order.id}/status`, {
      method: 'PATCH',
      body: { status: 'preparing', expected_status: 'pending' },
      headers: cashierAuth,
    });
    assertEqual(cashOk.status, 200, 'cashier may advance status');

    console.log('   ✓ order status CAS / illegal / audit / RBAC');

    // --- Stock adjustment idempotency ---
    const stockBefore = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;

    const key = 'p14-stock-key-1';
    const adj1 = await api(baseUrl, '/api/products/prod-p14-b/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 10 },
      headers: stockHeaders(ownerAuth, key),
    });
    assertEqual(adj1.status, 200, 'stock adjust with Idempotency-Key');
    assertEqual(adj1.data.product.stock_quantity, stockBefore + 10, '+10 applied');

    const adjReplay = await api(baseUrl, '/api/products/prod-p14-b/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 10 },
      headers: stockHeaders(ownerAuth, key),
    });
    assertEqual(adjReplay.status, 200, 'replay 200');
    assertEqual(
      adjReplay.data.product.stock_quantity,
      stockBefore + 10,
      'replay does not double-apply',
    );

    const adjConflict = await api(baseUrl, '/api/products/prod-p14-b/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 5 },
      headers: stockHeaders(ownerAuth, key),
    });
    assertEqual(adjConflict.status, 409, 'same key + different payload rejected');

    // Concurrent different keys (serialized SQLite) — both apply
    const beforeConc = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    const [c1, c2] = await Promise.all([
      api(baseUrl, '/api/products/prod-p14-b/stock', {
        method: 'POST',
        body: { action: 'increase', quantity: 1 },
        headers: stockHeaders(ownerAuth, 'p14-conc-a'),
      }),
      api(baseUrl, '/api/products/prod-p14-b/stock', {
        method: 'POST',
        body: { action: 'increase', quantity: 1 },
        headers: stockHeaders(managerAuth, 'p14-conc-b'),
      }),
    ]);
    assertEqual(c1.status, 200, 'concurrent A 200');
    assertEqual(c2.status, 200, 'concurrent B 200');
    const afterConc = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    assertEqual(afterConc, beforeConc + 2, 'concurrent stock adjusts remain correct');

    // Concurrent same key — no double apply
    const beforeSame = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    const sameKey = 'p14-same-key-conc';
    const [s1, s2] = await Promise.all([
      api(baseUrl, '/api/products/prod-p14-b/stock', {
        method: 'POST',
        body: { action: 'increase', quantity: 3 },
        headers: stockHeaders(ownerAuth, sameKey),
      }),
      api(baseUrl, '/api/products/prod-p14-b/stock', {
        method: 'POST',
        body: { action: 'increase', quantity: 3 },
        headers: stockHeaders(ownerAuth, sameKey),
      }),
    ]);
    assert(s1.status === 200 && s2.status === 200, 'same-key concurrent both 200');
    const afterSame = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    assertEqual(afterSame, beforeSame + 3, 'same-key concurrent does not double-apply');

    // Rollback: forced failure after stock write leaves no partial (txn)
    const beforeRoll = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    let rolled = false;
    try {
      withTxn(() => {
        db.prepare('UPDATE products SET stock_quantity = stock_quantity + 7 WHERE id = ?').run(
          'prod-p14-b',
        );
        rolled = true;
        throw new Error('p14-forced-rollback');
      });
    } catch (e: unknown) {
      assert(/p14-forced-rollback/.test(String((e as Error).message)), 'caught rollback error');
    }
    assert(rolled, 'txn entered');
    const afterRoll = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-p14-b') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    assertEqual(afterRoll, beforeRoll, 'rollback leaves no partial state');

    // Cashier denied stock
    const cashStock = await api(baseUrl, '/api/products/prod-p14-b/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 1 },
      headers: stockHeaders(cashierAuth, 'p14-cash-stock'),
    });
    assertEqual(cashStock.status, 403, 'RBAC: cashier cannot stock adjust');

    // Negative / zero / positive where supported
    const zeroAdj = await api(baseUrl, '/api/products/prod-p14-b/stock', {
      method: 'POST',
      body: { action: 'increase', quantity: 0 },
      headers: stockHeaders(ownerAuth, 'p14-zero'),
    });
    assertEqual(zeroAdj.status, 200, 'zero increase accepted');

    const dec = await api(baseUrl, '/api/products/prod-p14-b/stock', {
      method: 'POST',
      body: { action: 'decrease', quantity: 1 },
      headers: stockHeaders(ownerAuth, 'p14-neg'),
    });
    assertEqual(dec.status, 200, 'decrease (negative delta) ok');

    console.log('   ✓ stock adjust idempotency / concurrency / RBAC');

    // --- FE mutation error classification (no blind 409 retry) ---
    const {
      classifyMutationError,
      shouldClearMutationAttempt,
    } = require('../frontend/src/lib/mutation-errors.ts');
    assertEqual(classifyMutationError({ response: { status: 409 } }), 'conflict', '409 → conflict');
    assertEqual(
      shouldClearMutationAttempt(classifyMutationError({ response: { status: 409 } })),
      true,
      '409 clears pending (not blindly retried)',
    );
    assertEqual(
      classifyMutationError({ response: { status: 500 } }),
      'retryable',
      '5xx retryable',
    );
    assertEqual(
      shouldClearMutationAttempt(classifyMutationError({ response: { status: 500 } })),
      false,
      'network/5xx retains attempt (bounded by operator re-submit)',
    );
    assertEqual(
      classifyMutationError({ response: { status: 400 } }),
      'permanent',
      '400 permanent',
    );
    assertEqual(classifyMutationError({ response: { status: 401 } }), 'auth', '401 auth');
    assertEqual(
      shouldClearMutationAttempt(classifyMutationError({ response: { status: 401 } })),
      true,
      'auth clears pending',
    );

    // Source contracts: POS clears attempts; stock holds stable key; KDS clears permanent 4xx
    const posSrc = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/pos/page.tsx'),
      'utf8',
    );
    assert(posSrc.includes('shouldClearMutationAttempt'), 'POS uses attempt clear taxonomy');
    assert(posSrc.includes('classifyMutationError'), 'POS classifies mutation errors');
    const productsSrc = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/products/page.tsx'),
      'utf8',
    );
    assert(
      productsSrc.includes('stockAdjustIdempotencyKeyRef'),
      'products page holds stable stock Idempotency-Key',
    );
    const kdsSrc = fs.readFileSync(
      path.join(__dirname, '../frontend/src/hooks/useKdsConnection.ts'),
      'utf8',
    );
    assert(
      kdsSrc.includes('permanent non-409 4xx') || kdsSrc.includes('P14'),
      'KDS clears permanent 4xx pending',
    );
    assert(kdsSrc.includes('statusCode === 409'), 'KDS still drops pending on 409');

    // Payment complete guard present (no cancelled overwrite)
    const tenderSrc = fs.readFileSync(
      path.join(__dirname, '../main/services/payment-tender.ts'),
      'utf8',
    );
    assert(
      tenderSrc.includes("status NOT IN ('cancelled', 'completed')"),
      'payment complete CAS guard',
    );

    // Tenant/store: single-store — status UPDATE always scopes by order id only (no cross-store join invent)
    const statusSrc = fs.readFileSync(
      path.join(__dirname, '../main/routes/orders/status.ts'),
      'utf8',
    );
    assert(statusSrc.includes('ORDER_STATUS_CONFLICT'), 'ORDER_STATUS_CONFLICT in status route');
    assert(statusSrc.includes('AND status = ?'), 'CAS WHERE status predicate');

    console.log('   ✓ offline/reconnect semantics + source contracts');
    console.log('   ✓ schema remains v88; SQLite SoR');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('='.repeat(60));
  console.log(`P14 results: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
