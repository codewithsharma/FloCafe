/**
 * R15 S1 — Simulation foundation: normal sale → close → Z → local backup.
 *
 * Banner: SIMULATION ≠ OPS-02 SIGNED CAFÉ PILOT
 * A green run proves deterministic CI/local automation on clean userdata.
 * It does NOT equal live café site readiness, signed RC, or OPS-02 PASS.
 *
 * Usage: npm run test:r15
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r15-sim-s1-'));
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

process.env.JWT_SECRET = 'r15-sim-s1-secret';

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
  assertIncludes,
  getResults,
  closeDatabase,
} = require('./helpers/test-setup');

const { upsertSettings, businessDateInTimezone } = require('../main/db');
const { setMasterPin } = require('../main/services/master-pin');
const { openShift, closeShift, computeExpectedCashCents } = require('../main/services/shift');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { reportRoutes } = require('../main/routes/reports');
const { databaseRoutes } = require('../main/routes/database');

const cafe = require('./fixtures/restaurant-sim/s1-cafe.json');
const printerSink = require('./fixtures/restaurant-sim/printer-sink.json');

/** In-memory mock printer sink — does not touch printers.ts / real devices. */
const mockPrinterSink: { jobs: Array<{ kind: string; at: string }> } = {
  jobs: [...(printerSink.captures || [])],
};

function moneyToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

async function apiText(
  baseUrl: string,
  urlPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string; contentType: string }> {
  const response = await (globalThis as any).fetch(baseUrl + urlPath, { headers });
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: String(response.headers.get('content-type') || ''),
  };
}

