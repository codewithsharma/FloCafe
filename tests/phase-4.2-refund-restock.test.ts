/**
 * Phase 4.2 — Refund restock characterization + behavior.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.2-refund-restock.test.ts
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.2-restock-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-42-refund-restock-secret';

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
  now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');
const { refundRestockRoutes } = require('../main/routes/refund-restock');
const express = require('express');
const { openShift } = require('../main/services/shift');
const { upsertSettings } = require('../main/db');
const {
  commitActiveVerticalFromEnv,
  resetActiveVerticalResolutionForTests,
  ACTIVE_VERTICAL_ENV_KEY,
} = require('../main/modules/vertical-config');

function lockVertical(id: string | undefined): void {
  resetActiveVerticalResolutionForTests();
  if (id === undefined) {
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
  } else {
    process.env[ACTIVE_VERTICAL_ENV_KEY] = id;
  }
  commitActiveVerticalFromEnv();
}

function mountBills() {
  const r = express.Router();
  r.use(billRoutes);
  r.use(refundRoutes);
  return r;
}

function mountRefunds() {
  const r = express.Router();
  r.use(refundRoutes);
  r.use(refundRestockRoutes);
  return r;
}

async function createPaidTrackedBill(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
  qty: number,
  terminalId: string,
): Promise<{ orderId: string; billId: number; orderItemId: string }> {
  const headers = { ...authHeader, 'X-Flo-Terminal-Id': terminalId };
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: qty }] },
    headers,
  });
  assertEqual(order.status, 201, 'order created');
  const orderId = order.data.order.id;
  const db = getDatabase();
  const item = db
    .prepare('SELECT id FROM order_items WHERE order_id = ? AND product_id = ?')
    .get(orderId, productId) as { id: string };
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: orderId },
    headers,
  });
  assertEqual(bill.status, 201, 'bill generated');
  const billId = bill.data.bill.id;
  const total = Number(bill.data.bill.total);
  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount: total },
    headers: { ...headers, 'Idempotency-Key': `pay-${billId}-${Date.now()}` },
  });
  assert(pay.status < 300, `paid (${pay.status})`);
  return { orderId, billId, orderItemId: String(item.id) };
}

async function main() {
  console.log('Phase 4.2 — Refund Restock');
  console.log('='.repeat(60));

  const db = initTestDb();
  upsertSettings({ shifts_enabled: 'true', require_open_shift_for_cash: 'true' });
  const { authHeader, userId } = seedOwnerUser(db);
  seedCategory(db, 'cat-42', 'Retail');
  seedProduct(db, 'prod-42', 'cat-42', 'Widget', 100, {
    track_inventory: true,
    stock_quantity: 10,
  });
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(
    require('bcryptjs').hashSync('1234', 10),
    userId,
  );

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': mountBills(),
    '/api/refunds': mountRefunds(),
  });
  const { baseUrl, server } = await startServer(app);
  const terminalId = 'term-42-restock';

  try {
    openShift({
      actor: { userId, role: 'owner' },
      terminalId,
      openingFloatCents: 0,
    });

    // ── Characterization: money refund leaves stock/ledger unchanged (restaurant default) ──
    console.log('\n1. Characterization — refund leaves stock unchanged (restaurant)');
    lockVertical('restaurant');
    const paid1 = await createPaidTrackedBill(baseUrl, authHeader, 'prod-42', 2, terminalId);
    const stockAfterSale = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-42') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    assertEqual(stockAfterSale, 8, 'sale decremented to 8');
    const movBefore = (
      db.prepare('SELECT COUNT(*) AS c FROM inventory_movements').get() as { c: number }
    ).c;

    const refund1 = await api(baseUrl, `/api/bills/${paid1.billId}/refund`, {
      method: 'POST',
      body: { reason: 'customer return', override_pin: '1234' },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': `refund-char-${paid1.billId}`,
      },
    });
    assert(refund1.status < 300, `refund ok (${refund1.status})`);
    if (refund1.status >= 300) {
      console.error('refund1 body', refund1.data);
      throw new Error('characterization refund failed');
    }
    const stockAfterRefund = (
      db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-42') as {
        stock_quantity: number;
      }
    ).stock_quantity;
    assertEqual(stockAfterRefund, 8, 'refund did not change stock');
    const movAfter = (
      db.prepare('SELECT COUNT(*) AS c FROM inventory_movements').get() as { c: number }
    ).c;
    assertEqual(movAfter, movBefore, 'refund did not add inventory_movements');

    // Restaurant restock rejected
    console.log('\n2. Restaurant restock rejected');
    const restockRest = await api(baseUrl, `/api/refunds/${refund1.data.refund.id}/restock`, {
      method: 'POST',
      body: { order_item_id: paid1.orderItemId, quantity: 1 },
      headers: {
        ...authHeader,
        'Idempotency-Key': `restock-rest-${paid1.billId}`,
      },
    });
    assertEqual(restockRest.status, 403, 'restaurant restock forbidden');
    assertEqual(
      (
        db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-42') as {
          stock_quantity: number;
        }
      ).stock_quantity,
      8,
      'stock still 8 after restaurant restock reject',
    );

    // ── Retail-test restock path ──
    console.log('\n3. retail-test — explicit restock increments once');
    lockVertical('retail-test');
    adjustStockViaDb(db, 'prod-42', 10);
    const paid2 = await createPaidTrackedBill(baseUrl, authHeader, 'prod-42', 3, terminalId);
    assertEqual(readStock(db, 'prod-42'), 7, 'sale 10→7');
    const refund2 = await api(baseUrl, `/api/bills/${paid2.billId}/refund`, {
      method: 'POST',
      body: { reason: 'retail return', override_pin: '1234' },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': `refund-r2-${paid2.billId}`,
      },
    });
    assert(refund2.status < 300, `retail refund ok (${refund2.status})`);
    assertEqual(readStock(db, 'prod-42'), 7, 'money refund still no restock');
    const refundId = refund2.data.refund.id;

    const restock = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: paid2.orderItemId, quantity: 2 },
      headers: {
        ...authHeader,
        'Idempotency-Key': `restock-r2a-${refundId}`,
      },
    });
    assert(restock.status < 300, `restock ok (${restock.status})`);
    assertEqual(readStock(db, 'prod-42'), 9, 'restock +2 → 9');
    const ledger = db
      .prepare(
        `SELECT quantity_delta, movement_type, reference_type, reference_id, reason, stock_after
         FROM inventory_movements WHERE reference_type = 'refund' AND reference_id = ?`,
      )
      .all(String(refundId)) as Array<Record<string, unknown>>;
    assertEqual(ledger.length, 1, 'one refund restock movement');
    assertEqual(ledger[0].movement_type, 'adjustment', 'L2 adjustment type');
    assertEqual(Number(ledger[0].quantity_delta), 2, 'delta +2');
    assertEqual(Number(ledger[0].stock_after), 9, 'stock_after 9');
    assert(
      String(ledger[0].reason).includes(`order_item:${paid2.orderItemId}`),
      'reason encodes order_item',
    );

    console.log('\n4. Idempotent retry does not double-restock');
    const retry = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: paid2.orderItemId, quantity: 2 },
      headers: {
        ...authHeader,
        'Idempotency-Key': `restock-r2a-${refundId}`,
      },
    });
    assert(retry.status < 300, `retry ok (${retry.status})`);
    assertEqual(readStock(db, 'prod-42'), 9, 'retry stock unchanged');
    assertEqual(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM inventory_movements
             WHERE reference_type = 'refund' AND reference_id = ?`,
          )
          .get(String(refundId)) as { c: number }
      ).c,
      1,
      'still one movement after retry',
    );

    console.log('\n5. Partial remaining + over-qty + validation rejects');
    const restockMore = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: paid2.orderItemId, quantity: 1 },
      headers: {
        ...authHeader,
        'Idempotency-Key': `restock-r2b-${refundId}`,
      },
    });
    assert(restockMore.status < 300, `restock remaining 1 ok (${restockMore.status})`);
    assertEqual(readStock(db, 'prod-42'), 10, 'restock +1 → 10');

    const over = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: paid2.orderItemId, quantity: 1 },
      headers: {
        ...authHeader,
        'Idempotency-Key': `restock-r2c-${refundId}`,
      },
    });
    assertEqual(over.status, 400, 'over remaining rejected');

    const zero = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: paid2.orderItemId, quantity: 0 },
      headers: { ...authHeader, 'Idempotency-Key': `restock-zero-${refundId}` },
    });
    assertEqual(zero.status, 400, 'qty 0 rejected');

    const missing = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { quantity: 1 },
      headers: { ...authHeader, 'Idempotency-Key': `restock-missing-${refundId}` },
    });
    assertEqual(missing.status, 400, 'missing order_item_id rejected');

    console.log('\n6. Voided line cannot be restocked');
    adjustStockViaDb(db, 'prod-42', 10);
    // Fresh sale for void path: create order, void item before/after pay is complex;
    // mark order_item voided directly after a paid refund setup.
    const paid3 = await createPaidTrackedBill(baseUrl, authHeader, 'prod-42', 1, terminalId);
    const refund3 = await api(baseUrl, `/api/bills/${paid3.billId}/refund`, {
      method: 'POST',
      body: { reason: 'void line test', override_pin: '1234' },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': `refund-r3-${paid3.billId}`,
      },
    });
    assert(refund3.status < 300, 'refund3 ok');
    db.prepare(
      `UPDATE order_items SET status = 'voided', voided_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now(), now(), paid3.orderItemId);
    const voidRestock = await api(baseUrl, `/api/refunds/${refund3.data.refund.id}/restock`, {
      method: 'POST',
      body: { order_item_id: paid3.orderItemId, quantity: 1 },
      headers: {
        ...authHeader,
        'Idempotency-Key': `restock-void-${paid3.billId}`,
      },
    });
    assertEqual(voidRestock.status, 400, 'voided item restock rejected');

    const { failed } = getResults();
    if (failed > 0) {
      console.error(`\nFAILED: ${failed}`);
      process.exit(1);
    }
    console.log('\n✅ Phase 4.2 refund restock tests passed');
  } finally {
    resetActiveVerticalResolutionForTests();
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
    server.close();
    closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function readStock(db: any, productId: string): number {
  return Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as {
      stock_quantity: number;
    }).stock_quantity,
  );
}

function adjustStockViaDb(db: any, productId: string, qty: number): void {
  db.prepare('UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?').run(
    qty,
    now(),
    productId,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
