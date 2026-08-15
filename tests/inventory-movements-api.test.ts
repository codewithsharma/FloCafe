/**
 * Phase 2.12 — Inventory movement history HTTP boundary.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/inventory-movements-api.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-inv-api-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory,
  api, assert, assertEqual, getResults, closeDatabase, now,
} = require('./helpers/test-setup');

const { registerRoutes } = require('../main/routes/index');
const { getJWTSecret } = require('../main/routes/auth');
const { applyAbsoluteStockChange } = require('../main/services/inventory');
const { withTxn } = require('../main/db');

function seedRoleUser(db: any, id: string, role: string) {
  const email = `${id}@test.local`;
  db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, id, email, bcrypt.hashSync('testpass123', 10), role, 1, now(), now());
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('Phase 2.12 Inventory Movements API');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  const cashier = seedRoleUser(db, 'cashier-inv-api', 'cashier');
  seedCategory(db, 'cat-inv-api', 'Inv API');

  const create = await (async () => {
    const app = createApp({});
    registerRoutes(app);
    return startServer(app);
  })();
  const { baseUrl, server } = create;

  try {
    // Seed product via API then movements via Inventory
    const prod = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'API Latte',
        price: 100,
        category_id: 'cat-inv-api',
        track_inventory: true,
        stock_quantity: 10,
      },
      headers: ownerAuth,
    });
    assertEqual(prod.status, 201, 'product create 201');
    const productId = prod.data.product.id;

    withTxn(() => {
      applyAbsoluteStockChange(db, productId, 8, {
        referenceType: 'product_update',
        reason: 'product_update',
      });
      applyAbsoluteStockChange(db, productId, 15, {
        referenceType: 'manual',
        reason: 'increase',
      });
    });

    console.log('\n1. Router ownership');
    const invPath = path.join(__dirname, '../main/routes/inventory.ts');
    assert(fs.existsSync(invPath), 'inventory.ts exists');
    const indexSrc = fs.readFileSync(path.join(__dirname, '../main/routes/index.ts'), 'utf8');
    assert(
      /app\.use\(\s*['"]\/api\/inventory['"]/.test(indexSrc) ||
        /mount\(\s*['"]\/api\/inventory['"]/.test(indexSrc),
      'index mounts inventory',
    );
    assert(!/app\.get\(\s*['"]\/api\/inventory\/movements['"]/.test(indexSrc), 'no inline handler');

    console.log('\n2. Owner can read');
    const ownerList = await api(
      baseUrl,
      `/api/inventory/movements?product_id=${encodeURIComponent(productId)}`,
      { headers: ownerAuth },
    );
    assertEqual(ownerList.status, 200, 'owner 200');
    assert(Array.isArray(ownerList.data.movements), 'movements array');
    assert(ownerList.data.movements.length >= 3, 'at least opening+2');

    console.log('\n3. Manager can read');
    assertEqual(
      (await api(
        baseUrl,
        `/api/inventory/movements?product_id=${encodeURIComponent(productId)}`,
        { headers: managerAuth },
      )).status,
      200,
      'manager 200',
    );

    console.log('\n4. Cashier rejected');
    assertEqual(
      (await api(
        baseUrl,
        `/api/inventory/movements?product_id=${encodeURIComponent(productId)}`,
        { headers: cashier.authHeader },
      )).status,
      403,
      'cashier 403',
    );

    console.log('\n5. Unauthenticated rejected');
    assertEqual(
      (await api(baseUrl, `/api/inventory/movements?product_id=${encodeURIComponent(productId)}`)).status,
      401,
      'unauth 401',
    );

    console.log('\n6. Unknown product 404');
    assertEqual(
      (await api(baseUrl, '/api/inventory/movements?product_id=missing-prod', { headers: ownerAuth })).status,
      404,
      'missing 404',
    );

    console.log('\n7. Empty history');
    const emptyProd = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Zero Hist',
        price: 1,
        category_id: 'cat-inv-api',
        track_inventory: true,
        stock_quantity: 0,
      },
      headers: ownerAuth,
    });
    const emptyId = emptyProd.data.product.id;
    const empty = await api(
      baseUrl,
      `/api/inventory/movements?product_id=${encodeURIComponent(emptyId)}`,
      { headers: ownerAuth },
    );
    assertEqual(empty.status, 200, 'empty 200');
    assertEqual(empty.data.movements.length, 0, 'empty array');
    assertEqual(Object.prototype.hasOwnProperty.call(empty.data, 'nextCursor'), false, 'no nextCursor');

    console.log('\n8. Ordering deterministic newest first');
    const ids = ownerList.data.movements.map((m: any) => m.id);
    for (let i = 1; i < ids.length; i++) {
      assert(ids[i - 1] > ids[i], `id[${i - 1}] > id[${i}]`);
    }

    console.log('\n9. Limit enforced');
    const lim = await api(
      baseUrl,
      `/api/inventory/movements?product_id=${encodeURIComponent(productId)}&limit=2`,
      { headers: ownerAuth },
    );
    assertEqual(lim.status, 200, 'limit 200');
    assertEqual(lim.data.movements.length, 2, 'two rows');
    assert(typeof lim.data.nextCursor === 'number', 'nextCursor number');

    console.log('\n10. Cursor pagination');
    const page2 = await api(
      baseUrl,
      `/api/inventory/movements?product_id=${encodeURIComponent(productId)}&limit=2&before_id=${lim.data.nextCursor}`,
      { headers: ownerAuth },
    );
    assertEqual(page2.status, 200, 'page2 200');
    assert(page2.data.movements.length >= 1, 'page2 has rows');
    assert(
      page2.data.movements.every((m: any) => m.id < lim.data.nextCursor),
      'page2 before cursor',
    );

    console.log('\n11. Field stability');
    const row = ownerList.data.movements[0];
    for (const key of [
      'id', 'product_id', 'quantity_delta', 'movement_type',
      'reference_type', 'reference_id', 'reason', 'stock_after', 'created_at',
    ]) {
      assert(Object.prototype.hasOwnProperty.call(row, key), `field ${key}`);
    }
    assertEqual(row.product_id, productId, 'product isolation');

    console.log('\n12. Malformed params');
    assertEqual(
      (await api(baseUrl, '/api/inventory/movements', { headers: ownerAuth })).status,
      400,
      'missing product_id 400',
    );
    assertEqual(
      (await api(
        baseUrl,
        `/api/inventory/movements?product_id=${encodeURIComponent(productId)}&before_id=abc`,
        { headers: ownerAuth },
      )).status,
      400,
      'bad before_id 400',
    );

    console.log('\n13. Read-only — no write methods on movements');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await (globalThis as any).fetch(`${baseUrl}/api/inventory/movements`, {
        method,
        headers: { 'Content-Type': 'application/json', ...ownerAuth },
        body: JSON.stringify({ product_id: productId }),
      });
      assert(
        response.status === 404 || response.status === 405,
        `${method} not allowed (${response.status})`,
      );
    }

    console.log('\n14. Max limit clamp does not 500');
    const maxed = await api(
      baseUrl,
      `/api/inventory/movements?product_id=${encodeURIComponent(productId)}&limit=9999`,
      { headers: ownerAuth },
    );
    assertEqual(maxed.status, 200, 'huge limit still 200');
    assert(maxed.data.movements.length <= 500, '≤500 returned');

    console.log('\n15. Vertical-neutral router');
    const invSrc = fs.readFileSync(invPath, 'utf8');
    assert(!/business_type\s*===\s*['"]restaurant['"]/.test(invSrc), 'no restaurant hard-gate');
    assert(!/\b(table|kot|kds|waiter|kitchen)\b/i.test(invSrc), 'no floor/KDS');

    console.log('\n16. Stock write still on products');
    const stock = await api(baseUrl, `/api/products/${productId}/stock`, {
      method: 'POST',
      body: { action: 'set', quantity: 20 },
      headers: { ...ownerAuth, 'Idempotency-Key': 'inv-mov-api-stock-1' },
    });
    assertEqual(stock.status, 200, 'stock POST still works');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed}`);
      process.exit(1);
    }
    console.log('\nAll inventory-movements-api checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
