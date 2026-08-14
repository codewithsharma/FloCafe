/**
 * Phase 4.4 — Accounting CSV export (backend).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.4-accounting-csv-export.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-phase-44-csv-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'phase-44-csv-export-test-secret';

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

const { toCsvRow } = require('../main/lib/csv');
const {
  MAX_BILLS_CSV_RANGE_DAYS,
  validateBillsCsvDateRange,
  summarizePaymentDetails,
  formatMoneyDecimal,
  BillsCsvExportError,
  BILLS_CSV_HEADERS,
} = require('../main/services/bills-csv-export');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { refundRoutes } = require('../main/routes/refunds');
const { reportRoutes } = require('../main/routes/reports');
const { utcTodayDate } = require('../main/db');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function seedCashierUser(db: any): { authHeader: Record<string, string> } {
  const { getJWTSecret } = require('../main/routes/auth');
  const userId = 'cashier-phase44-001';
  const passwordHash = bcrypt.hashSync('testpass123', 10);
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, 'Test Cashier', 'cashier@test.local', passwordHash, 'cashier', 1, now(), now());
  const token = jwt.sign({ userId, email: 'cashier@test.local', role: 'cashier' }, getJWTSecret(), {
    expiresIn: '1h',
  });
  return { authHeader: { Authorization: `Bearer ${token}` } };
}

async function fetchCsv(
  baseUrl: string,
  urlPath: string,
  headers: Record<string, string>,
): Promise<{
  status: number;
  text: string;
  contentType: string | null;
  disposition: string | null;
}> {
  const response = await (globalThis as any).fetch(baseUrl + urlPath, { headers });
  const text = await response.text();
  return {
    status: response.status,
    text,
    contentType: response.headers.get('content-type'),
    disposition: response.headers.get('content-disposition'),
  };
}

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      const fields: string[] = [];
      let field = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
          if (char === '"' && line[i + 1] === '"') {
            field += '"';
            i++;
          } else if (char === '"') {
            inQuotes = false;
          } else {
            field += char;
          }
        } else if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          fields.push(field);
          field = '';
        } else {
          field += char;
        }
      }
      fields.push(field);
      return fields;
    });
}

function assertThrows(label: string, fn: () => void, expectedMessage: string) {
  try {
    fn();
    assert(false, `${label} should throw`);
  } catch (error: any) {
    assertEqual(error.message, expectedMessage, label);
  }
}

async function main() {
  console.log('Phase 4.4 Accounting CSV export');
  console.log('='.repeat(60));

  // ── Unit: CSV serializer ────────────────────────────────────────────────
  assertEqual(toCsvRow(['a', 'b']), 'a,b', 'simple row');
  assertEqual(toCsvRow(['hello,world']), '"hello,world"', 'comma quoting');
  assertEqual(toCsvRow(['say "hi"']), '"say ""hi"""', 'quote escaping');
  assertEqual(toCsvRow(['line1\nline2']), '"line1\nline2"', 'newline quoting');

  // ── Unit: formatMoneyDecimal ────────────────────────────────────────────
  assertEqual(formatMoneyDecimal(10), '10.00', 'integer money');
  assertEqual(formatMoneyDecimal(10.5), '10.50', 'fractional money');
  assertEqual(formatMoneyDecimal(null), '0.00', 'null money');

  // ── Unit: summarizePaymentDetails ───────────────────────────────────────
  const multi = summarizePaymentDetails(
    JSON.stringify([
      { method: 'card', amount: 60 },
      { method: 'cash', amount: 40 },
    ]),
  );
  assertEqual(multi.paymentsReceived, 100, 'payments received sum');
  assertEqual(multi.paymentSummary, 'card:60.00|cash:40.00', 'payment summary sorted by method');

  // ── Unit: validateBillsCsvDateRange ─────────────────────────────────────
  assertThrows(
    'malformed start',
    () => validateBillsCsvDateRange('2026-13-01', '2026-01-31'),
    'start_date must use YYYY-MM-DD format',
  );
  assertThrows(
    'malformed end',
    () => validateBillsCsvDateRange('2026-01-01', '01-31-2026'),
    'end_date must use YYYY-MM-DD format',
  );
  assertThrows(
    'reversed range',
    () => validateBillsCsvDateRange('2026-02-01', '2026-01-01'),
    'start_date must be on or before end_date',
  );
  assertThrows(
    'range too long',
    () => validateBillsCsvDateRange('2026-01-01', '2026-04-05'),
    `Date range cannot exceed ${MAX_BILLS_CSV_RANGE_DAYS} days`,
  );
  const ok = validateBillsCsvDateRange('2026-01-01', '2026-04-03');
  assertEqual(ok.startDate, '2026-01-01', 'valid start');
  assertEqual(ok.endDate, '2026-04-03', 'valid end');

  // ── Frontend contracts ──────────────────────────────────────────────────
  console.log('\nFrontend contracts');
  const exportLib = readFrontend('lib/accounting-csv-export.ts');
  assert(exportLib.includes('downloadBillsCsvExport'), 'client exports downloadBillsCsvExport');
  assert(exportLib.includes("'/reports/export/bills.csv'"), 'client hits bills.csv export route');
  assert(exportLib.includes('start_date'), 'client sends start_date param');
  assert(exportLib.includes('end_date'), 'client sends end_date param');
  assert(exportLib.includes("responseType: 'blob'"), 'client requests blob response');
  assert(exportLib.includes('content-disposition'), 'client parses Content-Disposition');
  assert(exportLib.includes('operavia-sales-'), 'client has default filename fallback');
  assert(exportLib.includes('throw new Error'), 'client throws server error message');
  console.log('   ✓ accounting-csv-export client contract');

  const reportsPage = readFrontend('app/(dashboard)/reports/page.tsx');
  assert(
    reportsPage.includes('downloadBillsCsvExport') || reportsPage.includes('accounting-csv-export'),
    'reports page imports CSV export helper',
  );
  assert(reportsPage.includes('reports.exportCsv'), 'reports page labels Export CSV button');
  assert(reportsPage.includes('exportingCsv'), 'reports page has exporting loading state');
  assert(reportsPage.includes('reports.exportCsvSuccess'), 'reports page shows success toast');
  assert(reportsPage.includes('reports.exportCsvFailed'), 'reports page shows error toast');
  assert(
    reportsPage.includes("role === 'owner'") || reportsPage.includes('canView'),
    'reports page gates export to owner/manager',
  );
  console.log('   ✓ reports page Export CSV wired');

  for (const [label, rel] of [
    ['en', 'lib/i18n/en.json'],
    ['es', 'lib/i18n/es.json'],
    ['pt', 'lib/i18n/pt.json'],
  ] as const) {
    const src = fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
    assert(src.includes('"reports.exportCsv"'), `${label} reports.exportCsv`);
    assert(src.includes('"reports.exportCsvSuccess"'), `${label} reports.exportCsvSuccess`);
    assert(src.includes('"reports.exportCsvFailed"'), `${label} reports.exportCsvFailed`);
    assert(src.includes('"reports.exportingCsv"'), `${label} reports.exportingCsv`);
  }
  console.log('   ✓ i18n export keys');

  // ── HTTP integration ────────────────────────────────────────────────────
  const db = initTestDb();
  db.prepare(
    "INSERT INTO payment_methods (name, is_active, sort_order, created_at, updated_at) VALUES ('UPI', 1, 10, ?, ?)",
  ).run(now(), now());

  const { authHeader: ownerAuth } = seedOwnerUser(db);
  const { authHeader: managerAuth } = seedManagerUser(db);
  const { authHeader: cashierAuth } = seedCashierUser(db);
  seedCategory(db, 'cat-p44', 'CSV Menu');
  seedProduct(db, 'prod-p44-1', 'cat-p44', 'CSV Latte', 1000);
  seedProduct(db, 'prod-p44-2', 'cat-p44', 'CSV Muffin', 500);

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/reports': reportRoutes,
  });
  app.use('/api/bills', refundRoutes);
  app.use('/api/refunds', refundRoutes);

  const { baseUrl, server } = await startServer(app);

  try {
    const today = utcTodayDate();

    // Auth: cashier forbidden, owner allowed
    const cashierRes = await fetchCsv(
      baseUrl,
      `/api/reports/export/bills.csv?start_date=${today}&end_date=${today}`,
      cashierAuth,
    );
    assertEqual(cashierRes.status, 403, 'cashier export forbidden');

    const ownerProbe = await fetchCsv(
      baseUrl,
      `/api/reports/export/bills.csv?start_date=${today}&end_date=${today}`,
      ownerAuth,
    );
    assertEqual(ownerProbe.status, 200, 'owner export allowed');
    assert(ownerProbe.contentType?.includes('text/csv'), 'csv content type');
    assert(
      ownerProbe.disposition?.includes(`operavia-sales-${today}-to-${today}.csv`),
      'csv attachment filename',
    );

    // Empty range (future dates)
    const emptyRes = await fetchCsv(
      baseUrl,
      '/api/reports/export/bills.csv?start_date=2099-01-01&end_date=2099-01-02',
      ownerAuth,
    );
    assertEqual(emptyRes.status, 200, 'empty range 200');
    const emptyRows = parseCsv(emptyRes.text);
    assertEqual(emptyRows.length, 1, 'empty range header only');
    assertEqual(emptyRows[0].join(','), BILLS_CSV_HEADERS.join(','), 'stable header order');

    // One bill export
    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-p44-1', quantity: 1 }] },
      headers: managerAuth,
    });
    assertEqual(order.status, 201, 'order created');
    const saleTotal = Number(order.data.order.total);

    const bill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: order.data.order.id },
      headers: managerAuth,
    });
    assertEqual(bill.status, 201, 'bill created');
    const billId = bill.data.bill.id;

    const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: saleTotal },
      headers: managerAuth,
    });
    assertEqual(pay.status, 200, 'single payment accepted');

    const singleRes = await fetchCsv(
      baseUrl,
      `/api/reports/export/bills.csv?start_date=${today}&end_date=${today}`,
      ownerAuth,
    );
    assertEqual(singleRes.status, 200, 'single bill export 200');
    const singleRows = parseCsv(singleRes.text);
    assertEqual(singleRows.length, 2, 'header + one bill');
    const singleHeader = singleRows[0];
    const singleData = singleRows[1];
    const col = (name: string) => singleHeader.indexOf(name);
    assertEqual(singleData[col('bill_id')], String(billId), 'bill_id column');
    assertEqual(Number(singleData[col('gross_sales')]), saleTotal, 'gross_sales');
    assertEqual(Number(singleData[col('net_sales')]), saleTotal, 'net_sales');
    assertEqual(Number(singleData[col('payments_received')]), saleTotal, 'payments_received');
    assertEqual(
      singleData[col('payment_summary')],
      `cash:${formatMoneyDecimal(saleTotal)}`,
      'payment_summary',
    );

    // Partial refund
    const refundAmount = Math.round(saleTotal * 30) / 100;
    const refund = await api(baseUrl, `/api/bills/${billId}/refund`, {
      method: 'POST',
      body: {
        amount: refundAmount,
        method: 'cash',
        reason: 'CSV export fixture',
        override_pin: '1234',
      },
      headers: { ...managerAuth, 'Idempotency-Key': `p44-refund-${billId}` },
    });
    assertEqual(refund.status, 200, 'partial refund ok');

    const refundRes = await fetchCsv(
      baseUrl,
      `/api/reports/export/bills.csv?start_date=${today}&end_date=${today}`,
      ownerAuth,
    );
    const refundRows = parseCsv(refundRes.text);
    const refundData = refundRows[1];
    assertEqual(Number(refundData[col('refunds')]), refundAmount, 'refunds column');
    assertEqual(
      Number(refundData[col('net_sales')]),
      Math.round((saleTotal - refundAmount) * 100) / 100,
      'net_sales after refund',
    );
    assertEqual(
      Number(refundData[col('payments_received')]),
      saleTotal,
      'payments_received unchanged by refund',
    );
    assertEqual(refundData[col('bill_status')], 'partially_refunded', 'bill_status');

    // Multi-payment bill
    const orderMulti = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-p44-2', quantity: 2 }] },
      headers: managerAuth,
    });
    assertEqual(orderMulti.status, 201, 'multi order created');
    const multiTotal = Number(orderMulti.data.order.total);

    const billMulti = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: orderMulti.data.order.id },
      headers: managerAuth,
    });
    assertEqual(billMulti.status, 201, 'multi bill created');
    const multiBillId = billMulti.data.bill.id;
    const partial = Math.floor(multiTotal * 0.6);

    const pay1 = await api(baseUrl, `/api/bills/${multiBillId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: partial },
      headers: managerAuth,
    });
    assertEqual(pay1.status, 200, 'multi first payment');

    const pay2 = await api(baseUrl, `/api/bills/${multiBillId}/payment`, {
      method: 'POST',
      body: { method: 'upi', amount: multiTotal - partial },
      headers: managerAuth,
    });
    assertEqual(pay2.status, 200, 'multi second payment');

    const multiRes = await fetchCsv(
      baseUrl,
      `/api/reports/export/bills.csv?start_date=${today}&end_date=${today}`,
      ownerAuth,
    );
    const multiRows = parseCsv(multiRes.text);
    const multiData = multiRows.find((row) => row[col('bill_id')] === String(multiBillId));
    assert(multiData, 'multi-payment bill row present');
    assertEqual(
      Number(multiData![col('payments_received')]),
      multiTotal,
      'multi payments_received',
    );
    assertEqual(
      multiData![col('payment_summary')],
      `cash:${formatMoneyDecimal(partial)}|UPI:${formatMoneyDecimal(multiTotal - partial)}`,
      'multi payment_summary',
    );

    // Missing date params
    const missingStart = await api(baseUrl, '/api/reports/export/bills.csv?end_date=2026-01-01', {
      headers: ownerAuth,
    });
    assertEqual(missingStart.status, 400, 'missing start_date rejected');
    assertEqual(missingStart.data.error, 'start_date is required', 'missing start_date message');

    const missingEnd = await api(baseUrl, '/api/reports/export/bills.csv?start_date=2026-01-01', {
      headers: ownerAuth,
    });
    assertEqual(missingEnd.status, 400, 'missing end_date rejected');
    assertEqual(missingEnd.data.error, 'end_date is required', 'missing end_date message');

    // Range validation via HTTP
    const badRange = await api(
      baseUrl,
      '/api/reports/export/bills.csv?start_date=2026-01-01&end_date=2026-05-01',
      { headers: ownerAuth },
    );
    assertEqual(badRange.status, 400, 'oversized range rejected');
    assertEqual(
      badRange.data.error,
      `Date range cannot exceed ${MAX_BILLS_CSV_RANGE_DAYS} days`,
      'oversized range message',
    );

    void BillsCsvExportError;
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
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Phase 4.4 accounting CSV export tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
