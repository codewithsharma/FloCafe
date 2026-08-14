/**
 * Phase 4.5 — Retail exchange core modules.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.5-retail-exchange.test.ts
 *    or: npm run test:phase-4.5
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.5-exchange-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-45-retail-exchange-secret';

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

const {
  BLOCKED_ITEM_STATUSES,
  ExchangeReturnValueError,
  formatMoneyDecimal,
  lineReturnValue,
  roundMoneyDecimal,
  totalReturnValue,
  validateReturnLine,
} = require('../main/lib/exchange-return-value');

const {
  createExchangeAttemptId,
  orderKey,
  paymentKey,
  refundKey,
  restockKey,
} = require('../main/lib/exchange-idempotency');

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

function mountCommerceRoutes() {
  const r = express.Router();
  r.use(billRoutes);
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
): Promise<{ orderId: string; billId: number; orderItemId: string; lineTotal: number; billTotal: number }> {
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
    .prepare('SELECT id, total, quantity FROM order_items WHERE order_id = ? AND product_id = ?')
    .get(orderId, productId) as { id: string; total: number; quantity: number };
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: orderId },
    headers,
  });
  assertEqual(bill.status, 201, 'bill generated');
  const billId = bill.data.bill.id;
  const billTotal = Number(bill.data.bill.total);
  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount: billTotal },
    headers: { ...headers, 'Idempotency-Key': `pay-${billId}-${Date.now()}` },
  });
  assert(pay.status < 300, `paid (${pay.status})`);
  return {
    orderId,
    billId,
    orderItemId: String(item.id),
    lineTotal: Number(item.total),
    billTotal,
  };
}

function readStock(db: any, productId: string): number {
  return Number(
    (db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(productId) as {
      stock_quantity: number;
    }).stock_quantity,
  );
}

async function main() {
  console.log('Phase 4.5 — Retail Exchange Core');
  console.log('='.repeat(60));

  // ── Unit: return value ──────────────────────────────────────────────────
  console.log('\n1. Unit — formatMoneyDecimal + roundMoneyDecimal');
  assertEqual(formatMoneyDecimal(10), '10.00', 'format integer');
  assertEqual(formatMoneyDecimal(10.5), '10.50', 'format fraction');
  assertEqual(formatMoneyDecimal(null), '0.00', 'format null');
  assertEqual(roundMoneyDecimal(33.333), 33.33, 'round 2dp');

  console.log('\n2. Unit — lineReturnValue uses total/quantity × return_qty');
  assertEqual(lineReturnValue({
    orderItemId: 'oi-1',
    lineTotal: 100,
    lineQuantity: 4,
    returnQuantity: 1,
  }), 25, 'single unit return');
  assertEqual(lineReturnValue({
    orderItemId: 'oi-1',
    lineTotal: 99.99,
    lineQuantity: 3,
    returnQuantity: 2,
  }), 66.66, 'partial qty with rounding');

  console.log('\n3. Unit — totalReturnValue sums lines');
  assertEqual(
    totalReturnValue([
      { orderItemId: 'a', lineTotal: 50, lineQuantity: 2, returnQuantity: 1 },
      { orderItemId: 'b', lineTotal: 30, lineQuantity: 3, returnQuantity: 3 },
    ]),
    55,
    'sum two lines',
  );

  console.log('\n4. Unit — validateReturnLine blocked statuses');
  assert(BLOCKED_ITEM_STATUSES.has('voided'), 'voided blocked');
  for (const status of ['voided', 'void_adjustment', 'cancelled']) {
    let threw = false;
    try {
      validateReturnLine({
        orderItemId: 'x',
        lineTotal: 10,
        lineQuantity: 1,
        returnQuantity: 1,
        status,
      });
    } catch (err) {
      threw = err instanceof ExchangeReturnValueError;
      assertEqual(err.code, 'RETURN_VALUE_BLOCKED_STATUS', `blocked ${status}`);
    }
    assert(threw, `blocked status throws: ${status}`);
  }

  console.log('\n5. Unit — validateReturnLine quantity guards');
  let overQty = false;
  try {
    validateReturnLine({
      orderItemId: 'x',
      lineTotal: 10,
      lineQuantity: 2,
      returnQuantity: 3,
    });
  } catch (err) {
    overQty = err instanceof ExchangeReturnValueError;
    assertEqual(err.code, 'RETURN_VALUE_RETURN_EXCEEDS_LINE', 'exceeds line qty');
  }
  assert(overQty, 'return qty > line qty throws');

  // ── Unit: idempotency keys ───────────────────────────────────────────────
  console.log('\n6. Unit — exchange idempotency key builders');
  const attemptId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assertEqual(refundKey(attemptId), `exchange-${attemptId}-refund`, 'refund key');
  assertEqual(orderKey(attemptId), `exchange-${attemptId}-order`, 'order key');
  assertEqual(paymentKey(attemptId), `exchange-${attemptId}-payment`, 'payment key');
  assertEqual(restockKey(attemptId, 'item-42'), `exchange-${attemptId}-restock-item-42`, 'restock key');

  const generated = createExchangeAttemptId();
  assert(typeof generated === 'string' && generated.length > 0, 'createExchangeAttemptId returns uuid');
  assertEqual(refundKey(generated).startsWith('exchange-'), true, 'generated id usable in keys');

  // ── Integration skeleton: full exchange happy path (retail vertical) ───
  console.log('\n7. Integration skeleton — retail exchange happy path (HTTP legs)');
  const db = initTestDb();
  upsertSettings({ shifts_enabled: 'true', require_open_shift_for_cash: 'true' });
  const { authHeader, userId } = seedOwnerUser(db);
  seedCategory(db, 'cat-45', 'Exchange');
  seedProduct(db, 'prod-return', 'cat-45', 'Return Widget', 100, {
    track_inventory: true,
    stock_quantity: 20,
  });
  seedProduct(db, 'prod-replace', 'cat-45', 'Replace Gadget', 120, {
    track_inventory: true,
    stock_quantity: 15,
  });
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(
    require('bcryptjs').hashSync('1234', 10),
    userId,
  );

  lockVertical('retail');
  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': mountCommerceRoutes(),
    '/api/refunds': mountCommerceRoutes(),
  });
  const { baseUrl, server } = await startServer(app);
  const terminalId = 'term-45-exchange';

  try {
    openShift({
      actor: { userId, role: 'owner' },
      terminalId,
      openingFloatCents: 0,
    });

    const original = await createPaidTrackedBill(
      baseUrl,
      authHeader,
      'prod-return',
      2,
      terminalId,
    );
    assertEqual(readStock(db, 'prod-return'), 18, 'original sale decremented stock');

    const attemptIdLegs = createExchangeAttemptId();
    const returnValue = lineReturnValue({
      orderItemId: original.orderItemId,
      lineTotal: original.lineTotal,
      lineQuantity: 2,
      returnQuantity: 1,
    });

    // Leg 1 — refund (exchange refund key)
    const refundRes = await api(baseUrl, `/api/bills/${original.billId}/refund`, {
      method: 'POST',
      body: {
        amount: returnValue,
        reason: 'retail exchange return',
        override_pin: '1234',
        method: 'cash',
      },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': refundKey(attemptIdLegs),
      },
    });
    assert(refundRes.status < 300, `refund leg ok (${refundRes.status})`);
    const refundId = refundRes.data.refund.id;

    // Leg 2 — replacement sale (exchange order + payment keys)
    const replacementOrder = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-replace', quantity: 1 }],
      },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': orderKey(attemptIdLegs),
      },
    });
    assertEqual(replacementOrder.status, 201, 'replacement order created');
    const replacementOrderId = replacementOrder.data.order.id;

    const replacementBill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: replacementOrderId },
      headers: { ...authHeader, 'X-Flo-Terminal-Id': terminalId },
    });
    assertEqual(replacementBill.status, 201, 'replacement bill generated');
    const replacementBillId = replacementBill.data.bill.id;
    const replacementTotal = Number(replacementBill.data.bill.total);

    const replacementPay = await api(baseUrl, `/api/bills/${replacementBillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: replacementTotal },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': paymentKey(attemptIdLegs),
      },
    });
    assert(replacementPay.status < 300, `replacement paid (${replacementPay.status})`);
    assertEqual(readStock(db, 'prod-replace'), 14, 'replacement sale decremented stock');

    // Leg 3 — restock returned unit (exchange restock key)
    const restockRes = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: original.orderItemId, quantity: 1 },
      headers: {
        ...authHeader,
        'Idempotency-Key': restockKey(attemptIdLegs, original.orderItemId),
      },
    });
    assert(restockRes.status < 300, `restock leg ok (${restockRes.status})`);
    assertEqual(readStock(db, 'prod-return'), 19, 'returned unit restocked (+1)');

    // Idempotent refund retry — same key must not double-refund
    const refundRetry = await api(baseUrl, `/api/bills/${original.billId}/refund`, {
      method: 'POST',
      body: {
        amount: returnValue,
        reason: 'retail exchange return',
        override_pin: '1234',
        method: 'cash',
      },
      headers: {
        ...authHeader,
        'X-Flo-Terminal-Id': terminalId,
        'Idempotency-Key': refundKey(attemptIdLegs),
      },
    });
    assertEqual(refundRetry.status, 200, 'refund idempotent replay 200');
    assertEqual(refundRetry.data.refund.id, refundId, 'same refund id on replay');

    // Restaurant vertical — restock remains forbidden (exchange restock leg)
    lockVertical('restaurant');
    const restaurantRestock = await api(baseUrl, `/api/refunds/${refundId}/restock`, {
      method: 'POST',
      body: { order_item_id: original.orderItemId, quantity: 1 },
      headers: {
        ...authHeader,
        'Idempotency-Key': restockKey(attemptIdLegs, 'restaurant-probe'),
      },
    });
    assertEqual(restaurantRestock.status, 403, 'restaurant restock forbidden');
    lockVertical('retail');

    console.log('   ✓ HTTP legs + idempotency + restaurant restock gate');
  } finally {
    server.close();
    resetActiveVerticalResolutionForTests();
    delete process.env[ACTIVE_VERTICAL_ENV_KEY];
    closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  // ── Frontend contracts ─────────────────────────────────────────────────
  console.log('\n8. Frontend contracts');
  const ROOT = path.join(__dirname, '..');
  const FRONTEND = path.join(ROOT, 'frontend/src');
  const readFe = (rel: string) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8');

  const coordinatorSrc = readFe('lib/exchange/coordinator.ts');
  assert(coordinatorSrc.includes('runExchange'), 'coordinator exports runExchange');
  assert(coordinatorSrc.includes('refundKey'), 'coordinator uses refundKey');
  assert(coordinatorSrc.includes('postRefundRestock'), 'coordinator calls restock API');
  assert(!coordinatorSrc.includes('exchanges'), 'no exchange backend table API');

  const ordersPage = readFe('app/(dashboard)/orders/page.tsx');
  assert(ordersPage.includes('ExchangeDialog'), 'orders page uses ExchangeDialog');
  assert(ordersPage.includes('exchangeVerticalEnabled'), 'orders page gates exchange vertical');
  assert(ordersPage.includes('EXCHANGE_VERTICALS'), 'exchange vertical constant');
  assert(ordersPage.includes('runExchange'), 'orders page runs coordinator');
  assert(!ordersPage.includes('canExchange={true}'), 'exchange not unconditionally enabled');

  const orderCard = readFe('components/orders/OrderCard.tsx');
  assert(orderCard.includes('canExchange'), 'OrderCard exchange prop');
  assert(orderCard.includes('ArrowLeftRight'), 'exchange icon');

  for (const lang of ['en', 'es', 'pt']) {
    const i18n = fs.readFileSync(path.join(FRONTEND, `lib/i18n/${lang}.json`), 'utf8');
    assert(i18n.includes('"orders.exchange"'), `${lang} orders.exchange`);
    assert(i18n.includes('"orders.confirmExchange"'), `${lang} orders.confirmExchange`);
  }
  console.log('   ✓ frontend exchange wiring');

  const { failed, total, passed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Phase 4.5 retail exchange tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
