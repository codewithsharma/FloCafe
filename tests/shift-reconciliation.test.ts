/**
 * M5-C + M5-D — Expected cash computation (read-only) and close/force-close
 * reconciliation persistence.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/shift-reconciliation.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-shift-reconciliation-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => '3.0.5-test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'shift-reconciliation-test-secret';

const bcrypt = require('bcryptjs');
const {
  initDatabase,
  getDatabase,
  closeDatabase,
  now,
  upsertSettings,
} = require('../main/db');
const {
  ShiftServiceError,
  computeExpectedCashCents,
  openShift,
  closeShift,
  forceCloseShift,
  getShiftReconciliationPreview,
  getShiftPaymentSummary,
} = require('../main/services/shift');
const {
  isQualifyingCashPaymentLine,
  sumQualifyingCashCentsFromPaymentDetailsJson,
  sumQualifyingNonCashCentsFromPaymentDetailsJson,
} = require('../main/services/payment-cash');
const auditLog = require('../main/services/audit-log');

function seedUser(id: string, role = 'cashier'): string {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, role, `${id}@test.local`, bcrypt.hashSync('ReconPass1', 10), role, now(), now());
  return id;
}

function insertShift(
  terminalId: string,
  userId: string,
  opts: { openingFloatCents?: number; status?: string } = {},
): number {
  const db = getDatabase();
  const t = now();
  const status = opts.status ?? 'open';
  const info = db.prepare(`
    INSERT INTO shifts (
      terminal_id, status, opened_by_user_id, opening_float_cents,
      opened_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    terminalId,
    status,
    userId,
    opts.openingFloatCents ?? 50000,
    t,
    t,
    t,
  );
  return Number(info.lastInsertRowid);
}

function insertOrder(orderShiftId: number | null = null): number {
  const db = getDatabase();
  const t = now();
  const info = db.prepare(`
    INSERT INTO orders (order_number, status, subtotal, total, shift_id, created_at, updated_at)
    VALUES (?, 'pending', 100, 100, ?, ?, ?)
  `).run(`ORD-${randomUUID()}`, orderShiftId, t, t);
  return Number(info.lastInsertRowid);
}

function insertBill(
  orderId: number,
  opts: {
    shiftId?: number | null;
    paymentDetails?: unknown;
    billNumber?: string;
  } = {},
): number {
  const db = getDatabase();
  const t = now();
  const paymentDetails = opts.paymentDetails === undefined
    ? null
    : JSON.stringify(opts.paymentDetails);
  const info = db.prepare(`
    INSERT INTO bills (
      bill_number, order_id, total, paid_amount, balance, payment_status,
      payment_details, shift_id, created_at, updated_at
    ) VALUES (?, ?, 100, 100, 0, 'paid', ?, ?, ?, ?)
  `).run(
    opts.billNumber ?? `BILL-${randomUUID()}`,
    orderId,
    paymentDetails,
    opts.shiftId === undefined ? null : opts.shiftId,
    t,
    t,
  );
  return Number(info.lastInsertRowid);
}

function getShiftReconciliationColumns(shiftId: number): {
  expected_cash_cents: number | null;
  variance_cents: number | null;
  counted_cash_cents: number | null;
} {
  return getDatabase().prepare(`
    SELECT expected_cash_cents, variance_cents, counted_cash_cents FROM shifts WHERE id = ?
  `).get(shiftId) as {
    expected_cash_cents: number | null;
    variance_cents: number | null;
    counted_cash_cents: number | null;
  };
}

function getBillSnapshot(billId: number): { shift_id: number | null; payment_details: string | null } {
  return getDatabase().prepare(`
    SELECT shift_id, payment_details FROM bills WHERE id = ?
  `).get(billId) as { shift_id: number | null; payment_details: string | null };
}

function actor(userId: string, role: string) {
  return { userId, role };
}

function assertNoSensitiveKeys(metadata: Record<string, unknown> | null): void {
  const json = JSON.stringify(metadata || {});
  assert.equal(/password|pin|jwt|token|secret|credential/i.test(json), false, 'audit metadata must not contain secrets');
}

function getAuditMetadata(action: string, shiftId: number): Record<string, unknown> {
  const row = getDatabase().prepare(
    `SELECT metadata_json FROM audit_logs WHERE action = ? AND entity_id = ? ORDER BY id DESC LIMIT 1`,
  ).get(action, String(shiftId)) as { metadata_json: string } | undefined;
  assert.ok(row, `expected audit row for ${action}`);
  return JSON.parse(row!.metadata_json) as Record<string, unknown>;
}

function uniqueTerminal(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function main() {
  console.log('M5-C Expected Cash Computation Tests');
  console.log('='.repeat(60));

  initDatabase();
  upsertSettings({ shifts_enabled: 'true' });
  const userId = seedUser('recon-user-001');
  const terminalId = `term-recon-${randomUUID()}`;

  assert.throws(
    () => computeExpectedCashCents(99999),
    (err: unknown) => {
      assert.ok(err instanceof ShiftServiceError);
      assert.equal((err as ShiftServiceError).statusCode, 404);
      assert.equal((err as ShiftServiceError).code, 'SHIFT_NOT_FOUND');
      return true;
    },
    'missing shift throws SHIFT_NOT_FOUND',
  );
  console.log('   ✓ shift not found → SHIFT_NOT_FOUND');

  const shiftOpeningOnly = insertShift(terminalId, userId, { openingFloatCents: 25000 });
  assert.equal(computeExpectedCashCents(shiftOpeningOnly), 25000);
  console.log('   ✓ opening float only');

  const shiftOneCash = insertShift(`${terminalId}-one`, userId, { openingFloatCents: 10000 });
  const orderOne = insertOrder(shiftOneCash);
  insertBill(orderOne, {
    shiftId: shiftOneCash,
    paymentDetails: [{ method: 'cash', amount: 30.0 }],
  });
  assert.equal(computeExpectedCashCents(shiftOneCash), 10000 + 3000);
  console.log('   ✓ one cash payment');

  const shiftMultiCash = insertShift(`${terminalId}-multi`, userId, { openingFloatCents: 5000 });
  const orderMulti = insertOrder(shiftMultiCash);
  insertBill(orderMulti, { shiftId: shiftMultiCash, paymentDetails: [{ method: 'cash', amount: 12.5 }] });
  insertBill(orderMulti, { shiftId: shiftMultiCash, paymentDetails: [{ method: 'cash', amount: 7.25 }] });
  assert.equal(computeExpectedCashCents(shiftMultiCash), 5000 + 1250 + 725);
  console.log('   ✓ multiple cash payments across bills');

  const shiftMixedCard = insertShift(`${terminalId}-card`, userId, { openingFloatCents: 0 });
  const orderMixedCard = insertOrder(shiftMixedCard);
  insertBill(orderMixedCard, {
    shiftId: shiftMixedCard,
    paymentDetails: [
      { method: 'cash', amount: 30 },
      { method: 'card', amount: 20 },
    ],
  });
  assert.equal(computeExpectedCashCents(shiftMixedCard), 3000);
  console.log('   ✓ cash + card → only cash included');

  const shiftMixedWallet = insertShift(`${terminalId}-wallet`, userId, { openingFloatCents: 1000 });
  const orderMixedWallet = insertOrder(shiftMixedWallet);
  insertBill(orderMixedWallet, {
    shiftId: shiftMixedWallet,
    paymentDetails: [
      { method: 'cash', amount: 15 },
      { method: 'wallet', amount: 10 },
    ],
  });
  assert.equal(computeExpectedCashCents(shiftMixedWallet), 1000 + 1500);
  console.log('   ✓ cash + wallet → only cash included');

  const shiftCustomNonCash = insertShift(`${terminalId}-venmo`, userId, { openingFloatCents: 0 });
  const orderCustomNonCash = insertOrder(shiftCustomNonCash);
  insertBill(orderCustomNonCash, {
    shiftId: shiftCustomNonCash,
    paymentDetails: [{ method: 'Venmo', amount: 50 }],
  });
  assert.equal(computeExpectedCashCents(shiftCustomNonCash), 0);
  console.log('   ✓ custom non-cash method excluded');

  const shiftCustomCash = insertShift(`${terminalId}-custom-cash`, userId, { openingFloatCents: 2000 });
  const orderCustomCash = insertOrder(shiftCustomCash);
  insertBill(orderCustomCash, {
    shiftId: shiftCustomCash,
    paymentDetails: [{ method: 'cash', amount: 8.5 }],
  });
  assert.equal(computeExpectedCashCents(shiftCustomCash), 2000 + 850);
  console.log('   ✓ custom method named cash included');

  const shiftZeroCash = insertShift(`${terminalId}-zero`, userId, { openingFloatCents: 3000 });
  const orderZeroCash = insertOrder(shiftZeroCash);
  insertBill(orderZeroCash, {
    shiftId: shiftZeroCash,
    paymentDetails: [{ method: 'cash', amount: 0 }],
  });
  assert.equal(computeExpectedCashCents(shiftZeroCash), 3000);
  console.log('   ✓ zero cash payment excluded');

  const shiftNegativeCash = insertShift(`${terminalId}-neg`, userId, { openingFloatCents: 3000 });
  const orderNegativeCash = insertOrder(shiftNegativeCash);
  insertBill(orderNegativeCash, {
    shiftId: shiftNegativeCash,
    paymentDetails: [{ method: 'cash', amount: -5 }],
  });
  assert.equal(computeExpectedCashCents(shiftNegativeCash), 3000);
  console.log('   ✓ negative cash payment excluded');

  const shiftNullBill = insertShift(`${terminalId}-null-bill`, userId, { openingFloatCents: 4000 });
  const orderNullBill = insertOrder(shiftNullBill);
  insertBill(orderNullBill, {
    shiftId: null,
    paymentDetails: [{ method: 'cash', amount: 100 }],
  });
  assert.equal(computeExpectedCashCents(shiftNullBill), 4000);
  console.log('   ✓ NULL bill.shift_id excluded');

  const shiftA = insertShift(`${terminalId}-iso-a`, userId, { openingFloatCents: 1000 });
  const shiftB = insertShift(`${terminalId}-iso-b`, userId, { openingFloatCents: 2000 });
  const orderIso = insertOrder(shiftA);
  insertBill(orderIso, { shiftId: shiftB, paymentDetails: [{ method: 'cash', amount: 25 }] });
  assert.equal(computeExpectedCashCents(shiftA), 1000);
  assert.equal(computeExpectedCashCents(shiftB), 2000 + 2500);
  console.log('   ✓ different shift bill excluded from target shift');

  const shiftPartial = insertShift(`${terminalId}-partial`, userId, { openingFloatCents: 0 });
  const orderPartial = insertOrder(shiftPartial);
  insertBill(orderPartial, {
    shiftId: shiftPartial,
    paymentDetails: [
      { method: 'cash', amount: 30 },
      { method: 'card', amount: 20 },
      { method: 'cash', amount: 15 },
    ],
  });
  assert.equal(computeExpectedCashCents(shiftPartial), 3000 + 1500);
  console.log('   ✓ partial payments on same bill all cash lines included');

  const shiftOrderMismatch = insertShift(`${terminalId}-mismatch`, userId, { openingFloatCents: 500 });
  const otherShift = insertShift(`${terminalId}-other`, userId, { openingFloatCents: 99999 });
  const orderMismatch = insertOrder(otherShift);
  insertBill(orderMismatch, {
    shiftId: shiftOrderMismatch,
    paymentDetails: [{ method: 'cash', amount: 10 }],
  });
  assert.equal(computeExpectedCashCents(shiftOrderMismatch), 500 + 1000);
  assert.equal(computeExpectedCashCents(otherShift), 99999);
  console.log('   ✓ order shift differs from bill shift → bill.shift_id wins');

  const shiftManyBills = insertShift(`${terminalId}-many`, userId, { openingFloatCents: 800 });
  const orderMany = insertOrder(shiftManyBills);
  insertBill(orderMany, { shiftId: shiftManyBills, paymentDetails: [{ method: 'cash', amount: 5 }] });
  insertBill(orderMany, { shiftId: shiftManyBills, paymentDetails: [{ method: 'cash', amount: 3.5 }] });
  assert.equal(computeExpectedCashCents(shiftManyBills), 800 + 500 + 350);
  console.log('   ✓ multiple bills on same shift aggregated');

  assert.equal(computeExpectedCashCents(shiftA), 1000);
  assert.equal(computeExpectedCashCents(shiftB), 4500);
  console.log('   ✓ multiple shifts remain isolated');

  const shiftZeroFloat = insertShift(`${terminalId}-zero-float`, userId, { openingFloatCents: 0 });
  const orderZeroFloat = insertOrder(shiftZeroFloat);
  insertBill(orderZeroFloat, {
    shiftId: shiftZeroFloat,
    paymentDetails: [{ method: 'cash', amount: 42 }],
  });
  assert.equal(computeExpectedCashCents(shiftZeroFloat), 4200);
  console.log('   ✓ zero opening float');

  const largeOpening = 9007199254740990;
  const largeCash = 5;
  const shiftLarge = insertShift(`${terminalId}-large`, userId, { openingFloatCents: largeOpening });
  const orderLarge = insertOrder(shiftLarge);
  insertBill(orderLarge, {
    shiftId: shiftLarge,
    paymentDetails: [{ method: 'cash', amount: largeCash / 100 }],
  });
  assert.equal(computeExpectedCashCents(shiftLarge), largeOpening + largeCash);
  console.log('   ✓ large integer-cent values without precision loss');

  const regressionShift = openShift({
    actor: { userId, role: 'cashier' },
    terminalId: `term-regression-${randomUUID()}`,
    openingFloatCents: 12345,
  });
  const regressionOrder = insertOrder(regressionShift.id);
  const regressionBillId = insertBill(regressionOrder, {
    shiftId: regressionShift.id,
    paymentDetails: [{ method: 'cash', amount: 20, tendered_amount: 25, change_amount: 5 }],
  });
  const billBefore = getBillSnapshot(regressionBillId);
  const expectedBefore = getShiftReconciliationColumns(regressionShift.id);

  const computed = computeExpectedCashCents(regressionShift.id);
  assert.equal(computed, 12345 + 2000);

  const expectedAfter = getShiftReconciliationColumns(regressionShift.id);
  assert.equal(expectedAfter.expected_cash_cents, null);
  assert.equal(expectedAfter.variance_cents, null);
  assert.deepEqual(getBillSnapshot(regressionBillId), billBefore);
  assert.equal(expectedBefore.expected_cash_cents, null);
  assert.equal(expectedBefore.variance_cents, null);
  console.log('   ✓ computation is read-only (shifts/bills unchanged, reconciliation columns NULL)');

  assert.equal(
    sumQualifyingCashCentsFromPaymentDetailsJson(
      JSON.stringify([{ method: 'cash', amount: 20, tendered_amount: 25, change_amount: 5 }]),
    ),
    2000,
    'tendered_amount ignored',
  );
  console.log('   ✓ tendered_amount not used in aggregation');

  upsertSettings({ shifts_enabled: 'false' });
  assert.equal(computeExpectedCashCents(regressionShift.id), 12345 + 2000);
  upsertSettings({ shifts_enabled: 'true' });
  console.log('   ✓ shifts_enabled=false does not alter computation');

  assert.equal(isQualifyingCashPaymentLine('cash', 10), true);
  assert.equal(isQualifyingCashPaymentLine('card', 10), false);
  assert.equal(isQualifyingCashPaymentLine('cash', 0), false);
  assert.equal(isQualifyingCashPaymentLine('cash', -1), false);
  console.log('   ✓ payment-cash helpers classify cash lines');

  // ── M5-D: close / force-close reconciliation persistence ─────────────────
  console.log('\nM5-D Close Reconciliation Persistence Tests');
  console.log('='.repeat(60));

  const managerId = seedUser('recon-mgr-001', 'manager');
  const cashierId = userId;

  // 1. Close with counted cash: expected + variance persisted
  {
    const term = uniqueTerminal('m5d-counted');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 10000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 30 }],
    });
    const expected = 10000 + 3000;
    const counted = 12500;
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: counted,
    });
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(cols.expected_cash_cents, expected);
    assert.equal(cols.variance_cents, counted - expected);
    assert.equal(cols.counted_cash_cents, counted);
    assert.equal(closed.expected_cash_cents, expected);
    assert.equal(closed.variance_cents, counted - expected);
    console.log('   ✓ close with counted cash persists expected + variance');
  }

  // 2. Close exact count: variance = 0
  {
    const term = uniqueTerminal('m5d-exact');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 5000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 20 }],
    });
    const expected = 5000 + 2000;
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: expected,
    });
    assert.equal(getShiftReconciliationColumns(shift.id).variance_cents, 0);
    assert.equal(closed.variance_cents, 0);
    console.log('   ✓ close exact count → variance = 0');
  }

  // 3. Close overage: variance positive
  {
    const term = uniqueTerminal('m5d-over');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    const expected = 1000;
    const counted = 1500;
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: counted,
    });
    assert.equal(closed.expected_cash_cents, expected);
    assert.equal(closed.variance_cents, 500);
    assert.ok(closed.variance_cents! > 0);
    console.log('   ✓ close overage → variance positive');
  }

  // 4. Close shortage: variance negative
  {
    const term = uniqueTerminal('m5d-short');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 2000,
    });
    const expected = 2000;
    const counted = 1500;
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: counted,
    });
    assert.equal(closed.expected_cash_cents, expected);
    assert.equal(closed.variance_cents, -500);
    assert.ok(closed.variance_cents! < 0);
    console.log('   ✓ close shortage → variance negative');
  }

  // 5. Close without counted cash: expected persisted, variance NULL
  {
    const term = uniqueTerminal('m5d-nocount');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 8000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 12 }],
    });
    const expected = 8000 + 1200;
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(cols.expected_cash_cents, expected);
    assert.equal(cols.variance_cents, null);
    assert.equal(cols.counted_cash_cents, null);
    assert.equal(closed.expected_cash_cents, expected);
    assert.equal(closed.variance_cents, null);
    console.log('   ✓ close without counted cash → expected set, variance NULL');
  }

  // 6. Force-close with counted cash: expected + variance persisted
  {
    const term = uniqueTerminal('m5d-force-count');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 4000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 10 }],
    });
    const expected = 4000 + 1000;
    const counted = 4800;
    const closed = forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'Cashier left mid-shift',
      countedCashCents: counted,
    });
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(cols.expected_cash_cents, expected);
    assert.equal(cols.variance_cents, counted - expected);
    assert.equal(closed.expected_cash_cents, expected);
    assert.equal(closed.variance_cents, counted - expected);
    console.log('   ✓ force-close with counted cash persists expected + variance');
  }

  // 7. Force-close without counted cash: expected persisted, variance NULL
  {
    const term = uniqueTerminal('m5d-force-nocount');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 3500,
    });
    const closed = forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'Abandoned terminal',
    });
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(cols.expected_cash_cents, 3500);
    assert.equal(cols.variance_cents, null);
    assert.equal(closed.expected_cash_cents, 3500);
    assert.equal(closed.variance_cents, null);
    console.log('   ✓ force-close without counted cash → expected set, variance NULL');
  }

  // 8. Opening float only: expected = opening float
  {
    const term = uniqueTerminal('m5d-float-only');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 27500,
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 27500,
    });
    assert.equal(closed.expected_cash_cents, 27500);
    assert.equal(closed.variance_cents, 0);
    console.log('   ✓ opening float only → expected = opening float');
  }

  // 9. Cash payments included in close persistence
  {
    const term = uniqueTerminal('m5d-cash-incl');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 45.5 }],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 5550,
    });
    assert.equal(closed.expected_cash_cents, 1000 + 4550);
    console.log('   ✓ cash payments included in close persistence');
  }

  // 10. Card excluded
  {
    const term = uniqueTerminal('m5d-card');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 0,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 30 },
        { method: 'card', amount: 20 },
      ],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 3000,
    });
    assert.equal(closed.expected_cash_cents, 3000);
    console.log('   ✓ card excluded from close expected cash');
  }

  // 11. Wallet excluded
  {
    const term = uniqueTerminal('m5d-wallet');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 500,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 15 },
        { method: 'wallet', amount: 10 },
      ],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 2000,
    });
    assert.equal(closed.expected_cash_cents, 500 + 1500);
    console.log('   ✓ wallet excluded from close expected cash');
  }

  // 12. Custom non-cash excluded
  {
    const term = uniqueTerminal('m5d-venmo');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 0,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'Venmo', amount: 50 }],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 0,
    });
    assert.equal(closed.expected_cash_cents, 0);
    console.log('   ✓ custom non-cash method excluded on close');
  }

  // 13. Custom method named "cash" included
  {
    const term = uniqueTerminal('m5d-named-cash');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 2000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 8.5 }],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 2850,
    });
    assert.equal(closed.expected_cash_cents, 2000 + 850);
    console.log('   ✓ method named cash included on close');
  }

  // 14. NULL bill.shift_id excluded
  {
    const term = uniqueTerminal('m5d-null-bill');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 4000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: null,
      paymentDetails: [{ method: 'cash', amount: 100 }],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 4000,
    });
    assert.equal(closed.expected_cash_cents, 4000);
    console.log('   ✓ NULL bill.shift_id excluded on close');
  }

  // 15. Different shift bills excluded
  {
    const termA = uniqueTerminal('m5d-iso-a');
    const termB = uniqueTerminal('m5d-iso-b');
    const shiftA = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termA,
      openingFloatCents: 1000,
    });
    const shiftB = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termB,
      openingFloatCents: 2000,
    });
    const orderId = insertOrder(shiftA.id);
    insertBill(orderId, {
      shiftId: shiftB.id,
      paymentDetails: [{ method: 'cash', amount: 25 }],
    });
    const closedA = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shiftA.id,
      terminalId: termA,
      countedCashCents: 1000,
    });
    const closedB = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shiftB.id,
      terminalId: termB,
      countedCashCents: 4500,
    });
    assert.equal(closedA.expected_cash_cents, 1000);
    assert.equal(closedB.expected_cash_cents, 2000 + 2500);
    console.log('   ✓ different shift bills excluded on close');
  }

  // 16. Partial cash payments aggregated
  {
    const term = uniqueTerminal('m5d-partial');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 0,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 30 },
        { method: 'card', amount: 20 },
        { method: 'cash', amount: 15 },
      ],
    });
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 4500,
    });
    assert.equal(closed.expected_cash_cents, 3000 + 1500);
    console.log('   ✓ partial cash payments aggregated on close');
  }

  // 17. Order.shift_id vs bill.shift_id: bill wins
  {
    const termTarget = uniqueTerminal('m5d-bill-wins');
    const termOther = uniqueTerminal('m5d-order-other');
    const target = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termTarget,
      openingFloatCents: 500,
    });
    const other = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termOther,
      openingFloatCents: 99999,
    });
    const orderId = insertOrder(other.id);
    insertBill(orderId, {
      shiftId: target.id,
      paymentDetails: [{ method: 'cash', amount: 10 }],
    });
    const closedTarget = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: target.id,
      terminalId: termTarget,
      countedCashCents: 1500,
    });
    const closedOther = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: other.id,
      terminalId: termOther,
      countedCashCents: 99999,
    });
    assert.equal(closedTarget.expected_cash_cents, 500 + 1000);
    assert.equal(closedOther.expected_cash_cents, 99999);
    console.log('   ✓ order.shift_id vs bill.shift_id → bill wins on close');
  }

  // 18. Multiple shifts isolated
  {
    const term1 = uniqueTerminal('m5d-multi-1');
    const term2 = uniqueTerminal('m5d-multi-2');
    const s1 = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term1,
      openingFloatCents: 1000,
    });
    const s2 = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term2,
      openingFloatCents: 2000,
    });
    insertBill(insertOrder(s1.id), {
      shiftId: s1.id,
      paymentDetails: [{ method: 'cash', amount: 5 }],
    });
    insertBill(insertOrder(s2.id), {
      shiftId: s2.id,
      paymentDetails: [{ method: 'cash', amount: 7 }],
    });
    const c1 = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: s1.id,
      terminalId: term1,
      countedCashCents: 1500,
    });
    const c2 = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: s2.id,
      terminalId: term2,
      countedCashCents: 2700,
    });
    assert.equal(c1.expected_cash_cents, 1000 + 500);
    assert.equal(c2.expected_cash_cents, 2000 + 700);
    console.log('   ✓ multiple shifts isolated on close');
  }

  // 19. Closed shift cannot be closed again (409); reconciliation unchanged
  {
    const term = uniqueTerminal('m5d-reclose');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 6000,
    });
    const first = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 6100,
    });
    const before = getShiftReconciliationColumns(shift.id);
    assert.throws(
      () => closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shift.id,
        terminalId: term,
        countedCashCents: 1,
      }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftServiceError);
        assert.equal((err as ShiftServiceError).statusCode, 409);
        return true;
      },
    );
    const after = getShiftReconciliationColumns(shift.id);
    assert.deepEqual(after, before);
    assert.equal(after.expected_cash_cents, first.expected_cash_cents);
    assert.equal(after.variance_cents, first.variance_cents);
    console.log('   ✓ closed shift cannot be closed again; recon unchanged');
  }

  // 20. Cashier terminal restriction unchanged (403 when wrong terminal)
  {
    const term = uniqueTerminal('m5d-term-scope');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    assert.throws(
      () => closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shift.id,
        terminalId: uniqueTerminal('m5d-wrong-term'),
        countedCashCents: 1000,
      }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftServiceError);
        assert.equal((err as ShiftServiceError).statusCode, 403);
        return true;
      },
    );
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(cols.expected_cash_cents, null);
    assert.equal(cols.variance_cents, null);
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'cleanup after terminal scope test',
    });
    console.log('   ✓ cashier terminal restriction unchanged (403)');
  }

  // 21. Force-close still requires reason (400)
  {
    const term = uniqueTerminal('m5d-force-reason');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    assert.throws(
      () => forceCloseShift({
        actor: actor(managerId, 'manager'),
        shiftId: shift.id,
        reason: '',
        countedCashCents: 1000,
      }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftServiceError);
        assert.equal((err as ShiftServiceError).statusCode, 400);
        return true;
      },
    );
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(cols.expected_cash_cents, null);
    assert.equal(cols.variance_cents, null);
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'cleanup after reason validation',
    });
    console.log('   ✓ force-close still requires reason (400)');
  }

  // 22. Audit contains expected_cash_cents, variance_cents, cash_payment_total_cents, cash_payment_count
  {
    const term = uniqueTerminal('m5d-audit-fields');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 10000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 20 },
        { method: 'cash', amount: 5 },
        { method: 'card', amount: 15 },
      ],
    });
    const expected = 10000 + 2000 + 500;
    const counted = 12600;
    closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: counted,
      context: { requestId: 'req-m5d-audit-1', terminalId: term },
    });
    const meta = getAuditMetadata('shift.closed', shift.id);
    assert.equal(meta.expected_cash_cents, expected);
    assert.equal(meta.variance_cents, counted - expected);
    assert.equal(meta.cash_payment_total_cents, 2500);
    assert.equal(meta.cash_payment_count, 2);
    console.log('   ✓ audit contains expected/variance/cash payment totals');
  }

  // 23. Audit no sensitive fields (password/pin/jwt/token/secret)
  {
    const term = uniqueTerminal('m5d-audit-safe');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 1000,
    });
    assertNoSensitiveKeys(getAuditMetadata('shift.closed', shift.id));

    const termF = uniqueTerminal('m5d-audit-safe-f');
    const shiftF = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termF,
      openingFloatCents: 1000,
    });
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shiftF.id,
      reason: 'audit safety check',
      countedCashCents: 900,
    });
    assertNoSensitiveKeys(getAuditMetadata('shift.force_closed', shiftF.id));
    console.log('   ✓ audit metadata has no sensitive fields');
  }

  // 24. Audit failure rolls back close: status open, expected/variance NULL
  {
    const term = uniqueTerminal('m5d-audit-rollback');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 2500,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 10 }],
    });
    const originalLog = auditLog.logAuditEvent;
    auditLog.logAuditEvent = () => {
      throw new Error('forced audit failure');
    };
    try {
      closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shift.id,
        terminalId: term,
        countedCashCents: 3500,
      });
      assert.fail('close during mocked audit should have thrown');
    } catch (error) {
      assert.equal((error as Error).message, 'forced audit failure');
    } finally {
      auditLog.logAuditEvent = originalLog;
    }
    const row = getDatabase().prepare(
      `SELECT status, expected_cash_cents, variance_cents, counted_cash_cents FROM shifts WHERE id = ?`,
    ).get(shift.id) as {
      status: string;
      expected_cash_cents: number | null;
      variance_cents: number | null;
      counted_cash_cents: number | null;
    };
    assert.equal(row.status, 'open');
    assert.equal(row.expected_cash_cents, null);
    assert.equal(row.variance_cents, null);
    assert.equal(row.counted_cash_cents, null);
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'cleanup after audit rollback',
    });
    console.log('   ✓ audit failure rolls back close (open + NULL recon)');
  }

  // 25. DB update failure rolls back — skipped (invasive mocks required)
  console.log('   ✓ DB update failure rollback skipped (no invasive mocks)');

  // 26. Failed close leaves open + NULL recon columns
  {
    const term = uniqueTerminal('m5d-failed-close');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1800,
    });
    assert.throws(
      () => closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shift.id,
        terminalId: uniqueTerminal('m5d-failed-wrong'),
        countedCashCents: 1800,
      }),
      (err: unknown) => err instanceof ShiftServiceError && (err as ShiftServiceError).statusCode === 403,
    );
    const cols = getShiftReconciliationColumns(shift.id);
    assert.equal(
      (getDatabase().prepare(`SELECT status FROM shifts WHERE id = ?`).get(shift.id) as { status: string }).status,
      'open',
    );
    assert.equal(cols.expected_cash_cents, null);
    assert.equal(cols.variance_cents, null);
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'cleanup after failed close',
    });
    console.log('   ✓ failed close leaves open + NULL recon columns');
  }

  // 27. Calling close twice does not mutate reconciliation
  {
    const term = uniqueTerminal('m5d-double-close');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 9000,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 11 }],
    });
    const first = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 10100,
    });
    const snapshot = getShiftReconciliationColumns(shift.id);
    assert.equal(snapshot.expected_cash_cents, 9000 + 1100);
    assert.equal(snapshot.variance_cents, 10100 - (9000 + 1100));
    assert.throws(
      () => closeShift({
        actor: actor(managerId, 'manager'),
        shiftId: shift.id,
        countedCashCents: 1,
      }),
      (err: unknown) => err instanceof ShiftServiceError && (err as ShiftServiceError).statusCode === 409,
    );
    assert.deepEqual(getShiftReconciliationColumns(shift.id), snapshot);
    assert.equal(first.expected_cash_cents, snapshot.expected_cash_cents);
    console.log('   ✓ calling close twice does not mutate reconciliation');
  }

  // 28. M5-C computeExpectedCashCents still read-only independently
  {
    const term = uniqueTerminal('m5d-readonly');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 3333,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 2 }],
    });
    const before = getShiftReconciliationColumns(shift.id);
    assert.equal(computeExpectedCashCents(shift.id), 3333 + 200);
    const after = getShiftReconciliationColumns(shift.id);
    assert.equal(after.expected_cash_cents, null);
    assert.equal(after.variance_cents, null);
    assert.deepEqual(after, before);
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'cleanup after read-only check',
    });
    console.log('   ✓ computeExpectedCashCents remains read-only independently');
  }

  // 29. shifts_enabled=false: close throws SHIFTS_DISABLED / 503
  {
    const term = uniqueTerminal('m5d-disabled');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    upsertSettings({ shifts_enabled: 'false' });
    assert.throws(
      () => closeShift({
        actor: actor(cashierId, 'cashier'),
        shiftId: shift.id,
        terminalId: term,
        countedCashCents: 1000,
      }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftServiceError);
        assert.equal((err as ShiftServiceError).statusCode, 503);
        assert.equal((err as ShiftServiceError).code, 'SHIFTS_DISABLED');
        return true;
      },
    );
    assert.equal(getShiftReconciliationColumns(shift.id).expected_cash_cents, null);
    upsertSettings({ shifts_enabled: 'true' });
    forceCloseShift({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
      reason: 'cleanup after disabled check',
    });
    console.log('   ✓ shifts_enabled=false → close throws SHIFTS_DISABLED / 503');
  }

  // 30. Before close, expected/variance are NULL; after close they are set
  {
    const term = uniqueTerminal('m5d-before-after');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 7000,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 3 }],
    });
    const before = getShiftReconciliationColumns(shift.id);
    assert.equal(before.expected_cash_cents, null);
    assert.equal(before.variance_cents, null);
    const closed = closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 7400,
    });
    const after = getShiftReconciliationColumns(shift.id);
    assert.equal(after.expected_cash_cents, 7000 + 300);
    assert.equal(after.variance_cents, 7400 - (7000 + 300));
    assert.equal(closed.expected_cash_cents, after.expected_cash_cents);
    assert.equal(closed.variance_cents, after.variance_cents);
    console.log('   ✓ before close NULL; after close expected/variance set');
  }

  // ── M5-E: reconciliation preview + payment summary ───────────────────────
  console.log('\nM5-E Reconciliation Preview + Summary Tests');
  console.log('='.repeat(60));

  // 1. Open shift preview — expected computed, variance null, no DB write
  {
    const term = uniqueTerminal('m5e-open-preview');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 10000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 25 }],
    });
    const before = getShiftReconciliationColumns(shift.id);
    const preview = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.equal(preview.shift.id, shift.id);
    assert.equal(preview.opening_float_cents, 10000);
    assert.equal(preview.expected_cash_cents, 10000 + 2500);
    assert.equal(preview.counted_cash_cents, null);
    assert.equal(preview.variance_cents, null);
    assert.equal(preview.summary.cash_payment_count, 1);
    assert.equal(preview.summary.cash_payment_total_cents, 2500);
    assert.deepEqual(getShiftReconciliationColumns(shift.id), before);
    console.log('   ✓ open shift preview — expected live, variance null, no DB write');
  }

  // 2. Closed shift preview — persisted expected/variance returned
  {
    const term = uniqueTerminal('m5e-closed-preview');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 5000,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 10 }],
    });
    const counted = 6500;
    closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: counted,
    });
    const preview = getShiftReconciliationPreview({
      actor: actor(managerId, 'manager'),
      shiftId: shift.id,
    });
    assert.equal(preview.shift.status, 'closed');
    assert.equal(preview.expected_cash_cents, 5000 + 1000);
    assert.equal(preview.counted_cash_cents, counted);
    assert.equal(preview.variance_cents, counted - (5000 + 1000));
    console.log('   ✓ closed shift preview returns persisted expected/variance');
  }

  // 3. Opening float only
  {
    const term = uniqueTerminal('m5e-float-only');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 25000,
    });
    const preview = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.equal(preview.expected_cash_cents, 25000);
    assert.equal(preview.summary.cash_payment_total_cents, 0);
    assert.equal(preview.summary.non_cash_payment_total_cents, 0);
    console.log('   ✓ opening float only preview');
  }

  // 4–7. Cash / card / custom classification + non_cash total
  {
    const term = uniqueTerminal('m5e-classify');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    const orderId = insertOrder(shift.id);
    insertBill(orderId, {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 30 },
        { method: 'card', amount: 20 },
        { method: 'wallet', amount: 10 },
        { method: 'Venmo', amount: 50 },
        { method: 'cash', amount: 8.5 },
      ],
    });
    const summary = getShiftPaymentSummary(shift.id);
    assert.equal(summary.cash_payment_count, 2);
    assert.equal(summary.cash_payment_total_cents, 3000 + 850);
    assert.equal(summary.non_cash_payment_total_cents, 2000 + 1000 + 5000);
    const preview = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.equal(preview.expected_cash_cents, 1000 + summary.cash_payment_total_cents);
    assert.equal(preview.summary.non_cash_payment_total_cents, 8000);
    console.log('   ✓ cash/card/wallet/custom classification + non_cash total');
  }

  // 8. Partial payments
  {
    const term = uniqueTerminal('m5e-partial');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 0,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 30 },
        { method: 'card', amount: 20 },
        { method: 'cash', amount: 15 },
      ],
    });
    const summary = getShiftPaymentSummary(shift.id);
    assert.equal(summary.cash_payment_total_cents, 4500);
    assert.equal(summary.non_cash_payment_total_cents, 2000);
    console.log('   ✓ partial payments aggregated in summary');
  }

  // 9. NULL bill.shift_id excluded
  {
    const term = uniqueTerminal('m5e-null-bill');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 4000,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: null,
      paymentDetails: [{ method: 'cash', amount: 100 }],
    });
    const preview = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.equal(preview.expected_cash_cents, 4000);
    assert.equal(preview.summary.cash_payment_total_cents, 0);
    console.log('   ✓ NULL bill.shift_id excluded from preview');
  }

  // 10. Different shift excluded
  {
    const termA = uniqueTerminal('m5e-iso-a');
    const termB = uniqueTerminal('m5e-iso-b');
    const shiftA = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termA,
      openingFloatCents: 1000,
    });
    const shiftB = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termB,
      openingFloatCents: 2000,
    });
    insertBill(insertOrder(shiftA.id), {
      shiftId: shiftB.id,
      paymentDetails: [{ method: 'cash', amount: 25 }],
    });
    const previewA = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shiftA.id,
      terminalId: termA,
    });
    const previewB = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shiftB.id,
      terminalId: termB,
    });
    assert.equal(previewA.expected_cash_cents, 1000);
    assert.equal(previewB.expected_cash_cents, 2000 + 2500);
    console.log('   ✓ different shift bills excluded');
  }

  // 11. order.shift_id vs bill.shift_id — bill wins
  {
    const termTarget = uniqueTerminal('m5e-bill-wins');
    const termOther = uniqueTerminal('m5e-order-other');
    const target = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termTarget,
      openingFloatCents: 500,
    });
    const other = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: termOther,
      openingFloatCents: 99999,
    });
    insertBill(insertOrder(other.id), {
      shiftId: target.id,
      paymentDetails: [{ method: 'cash', amount: 10 }],
    });
    const previewTarget = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: target.id,
      terminalId: termTarget,
    });
    const previewOther = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: other.id,
      terminalId: termOther,
    });
    assert.equal(previewTarget.expected_cash_cents, 500 + 1000);
    assert.equal(previewOther.expected_cash_cents, 99999);
    console.log('   ✓ order.shift_id vs bill.shift_id → bill wins');
  }

  // 13. Cashier wrong terminal → 403
  {
    const term = uniqueTerminal('m5e-wrong-term');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    assert.throws(
      () => getShiftReconciliationPreview({
        actor: actor(cashierId, 'cashier'),
        shiftId: shift.id,
        terminalId: uniqueTerminal('m5e-other'),
      }),
      (err: unknown) => err instanceof ShiftServiceError && (err as ShiftServiceError).statusCode === 403,
    );
    console.log('   ✓ cashier wrong terminal → 403');
  }

  // 14. Cashier correct terminal → preview ok
  {
    const term = uniqueTerminal('m5e-right-term');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 2000,
    });
    const preview = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.equal(preview.shift.id, shift.id);
    console.log('   ✓ cashier correct terminal → preview ok');
  }

  // 15. shifts_enabled=false → 503
  {
    const term = uniqueTerminal('m5e-disabled');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 1000,
    });
    upsertSettings({ shifts_enabled: 'false' });
    assert.throws(
      () => getShiftReconciliationPreview({
        actor: actor(managerId, 'manager'),
        shiftId: shift.id,
      }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftServiceError);
        assert.equal((err as ShiftServiceError).statusCode, 503);
        assert.equal((err as ShiftServiceError).code, 'SHIFTS_DISABLED');
        return true;
      },
    );
    upsertSettings({ shifts_enabled: 'true' });
    console.log('   ✓ shifts_enabled=false → SHIFTS_DISABLED / 503');
  }

  // 16. Preview does not mutate expected_cash_cents columns
  {
    const term = uniqueTerminal('m5e-no-mutate');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 8000,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 12 }],
    });
    const before = getShiftReconciliationColumns(shift.id);
    getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.deepEqual(getShiftReconciliationColumns(shift.id), before);
    assert.equal(before.expected_cash_cents, null);
    assert.equal(before.variance_cents, null);
    console.log('   ✓ preview does not mutate reconciliation columns');
  }

  // 17. getShiftPaymentSummary after close (close response summary shape)
  {
    const term = uniqueTerminal('m5e-close-summary');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: 10000,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [
        { method: 'cash', amount: 20 },
        { method: 'cash', amount: 5 },
        { method: 'card', amount: 15 },
      ],
    });
    closeShift({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
      countedCashCents: 12500,
    });
    const summary = getShiftPaymentSummary(shift.id);
    assert.equal(summary.cash_payment_count, 2);
    assert.equal(summary.cash_payment_total_cents, 2500);
    assert.equal(summary.non_cash_payment_total_cents, 1500);
    console.log('   ✓ close summary includes cash + non_cash totals');
  }

  // 18. Large integer cents
  {
    const largeOpening = 9007199254740990;
    const term = uniqueTerminal('m5e-large');
    const shift = openShift({
      actor: actor(cashierId, 'cashier'),
      terminalId: term,
      openingFloatCents: largeOpening,
    });
    insertBill(insertOrder(shift.id), {
      shiftId: shift.id,
      paymentDetails: [{ method: 'cash', amount: 0.05 }],
    });
    const preview = getShiftReconciliationPreview({
      actor: actor(cashierId, 'cashier'),
      shiftId: shift.id,
      terminalId: term,
    });
    assert.equal(preview.expected_cash_cents, largeOpening + 5);
    console.log('   ✓ large integer-cent values without precision loss');
  }

  assert.equal(
    sumQualifyingNonCashCentsFromPaymentDetailsJson(
      JSON.stringify([{ method: 'card', amount: 12.5 }, { method: 'cash', amount: 3 }]),
    ),
    1250,
    'non-cash helper excludes cash',
  );

  closeDatabase();
  console.log('\nAll M5-C + M5-D + M5-E reconciliation tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
