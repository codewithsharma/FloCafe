/**
 * Phase 2.15 — Payment without restaurant side effects.
 *
 * Characterizes takeaway tender (no table) and documents soft-gates so Payment
 * stays vertical-neutral. Production ACTIVE vertical remains restaurant;
 * retail-test is composition-only (not production-enabled).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/payment-without-restaurant.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-payment-no-rest-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct,
  api, assert, assertEqual,
  getResults, closeDatabase,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const {
  isModuleEnabled,
  getCompositionSnapshot,
  ACTIVE_VERTICAL_ID,
} = require('../main/modules');

async function main() {
  console.log('Phase 2.15 Payment Without Restaurant Side Effects');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-pwr', 'Payment No-Restaurant Menu');
  seedProduct(db, 'prod-pwr-1', 'cat-pwr', 'Takeaway Only', 250);

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // ── 1. Takeaway (no table_id) pay succeeds ──────────────────────────
    console.log('\n1. Takeaway order → bill → pay (no table) succeeds');
    const createRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-pwr-1', quantity: 1 }] },
      headers: authHeader,
    });
    assertEqual(createRes.status, 201, 'takeaway order created');
    assertEqual(createRes.data.order.table_id ?? null, null, 'no table_id on takeaway');
    const orderId = createRes.data.order.id;
    const total = Number(createRes.data.order.total);

    const billRes = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: orderId },
      headers: authHeader,
    });
    assertEqual(billRes.status, 201, 'bill created');
    const billId = billRes.data.bill.id;

    const payRes = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: total },
      headers: authHeader,
    });
    assertEqual(payRes.status, 200, 'takeaway payment accepted');
    assertEqual(payRes.data.bill.payment_status, 'paid', 'bill paid without table free path');

    // ── 2. Composition: restaurant has tables/kds; retail-test does not ─
    console.log('\n2. Module composition: restaurant vs retail-test');
    assertEqual(ACTIVE_VERTICAL_ID, 'restaurant', 'production ACTIVE remains restaurant');
    assert(isModuleEnabled('tables'), 'restaurant enables tables');
    assert(isModuleEnabled('kds'), 'restaurant enables kds');
    assert(!isModuleEnabled('tables', 'retail-test'), 'retail-test excludes tables');
    assert(!isModuleEnabled('kds', 'retail-test'), 'retail-test excludes kds');

    const retailSnap = getCompositionSnapshot({ verticalId: 'retail-test' });
    assertEqual(retailSnap.vertical.id, 'retail-test', 'retail-test snapshot vertical');
    const retailModules: string[] = retailSnap.modules.enabled || [];
    assert(!retailModules.includes('tables'), 'retail-test snapshot excludes tables');
    assert(!retailModules.includes('kds'), 'retail-test snapshot excludes kds');
    assert(retailModules.includes('payment'), 'retail-test still includes payment');

    // Soft-gate architecture truth: bill-paid side effects check modules.
    // On Restaurant both modules are true → identical behavior to pre-2.15.
    console.log('\n3. Soft-gate call sites present for tables + kds');
    const billsSrc = fs.readFileSync(path.join(__dirname, '../main/routes/bills.ts'), 'utf8');
    const tenderSrc = fs.readFileSync(path.join(__dirname, '../main/services/payment-tender.ts'), 'utf8');
    const combined = `${billsSrc}\n${tenderSrc}`;
    assert(
      /isModuleEnabled\(\s*['"]kds['"]\s*\)/.test(combined),
      'KDS notify soft-gated with isModuleEnabled(\'kds\')',
    );
    assert(
      /isModuleEnabled\(\s*['"]tables['"]\s*\)/.test(combined),
      'table free soft-gated with isModuleEnabled(\'tables\')',
    );

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed} assertion(s)`);
      process.exit(1);
    }
    console.log('\nAll payment-without-restaurant checks passed.');
  } finally {
    server.close();
    closeDatabase();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
