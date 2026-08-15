/**
 * P0.3 Phase 2 — prefer *_cents readers + dual-write consistency goldens.
 * Usage: npm run test:money-cents
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-money-cents-'));
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

process.env.JWT_SECRET = 'money-cents-phase2-secret';

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
  getDatabase,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const {
  preferCents,
  billTotalCents,
  billPaidCents,
  toCents,
  dualFromMajor,
} = require('../main/lib/money');

async function main() {
  console.log('\nP0.3 Phase 2 — Money cents prefer + dual-write\n' + '='.repeat(60));

  // Unit: preferCents never re-rounds integer cents; falls back to REAL with explicit round
  console.log('\nMONEY-01 preferCents semantics');
  assertEqual(preferCents(101, 1.0), 101, 'integer cents preferred over REAL');
  assertEqual(preferCents(null, 1.5), 150, 'REAL fallback uses Math.round (1.5→150)');
  assertEqual(preferCents(undefined, 10.5), 1050, 'undefined cents → REAL toCents');
  assertEqual(billTotalCents({ total_cents: 2500, total: 10 }), 2500, 'billTotalCents prefers cents');
  assertEqual(billTotalCents({ total: 12.34 }), 1234, 'billTotalCents REAL fallback');
  assertEqual(billPaidCents({ paid_amount_cents: 0, paid_amount: 5 }), 0, 'paid 0 cents beats stale REAL');
  const dual = dualFromMajor(19.99);
  assertEqual(dual.cents, 1999, 'dualFromMajor cents');
  assertEqual(dual.major, 19.99, 'dualFromMajor preserves major');

  const db = initTestDb();
  const owner = seedOwnerUser(db);
  seedCategory(db, 'cat-money', 'Money');
  // Seed without price_cents then set both via product path after create order uses prefer
  seedProduct(db, 'prod-money', 'cat-money', 'Money Latte', 10.5, {
    track_inventory: false,
  });
  db.prepare('UPDATE products SET price_cents = 1050, cost = 2, cost_cents = 200 WHERE id = ?').run(
    'prod-money',
  );

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\nMONEY-02 order create dual-writes *_cents');
    const created = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: owner.authHeader,
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-money', quantity: 2 }],
      },
    });
    assertEqual(created.status, 201, 'order create 201');
    const orderId = created.data.order.id;
    const orderRow = getDatabase()
      .prepare('SELECT * FROM orders WHERE id = ?')
      .get(orderId) as any;
    assert(orderRow.total_cents != null, 'orders.total_cents set');
    assertEqual(Number(orderRow.total_cents), toCents(orderRow.total), 'order total dual-write matches');
    assertEqual(
      Number(orderRow.subtotal_cents),
      toCents(orderRow.subtotal),
      'order subtotal dual-write matches',
    );

    const itemRow = getDatabase()
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .get(orderId) as any;
    assertEqual(Number(itemRow.unit_price_cents), 1050, 'item unit_price_cents from catalog');
    assertEqual(
      Number(itemRow.subtotal_cents),
      toCents(itemRow.subtotal),
      'item subtotal dual-write matches',
    );

    console.log('\nMONEY-03 bill generate dual-writes + preferCents settlement fields');
    const billRes = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: owner.authHeader,
      body: { order_id: orderId },
    });
    assert([200, 201].includes(billRes.status), `bill generate ok (got ${billRes.status})`);
    const billId = billRes.data.bill.id;
    const billRow = getDatabase().prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    assertEqual(Number(billRow.total_cents), toCents(billRow.total), 'bill total dual-write');
    assertEqual(Number(billRow.balance_cents), toCents(billRow.balance), 'bill balance dual-write');
    assertEqual(Number(billRow.paid_amount_cents), 0, 'bill paid_amount_cents 0');

    // Stale REAL with correct cents: prefer cents
    getDatabase()
      .prepare('UPDATE bills SET total = 1.00 WHERE id = ?')
      .run(billId);
    const stale = getDatabase().prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    assertEqual(
      billTotalCents(stale),
      Number(billRow.total_cents),
      'prefer total_cents when REAL diverges',
    );
    // restore REAL for subsequent payment tests
    getDatabase()
      .prepare('UPDATE bills SET total = ? WHERE id = ?')
      .run(billRow.total, billId);

    console.log('\nMONEY-04 REAL-only legacy row falls back cleanly');
    getDatabase()
      .prepare(
        'UPDATE bills SET total_cents = NULL, paid_amount_cents = NULL, balance_cents = NULL WHERE id = ?',
      )
      .run(billId);
    const legacy = getDatabase().prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    assertEqual(billTotalCents(legacy), toCents(legacy.total), 'NULL cents → REAL fallback');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
