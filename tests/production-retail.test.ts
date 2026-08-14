/**
 * Phase 3.3 — Production Retail vertical smoke validation.
 *
 * ACTIVE_VERTICAL_ID=retail → Core Product→Order→Tax→Bill→Payment without
 * Restaurant modules. Distinct from synthetic retail-test (architecture fixture).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/production-retail.test.ts
 *    or: npm run test:production-retail
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-production-retail-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedCategory,
  installAndActivateTestTaxPack,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');

const { registerRoutes } = require('../main/routes/index');
const {
  ACTIVE_VERTICAL_ID,
  ACTIVE_VERTICAL_ENV_KEY,
  OPERVIA_RETAIL_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  VERTICALS,
  SYNTHETIC_VERTICALS,
  isModuleEnabled,
  getCompositionSnapshot,
  getRouteMountPlan,
  resolveActiveVerticalId,
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
} = require('../main/modules');

const dualRatePackData = require('./fixtures/synthetic-dual-rate-pack.json');
const indiaTaxPack = {
  ...dualRatePackData,
  id: 'test-in-pack-prod-retail',
  country: 'IN',
  currency: 'INR',
};

const RESTAURANT_ONLY = ['tables', 'kitchen', 'kds', 'menu', 'addons'] as const;
const RESTAURANT_PREFIXES = [
  '/api/tables',
  '/api/kitchen',
  '/api/kitchen-stations',
  '/api/kds',
  '/api/kds-info',
  '/api/menu-csv',
  '/api/addon-groups',
] as const;

async function probeStatus(
  baseUrl: string,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<number> {
  const response = await (globalThis as any).fetch(baseUrl + urlPath, {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
  return response.status as number;
}

async function main() {
  console.log('Phase 3.3 Production Retail Vertical');
  console.log('='.repeat(60));

  const envKey = ACTIVE_VERTICAL_ENV_KEY as string;
  const prev = process.env[envKey];
  const had = Object.prototype.hasOwnProperty.call(process.env, envKey);
  resetActiveVerticalResolutionForTests();
  process.env[envKey] = 'retail';

  try {
    // ── A. Production retail registration ───────────────────────────────
    console.log('\nA. Production retail in VERTICALS; retail-test remains synthetic');
    assertEqual(ACTIVE_VERTICAL_ID, 'restaurant', 'compile-time default remains restaurant');
    assert(
      VERTICALS.some((v: { id: string }) => v.id === OPERVIA_RETAIL_VERTICAL_ID),
      'retail is in production VERTICALS',
    );
    assert(
      !VERTICALS.some((v: { id: string }) => v.id === OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test is not in production VERTICALS',
    );
    assert(
      SYNTHETIC_VERTICALS.some((v: { id: string }) => v.id === OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test remains in SYNTHETIC_VERTICALS',
    );
    assertEqual(resolveActiveVerticalId(), 'retail', 'ACTIVE_VERTICAL_ID=retail resolves');
    const verticalId = commitActiveVerticalFromEnv();
    assertEqual(verticalId, 'retail', 'commit locks retail');

    for (const id of RESTAURANT_ONLY) {
      assert(!isModuleEnabled(id, 'retail'), `retail excludes ${id}`);
    }
    for (const id of ['product', 'inventory', 'order', 'payment', 'tax', 'pos'] as const) {
      assert(isModuleEnabled(id, 'retail'), `retail includes ${id}`);
    }
    const snap = getCompositionSnapshot({ verticalId: 'retail' });
    assertEqual(snap.vertical.id, 'retail', 'retail snapshot id');
    const plan = getRouteMountPlan('retail');
    for (const prefix of RESTAURANT_PREFIXES) {
      assert(!plan.mounted.includes(prefix), `retail plan omits ${prefix}`);
      assert(plan.skipped.includes(prefix), `retail plan skips ${prefix}`);
    }
    assert(plan.mounted.includes('/api/products'), 'retail mounts products');
    assert(plan.mounted.includes('/api/orders'), 'retail mounts orders');
    assert(plan.mounted.includes('/api/bills'), 'retail mounts bills');

    // ── B. Seed + mount under retail ────────────────────────────────────
    console.log('\nB. Start with retail composition (no Restaurant tables)');
    const db = initTestDb();
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('country', 'IN', ?)",
    ).run(now());
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('taxes_enabled', 'true', ?)",
    ).run(now());
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('business_type', 'restaurant', ?)",
    ).run(now());
    // Note: tenant business_type remains a tax-pack dimension; ACTIVE_VERTICAL_ID=retail
    // selects composition. Packs that list only restaurant/salon still apply when
    // business_type=restaurant. Production tax packs may add "retail" separately.
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('state_code', '27', ?)",
    ).run(now());
    installAndActivateTestTaxPack(db, indiaTaxPack);

    const { authHeader } = seedOwnerUser(db);
    seedCategory(db, 'cat-prod-retail', 'Production Retail Category');
    const tableCount = (db.prepare('SELECT COUNT(*) AS c FROM tables').get() as { c: number }).c;
    assertEqual(tableCount, 0, 'no restaurant tables required');

    const app = createApp({});
    registerRoutes(app, { verticalId: 'retail' });
    const { baseUrl, server } = await startServer(app);

    try {
      // ── C. Restaurant routes absent ─────────────────────────────────
      console.log('\nC. Restaurant HTTP absent under production retail');
      for (const prefix of RESTAURANT_PREFIXES) {
        const status = await probeStatus(baseUrl, prefix, authHeader);
        assertEqual(status, 404, `retail ${prefix} → 404`);
      }

      // ── D. Product + inventory ──────────────────────────────────────
      console.log('\nD. Product create with tax ref + inventory');
      const createProd = await api(baseUrl, '/api/products', {
        method: 'POST',
        body: {
          name: 'Retail Widget',
          sku: 'RW-PROD-001',
          price: 1000,
          category_id: 'cat-prod-retail',
          tax_category_id: 'standard',
          tax_behavior: 'exclusive',
          track_inventory: true,
          stock_quantity: 10,
        },
        headers: authHeader,
      });
      assertEqual(createProd.status, 201, 'product created');
      if (createProd.status !== 201) {
        console.error('product create body', createProd.data);
        process.exit(1);
      }
      const productId = String(createProd.data.product.id);
      assertEqual(Number(createProd.data.product.stock_quantity), 10, 'opening stock 10');

      // ── E. Money path ───────────────────────────────────────────────
      console.log('\nE. Takeaway Order → Tax → Bill → Payment');
      const orderRes = await api(baseUrl, '/api/orders', {
        method: 'POST',
        body: {
          type: 'takeaway',
          items: [{ product_id: productId, quantity: 2 }],
        },
        headers: authHeader,
      });
      assertEqual(orderRes.status, 201, 'takeaway order created');
      const order = orderRes.data.order;
      assertEqual(order.table_id ?? null, null, 'order has no table_id');
      assertEqual(Number(order.tax_amount), 100, 'tax_amount ₹100 via Tax facade');
      assertEqual(Number(order.total), 2100, 'total ₹2100');

      const stockAfterSale = db
        .prepare('SELECT stock_quantity FROM products WHERE id = ?')
        .get(productId) as any;
      assertEqual(Number(stockAfterSale.stock_quantity), 8, 'stock 10−2=8');

      const line = db
        .prepare(
          'SELECT product_name, product_sku, unit_price, quantity, tax_amount FROM order_items WHERE order_id = ?',
        )
        .get(order.id) as any;

      const billRes = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: order.id },
        headers: authHeader,
      });
      assertEqual(billRes.status, 201, 'bill generated');
      const billId = billRes.data.bill.id;

      const idemKey = `prod-retail-sale-${crypto.randomUUID()}`;
      const payRes = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: 2100 },
        headers: { ...authHeader, 'Idempotency-Key': idemKey },
      });
      assertEqual(payRes.status, 200, 'full payment accepted');
      assertEqual(payRes.data.bill.payment_status, 'paid', 'bill paid');
      assertEqual(Number(payRes.data.bill.balance), 0, 'balance zero');

      const orderAfterPay = db
        .prepare('SELECT status FROM orders WHERE id = ?')
        .get(order.id) as any;
      assertEqual(orderAfterPay.status, 'completed', 'order completed');

      // ── F. Idempotency ──────────────────────────────────────────────
      console.log('\nF. Payment idempotency');
      const replay = await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: 2100 },
        headers: { ...authHeader, 'Idempotency-Key': idemKey },
      });
      assertEqual(replay.status, 200, 'idempotent replay 200');
      const payLines = JSON.parse(
        (db.prepare('SELECT payment_details FROM bills WHERE id = ?').get(billId) as any)
          .payment_details || '[]',
      );
      assertEqual(Array.isArray(payLines) ? payLines.length : 1, 1, 'no double tender');

      // ── G. Historical freeze ────────────────────────────────────────
      console.log('\nG. Historical snapshot immutable after product mutate');
      const frozen = {
        name: line.product_name,
        sku: line.product_sku,
        unit_price: Number(line.unit_price),
        tax_amount: Number(line.tax_amount),
        order_total: Number(order.total),
        bill_total: Number(billRes.data.bill.total),
      };
      const mutate = await api(baseUrl, `/api/products/${productId}`, {
        method: 'PUT',
        body: {
          name: 'Retail Widget v2',
          sku: 'RW-PROD-002',
          price: 9999,
          tax_category_id: null,
          tax_behavior: 'exempt',
          track_inventory: true,
        },
        headers: authHeader,
      });
      assertEqual(mutate.status, 200, 'product mutate 200');
      const lineAfter = db
        .prepare(
          'SELECT product_name, product_sku, unit_price, tax_amount FROM order_items WHERE order_id = ?',
        )
        .get(order.id) as any;
      const orderAfter = db.prepare('SELECT total FROM orders WHERE id = ?').get(order.id) as any;
      const billAfter = db.prepare('SELECT total FROM bills WHERE id = ?').get(billId) as any;
      assertEqual(lineAfter.product_name, frozen.name, 'historical name frozen');
      assertEqual(lineAfter.product_sku, frozen.sku, 'historical SKU frozen');
      assertEqual(Number(lineAfter.unit_price), frozen.unit_price, 'historical unit_price frozen');
      assertEqual(Number(lineAfter.tax_amount), frozen.tax_amount, 'historical tax frozen');
      assertEqual(Number(orderAfter.total), frozen.order_total, 'historical order total frozen');
      assertEqual(Number(billAfter.total), frozen.bill_total, 'historical bill total frozen');

      // ── H. Oversell ─────────────────────────────────────────────────
      console.log('\nH. Oversell rejected');
      const stockBefore = Number(
        (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as any)
          .stock_quantity,
      );
      const over = await api(baseUrl, '/api/orders', {
        method: 'POST',
        body: { type: 'takeaway', items: [{ product_id: productId, quantity: 100 }] },
        headers: authHeader,
      });
      assertEqual(over.status, 400, 'oversell returns HTTP 400');
      const stockAfter = Number(
        (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as any)
          .stock_quantity,
      );
      assertEqual(stockAfter, stockBefore, 'stock unchanged after oversell');

      const { failed } = getResults();
      if (failed > 0) {
        console.error(`\nFAILED: ${failed} assertion(s)`);
        process.exit(1);
      }
      console.log('\n✅ Phase 3.3 production retail checks passed.');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      closeDatabase();
    }
  } finally {
    resetActiveVerticalResolutionForTests();
    if (had) process.env[envKey] = prev;
    else delete process.env[envKey];
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