async function main() {
  console.log('R15 S1 — Simulation foundation (normal sale → Z → backup)');
  console.log('='.repeat(60));
  console.log(`BANNER: ${cafe.banner}`);
  console.log('SIMULATION ≠ OPS-02 SIGNED CAFÉ PILOT\n');

  const db = initTestDb();
  upsertSettings({
    timezone: cafe.timezone,
    shifts_enabled: 'true',
    require_open_shift_for_cash: 'false',
    business_name: cafe.name,
  });
  setMasterPin(cafe.master_pin);

  const owner = seedOwnerUser(db);
  seedCategory(db, cafe.category.id, cafe.category.name);
  seedProduct(db, cafe.product.id, cafe.category.id, cafe.product.name, cafe.product.price);

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
    '/api/db': databaseRoutes,
  });
  const { baseUrl, server } = await startServer(app);
  const terminalHeader = { 'X-Flo-Terminal-Id': cafe.terminal_id };
  const actor = { userId: owner.userId, role: 'owner' };

  try {
    // ── 1. Open shift ─────────────────────────────────────────────────
    console.log('1. Open shift');
    const shift = openShift({
      actor,
      terminalId: cafe.terminal_id,
      openingFloatCents: cafe.opening_float_cents,
    });
    assert(shift.id > 0, `shift opened (id=${shift.id})`);
    assertEqual(shift.status, 'open', 'shift status is open');

    // ── 2. Create order ───────────────────────────────────────────────
    console.log('\n2. Create order');
    const createRes = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { ...owner.authHeader, ...terminalHeader },
      body: {
        type: cafe.order.type,
        items: [{ product_id: cafe.product.id, quantity: cafe.order.quantity }],
      },
    });
    assertEqual(createRes.status, 201, 'order created (201)');
    const orderId = createRes.data.order.id;
    assert(orderId > 0, `order id=${orderId}`);
    const orderTotal = Number(createRes.data.order.total);
    assert(orderTotal > 0, `order total > 0 (${orderTotal})`);

    // ── 3. Generate bill + pay ────────────────────────────────────────
    console.log('\n3. Generate bill and pay (cash)');
    const billRes = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: owner.authHeader,
      body: { order_id: orderId },
    });
    assertEqual(billRes.status, 201, 'bill generated (201)');
    const billId = billRes.data.bill.id;
    const billTotal = Number(billRes.data.bill.total);
    assertEqual(billTotal, orderTotal, 'bill total matches order total');

    const payRes = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      headers: {
        ...owner.authHeader,
        ...terminalHeader,
        'Idempotency-Key': 'sim-s1-pay-1',
      },
      body: { method: 'cash', amount: billTotal },
    });
    assertEqual(payRes.status, 200, 'payment accepted (200)');
    assertEqual(payRes.data.bill.payment_status, 'paid', 'bill payment_status=paid');
    assertEqual(Number(payRes.data.bill.balance), 0, 'bill balance=0');

    // Mock receipt sink (no printers.ts / thermal hardware)
    mockPrinterSink.jobs.push({ kind: 'receipt-deferred', at: new Date().toISOString() });
    assertEqual(mockPrinterSink.jobs.length, 1, 'mock printer sink recorded deferred receipt job');
    assertEqual(printerSink.device_required, false, 'fixture printer sink requires no device');

    // ── 4. Close shift ────────────────────────────────────────────────
    console.log('\n4. Close shift');
    const expectedCash = computeExpectedCashCents(shift.id);
    const cashCents = moneyToCents(billTotal);
    assertEqual(
      expectedCash,
      cafe.opening_float_cents + cashCents,
      `expected cash = float + payment (${expectedCash})`,
    );
    const closed = closeShift({
      actor,
      shiftId: shift.id,
      terminalId: cafe.terminal_id,
      countedCashCents: expectedCash,
    });
    assertEqual(closed.status, 'closed', 'shift status is closed');
    assertEqual(closed.variance_cents, 0, 'shift variance is 0');

    // ── 5. Day-close + Z export ───────────────────────────────────────
    console.log('\n5. Day-close and Z text export');
    const businessDate = businessDateInTimezone(cafe.timezone);
    const dayCloseRes = await api(baseUrl, '/api/reports/day-close', {
      method: 'POST',
      headers: owner.authHeader,
      body: { business_date: businessDate },
    });
    assertEqual(dayCloseRes.status, 201, 'day-close created (201)');
    assertEqual(
      dayCloseRes.data.summary.business_date,
      businessDate,
      `day-close business_date=${businessDate}`,
    );
    assertEqual(dayCloseRes.data.summary.shift_count, 1, 'day-close includes 1 shift');
    assertEqual(
      dayCloseRes.data.summary.cash_payment_total_cents,
      cashCents,
      `day-close cash_payment_total_cents=${cashCents}`,
    );

    const zRes = await apiText(
      baseUrl,
      `/api/reports/day-close/${businessDate}/export/z.txt`,
      owner.authHeader,
    );
    assertEqual(zRes.status, 200, 'Z txt export (200)');
    assertIncludes(zRes.contentType, 'text/plain', 'Z content-type is text/plain');
    assertIncludes(zRes.text, 'DAY CLOSE Z', 'Z text includes DAY CLOSE Z banner');
    assertIncludes(zRes.text, businessDate, 'Z text includes business date');

    // ── 6. Local backup via API ───────────────────────────────────────
    console.log('\n6. Local backup create API');
    const backupRes = await api(baseUrl, '/api/db/backup', {
      method: 'POST',
      headers: owner.authHeader,
      body: { master_pin: cafe.master_pin },
    });
    assertEqual(backupRes.status, 200, 'backup API 200');
    assertEqual(backupRes.data.success, true, 'backup success=true');
    assert(Boolean(backupRes.data.path || backupRes.data.filename), 'backup path/filename present');
    if (backupRes.data.path) {
      assert(fs.existsSync(backupRes.data.path), `backup file exists (${backupRes.data.path})`);
    }

    console.log('\nS1 foundation covered: open shift → order → pay → close → day-close/Z → backup');
    console.log('Gaps (documented): KDS companion, real receipt thermal print, S2–S10 packs');
  } finally {
    server.close();
    closeDatabase();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const { passed, failed, total } = getResults();
  console.log(`\nResults: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('R15 S1 simulation foundation PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
