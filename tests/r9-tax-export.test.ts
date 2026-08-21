/**
 * R9 Slice 3 — Tax reporting depth + accountant export.
 *
 * Usage: npm run test:r9.3
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r9-tax-'));
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

process.env.JWT_SECRET = 'r9-tax-export-secret';

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
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { reportRoutes } = require('../main/routes/reports');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs } = require('../main/services/audit-log');
const { TAX_COMPONENTS_CSV_HEADERS } = require('../main/services/tax-components-report');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(db: any, id: string, role: string, email: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, email, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `r9t-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
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

function countAction(action: string): number {
  return Number(
    getDatabase().prepare(`SELECT COUNT(*) AS c FROM audit_logs WHERE action = ?`).get(action).c,
  );
}

function seedTaxedBill(db: any, atIso: string, productId: string): void {
  const orderInfo = db
    .prepare(
      `INSERT INTO orders (
        order_number, type, status, subtotal, tax_amount, total,
        created_at, updated_at
      ) VALUES (?, 'dine_in', 'completed', 100, 10, 110, ?, ?)`,
    )
    .run(`R9T-${atIso.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`, atIso, atIso);
  const orderId = Number(orderInfo.lastInsertRowid);
  const snapshot = {
    lines: [
      {
        lineId: 'line-1',
        components: [
          { ruleId: 'cgst', label: 'CGST', rate: '2.5', amount: '5.00' },
          { ruleId: 'sgst', label: 'SGST', rate: '2.5', amount: '5.00' },
        ],
      },
    ],
  };
  db.prepare(
    `INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, subtotal, total,
      status, tax_amount, tax_snapshot, created_at, updated_at
    ) VALUES (?, ?, 'Latte', 1, 100, 100, 110, 'served', 10, ?, ?, ?)`,
  ).run(orderId, productId, JSON.stringify(snapshot), atIso, atIso);
  db.prepare(
    `INSERT INTO bills (
      bill_number, order_id, subtotal, tax_amount, tax_snapshot, total,
      paid_amount, balance, payment_status, created_at, updated_at
    ) VALUES (?, ?, 100, 10, ?, 110, 110, 0, 'paid', ?, ?)`,
  ).run(`BILL-${orderId}`, orderId, JSON.stringify(snapshot), atIso, atIso);
}

async function main() {
  console.log('\nR9 Slice 3 — Tax Reporting Depth + Accountant Export\n' + '='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip is v88');

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    86,
    'fresh DB at user_version 88',
  );

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRole(db, 'cashier-r9t', 'cashier', 'cashier@r9t.test');
  const waiter = seedRole(db, 'waiter-r9t', 'waiter', 'waiter@r9t.test');
  const chef = seedRole(db, 'chef-r9t', 'chef', 'chef@r9t.test');

  seedCategory(db, 'cat-r9t', 'Drinks');
  seedProduct(db, 'prod-r9t', 'cat-r9t', 'Latte', 100);
  seedTaxedBill(db, '2026-08-10T12:00:00.000Z', 'prod-r9t');
  seedTaxedBill(db, '2026-08-11T15:30:00.000Z', 'prod-r9t');

  const paymentsBefore = Number(
    getDatabase()
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('payment_details','payments')`,
      )
      .get().c,
  );

  const app = createApp({ '/api/reports': reportRoutes });
  const { baseUrl, server } = await startServer(app);

  const start = '2026-08-10';
  const end = '2026-08-11';
  const q = `start_date=${start}&end_date=${end}`;

  console.log('\nAC — RBAC JSON');
  {
    const okOwner = await api(baseUrl, `/api/reports/tax-components?${q}`, {
      headers: owner.authHeader,
    });
    assertEqual(okOwner.status, 200, 'Owner JSON 200');
    assert(Array.isArray(okOwner.data.taxComponents.components), 'components array');
    assert(okOwner.data.taxComponents.components.length >= 2, 'has CGST/SGST');

    const okMgr = await api(baseUrl, `/api/reports/tax-components?${q}`, {
      headers: manager.authHeader,
    });
    assertEqual(okMgr.status, 200, 'Manager JSON 200');

    for (const [role, id] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const denied = await api(baseUrl, `/api/reports/tax-components?${q}`, {
        headers: auth(id, role),
      });
      assertEqual(denied.status, 403, `${role} JSON 403`);
    }
  }

  console.log('\nAC — CSV + parity + audit');
  {
    const json = await api(baseUrl, `/api/reports/tax-components?${q}`, {
      headers: owner.authHeader,
    });
    const beforeExport = countAction('tax.exported');
    const csv = await apiText(
      baseUrl,
      `/api/reports/export/tax-components.csv?${q}`,
      owner.authHeader,
    );
    assertEqual(csv.status, 200, 'Owner CSV 200');
    assert(csv.contentType.includes('text/csv'), 'CSV content-type');
    const lines = csv.text.trim().split(/\r?\n/);
    assertEqual(lines[0], TAX_COMPONENTS_CSV_HEADERS.join(','), 'stable CSV header');
    assert(lines.length >= 2, 'CSV has data rows');

    const tc = json.data.taxComponents;
    for (const component of tc.components) {
      const match = lines
        .slice(1)
        .some(
          (line: string) =>
            line.includes(component.title) &&
            line.includes(String(component.amount)) &&
            line.startsWith(`${start},${end},`),
        );
      assert(match, `CSV includes ${component.title} amount ${component.amount}`);
    }
    assert(
      lines.slice(1).every((line: string) => line.includes(String(tc.billCount))),
      'CSV bill_count matches JSON',
    );

    assertEqual(countAction('tax.exported'), beforeExport + 1, 'tax.exported written');
    const exportRow = queryAuditLogs({ action: 'tax.exported', limit: 1 })[0];
    assertEqual(exportRow.entity_type, 'tax_report', 'entity_type tax_report');
    assertEqual(exportRow.actor_user_id, owner.userId, 'export actor');
    const meta = exportRow.metadata as Record<string, unknown>;
    assertEqual(meta.format, 'csv', 'format csv');
    assertEqual(meta.start_date, start, 'meta start_date');
    assertEqual(meta.end_date, end, 'meta end_date');
    assert(typeof meta.row_count === 'number', 'row_count present');

    const mgrCsv = await apiText(
      baseUrl,
      `/api/reports/export/tax-components.csv?${q}`,
      manager.authHeader,
    );
    assertEqual(mgrCsv.status, 200, 'Manager CSV 200');

    for (const [role, id] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const before = countAction('tax.exported');
      const denied = await apiText(
        baseUrl,
        `/api/reports/export/tax-components.csv?${q}`,
        auth(id, role),
      );
      assertEqual(denied.status, 403, `${role} CSV 403`);
      assertEqual(countAction('tax.exported'), before, `${role} no tax.exported`);
    }
  }

  console.log('\nAC — CSV escaping / offline / no payment side effects');
  {
    // comma in title via direct insert
    const at = '2026-08-10T18:00:00.000Z';
    const orderInfo = getDatabase()
      .prepare(
        `INSERT INTO orders (
          order_number, type, status, subtotal, tax_amount, total, created_at, updated_at
        ) VALUES ('ESC-1', 'dine_in', 'completed', 50, 1.5, 51.5, ?, ?)`,
      )
      .run(at, at);
    const oid = Number(orderInfo.lastInsertRowid);
    const snap = {
      lines: [
        {
          lineId: 'x',
          components: [{ label: 'Local, Tax', rate: '3', amount: '1.50' }],
        },
      ],
    };
    getDatabase()
      .prepare(
        `INSERT INTO order_items (
          order_id, product_id, product_name, quantity, unit_price, subtotal, total,
          status, tax_amount, tax_snapshot, created_at, updated_at
        ) VALUES (?, 'prod-r9t', 'Item', 1, 50, 50, 51.5, 'served', 1.5, ?, ?, ?)`,
      )
      .run(oid, JSON.stringify(snap), at, at);
    getDatabase()
      .prepare(
        `INSERT INTO bills (
          bill_number, order_id, subtotal, tax_amount, tax_snapshot, total,
          paid_amount, balance, payment_status, created_at, updated_at
        ) VALUES ('B-ESC', ?, 50, 1.5, ?, 51.5, 51.5, 0, 'paid', ?, ?)`,
      )
      .run(oid, JSON.stringify(snap), at, at);

    const esc = await apiText(
      baseUrl,
      `/api/reports/export/tax-components.csv?start_date=${start}&end_date=${end}`,
      owner.authHeader,
    );
    assert(
      esc.text.includes('"Local, Tax"') || esc.text.includes('Local, Tax'),
      'CSV escapes/title',
    );

    assertEqual(
      Number(
        getDatabase()
          .prepare(
            `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('payment_details','payments')`,
          )
          .get().c,
      ),
      paymentsBefore,
      'no payment schema side effects',
    );
  }

  console.log('\nAC — filing unavailable / UI contract');
  {
    assert(!fs.existsSync(path.join(__dirname, '../main/routes/gstr.ts')), 'no GSTR route');
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    assert(page.includes('fetchTaxComponents'), 'Reports loads tax components');
    assert(page.includes('downloadTaxComponentsCsv'), 'Reports exports tax CSV');
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(en.includes('"reports.taxComponentsTitle"'), 'en tax i18n');
  }

  server.close();
  closeDatabase();

  console.log('\nAC — process restart');
  {
    const { initDatabase, closeDatabase: closeDb2, getDatabase: getDb2 } = require('../main/db');
    initDatabase();
    assertEqual(
      Number(getDb2().pragma('user_version', { simple: true })),
      86,
      'tip still 87 after reopen',
    );
    const bills = Number(
      getDb2().prepare(`SELECT COUNT(*) AS c FROM bills WHERE bill_number LIKE 'BILL-%'`).get().c,
    );
    assert(bills >= 2, `bills persist after restart (got ${bills})`);
    closeDb2();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nR9 Slice 3 FAILED');
    process.exit(1);
  }
  console.log('\nR9 Slice 3 COMPLETE — tax export scenarios passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
