/**
 * Phase 2.18 — Synthetic Retail end-to-end sale validation.
 *
 * Proves core commerce (Product → Inventory → Order → Tax → Bill → Payment)
 * completes without Restaurant tables/KDS/addons. Complements composition
 * suites with a money-path + historical-snapshot + payment-idempotency proof.
 *
 * Production ACTIVE vertical remains restaurant; retail-test stays synthetic.
 * No production Retail enablement.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/synthetic-retail-sale.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-synthetic-retail-sale-'));
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
  isModuleEnabled,
  getCompositionSnapshot,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
} = require('../main/modules');

const dualRatePackData = require('./fixtures/synthetic-dual-rate-pack.json');
const indiaTaxPack = {
  ...dualRatePackData,
  id: 'test-in-pack-retail',
  country: 'IN',
  currency: 'INR',
};

async function main() {
  console.log('Phase 2.18 Synthetic Retail Sale Validation');
  console.log('='.repeat(60));

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
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('state_code', '27', ?)",
  ).run(now());
  installAndActivateTestTaxPack(db, indiaTaxPack);

  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-retail', 'Retail Test Category');

  // Explicit Restaurant absence: no tables seeded for this sale path.
  const tableCount = (db.prepare('SELECT COUNT(*) AS c FROM tables').get() as { c: number }).c;
  assertEqual(tableCount, 0, 'no restaurant tables required for retail sale');

  const app = createApp({});
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    // ── A. Composition: retail-test excludes Restaurant ─────────────────
    console.log('\nA. retail-test composition excludes Restaurant modules');
    assertEqual(ACTIVE_VERTICAL_ID, 'restaurant', 'production ACTIVE remains restaurant');
    assert(
      !isModuleEnabled('tables', OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test excludes tables',
    );
    assert(!isModuleEnabled('kds', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test excludes kds');
    assert(
      !isModuleEnabled('addons', OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test excludes addons',
    );
    assert(
      isModuleEnabled('product', OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test includes product',
    );
    assert(
      isModuleEnabled('inventory', OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test includes inventory',
    );
    assert(isModuleEnabled('order', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test includes order');
    assert(
      isModuleEnabled('payment', OPERVIA_RETAIL_TEST_VERTICAL_ID),
      'retail-test includes payment',
    );
    assert(isModuleEnabled('tax', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test includes tax');
    assert(isModuleEnabled('pos', OPERVIA_RETAIL_TEST_VERTICAL_ID), 'retail-test includes pos');
    const snap = getCompositionSnapshot({ verticalId: 'retail-test' });
    assertEqual(snap.vertical.id, 'retail-test', 'retail-test snapshot id');

    // ── B. Product create + tax ref + inventory ─────────────────────────
    console.log('\nB. Create Product with tax ref + tracked inventory');
    const createProd = await api(baseUrl, '/api/products', {
      method: 'POST',
      body: {
        name: 'Retail Widget',
        sku: 'RW-001',
        price: 1000,
        category_id: 'cat-retail',
        tax_category_id: 'standard',
        tax_behavior: 'exclusive',
        track_inventory: true,
        stock_quantity: 10,
      },
      headers: authHeader,
    });
    assertEqual(createProd.status, 201, 'product created');
    const productId = String(createProd.data.product.id);
    assertEqual(createProd.data.product.tax_category_id, 'standard', 'tax_category_id set');
    assertEqual(createProd.data.product.tax_behavior, 'exclusive', 'tax_behavior exclusive');
    assertEqual(Number(createProd.data.product.stock_quantity), 10, 'opening stock 10');

    // ── C. Full takeaway sale (no table) ────────────────────────────────
    console.log('\nC. Takeaway Order → Tax → Bill → Payment (no Restaurant)');
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
    assertEqual(order.type, 'takeaway', 'order type takeaway');
    assertEqual(Number(order.subtotal), 2000, 'subtotal 2×1000');
    // Dual-rate pack: 2.5% + 2.5% = 5% exclusive on ₹2000 → ₹100 tax
    assertEqual(Number(order.tax_amount), 100, 'tax_amount ₹100 via Tax facade');
    assertEqual(Number(order.total), 2100, 'total ₹2100');
    assert(!!order.items?.[0]?.tax_snapshot || !!order.tax_snapshot, 'tax snapshot present');

    const stockAfterSale = db
      .prepare('SELECT stock_quantity, name, sku, price FROM products WHERE id = ?')
      .get(productId) as any;
    assertEqual(Number(stockAfterSale.stock_quantity), 8, 'stock 10−2=8 after sale');

    const line = db
      .prepare(
        'SELECT product_name, product_sku, unit_price, quantity, tax_amount, total FROM order_items WHERE order_id = ?',
      )
      .get(order.id) as any;
    assertEqual(line.product_name, 'Retail Widget', 'line snapshots product name');
    assertEqual(line.product_sku, 'RW-001', 'line snapshots SKU');
    assertEqual(Number(line.unit_price), 1000, 'line snapshots unit price');
    assertEqual(Number(line.quantity), 2, 'line quantity 2');

    const billRes = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: order.id },
      headers: authHeader,
    });
    assertEqual(billRes.status, 201, 'bill generated');
    const billId = billRes.data.bill.id;
    assertEqual(Number(billRes.data.bill.total), 2100, 'bill total matches order');

    const idemKey = `retail-sale-${crypto.randomUUID()}`;
    const payRes = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 2100 },
      headers: { ...authHeader, 'Idempotency-Key': idemKey },
    });
    assertEqual(payRes.status, 200, 'full payment accepted');
    assertEqual(payRes.data.bill.payment_status, 'paid', 'bill paid');
    assertEqual(Number(payRes.data.bill.balance), 0, 'balance zero');

    const orderAfterPay = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id) as any;
    assertEqual(orderAfterPay.status, 'completed', 'order completed after full pay');

    // ── D. Payment idempotency replay ───────────────────────────────────
    console.log('\nD. Payment Idempotency-Key replay does not double-collect');
    const replay = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: 2100 },
      headers: { ...authHeader, 'Idempotency-Key': idemKey },
    });
    assertEqual(replay.status, 200, 'idempotent replay 200');
    assertEqual(replay.data.bill.payment_status, 'paid', 'replay still paid');
    const payLines = JSON.parse(
      (db.prepare('SELECT payment_details FROM bills WHERE id = ?').get(billId) as any)
        .payment_details || '[]',
    );
    const lineCount = Array.isArray(payLines) ? payLines.length : 1;
    assertEqual(lineCount, 1, 'replay did not append a second tender line');

    // ── E. Historical snapshot stable after Product change ──────────────
    console.log('\nE. Historical Order/Bill unchanged after Product mutate');
    const frozen = {
      name: line.product_name,
      sku: line.product_sku,
      unit_price: Number(line.unit_price),
      quantity: Number(line.quantity),
      tax_amount: Number(line.tax_amount),
      order_total: Number(order.total),
      bill_tax: Number(billRes.data.bill.tax_amount),
      bill_total: Number(billRes.data.bill.total),
    };

    const mutate = await api(baseUrl, `/api/products/${productId}`, {
      method: 'PUT',
      body: {
        name: 'Retail Widget v2',
        sku: 'RW-002',
        price: 9999,
        tax_category_id: null,
        tax_behavior: 'exempt',
        track_inventory: true,
      },
      headers: authHeader,
    });
    assertEqual(mutate.status, 200, 'product mutate 200');
    assertEqual(mutate.data.product.name, 'Retail Widget v2', 'live product renamed');
    assertEqual(Number(mutate.data.product.price), 9999, 'live product repriced');

    const lineAfter = db
      .prepare(
        'SELECT product_name, product_sku, unit_price, quantity, tax_amount, total FROM order_items WHERE order_id = ?',
      )
      .get(order.id) as any;
    const orderAfter = db
      .prepare('SELECT total, tax_amount FROM orders WHERE id = ?')
      .get(order.id) as any;
    const billAfter = db
      .prepare('SELECT total, tax_amount, payment_status FROM bills WHERE id = ?')
      .get(billId) as any;

    assertEqual(lineAfter.product_name, frozen.name, 'historical name frozen');
    assertEqual(lineAfter.product_sku, frozen.sku, 'historical SKU frozen');
    assertEqual(Number(lineAfter.unit_price), frozen.unit_price, 'historical unit_price frozen');
    assertEqual(Number(lineAfter.quantity), frozen.quantity, 'historical quantity frozen');
    assertEqual(Number(lineAfter.tax_amount), frozen.tax_amount, 'historical line tax frozen');
    assertEqual(Number(orderAfter.total), frozen.order_total, 'historical order total frozen');
    assertEqual(Number(billAfter.tax_amount), frozen.bill_tax, 'historical bill tax frozen');
    assertEqual(Number(billAfter.total), frozen.bill_total, 'historical bill total frozen');
    assertEqual(billAfter.payment_status, 'paid', 'bill remains paid');

    // Live stock still reflects sale (mutate must not invent restock).
    const stockFinal = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId) as any;
    assertEqual(Number(stockFinal.stock_quantity), 8, 'stock remains 8 after product mutate');

    // ── F. Insufficient stock still enforced ────────────────────────────
    console.log('\nF. Insufficient stock rejected without Restaurant');
    const stockBeforeOver = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId) as any;
    const over = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [{ product_id: productId, quantity: 100 }],
      },
      headers: authHeader,
    });
    // Characterize existing behavior (inventory-boundary uses status >= 400).
    assert(over.status >= 400, `oversell rejected (${over.status})`);
    const stockAfterOver = db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId) as any;
    assertEqual(
      Number(stockAfterOver.stock_quantity),
      Number(stockBeforeOver.stock_quantity),
      'stock unchanged after oversell reject',
    );

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll synthetic-retail-sale checks passed.');
  } finally {
    server.close();
    closeDatabase();
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
