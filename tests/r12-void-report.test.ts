/**
 * R12 — Void / Cancel report (period JSON + CSV).
 *
 * Usage: npm run test:r12
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r12-void-'));
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

process.env.JWT_SECRET = 'r12-void-report-secret';

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedManagerUser,
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
const { queryAuditLogs, logAuditEvent } = require('../main/services/audit-log');
const {
  VOIDS_CSV_HEADERS,
  queryVoidCancelReport,
} = require('../main/services/void-cancel-report');
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
    { userId, email: `${role}@test.local`, role, jti: `r12-${userId}` },
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

function seedVoidAudits(ownerId: string): void {
  // Inside window
  logAuditEvent({
    actorUserId: ownerId,
    action: 'order.cancelled',
    entityType: 'order',
    entityId: 101,
    result: 'success',
    reason: 'Customer left',
    metadata: { previous_status: 'pending' },
  });
  getDatabase()
    .prepare(`UPDATE audit_logs SET created_at = ? WHERE id = (SELECT MAX(id) FROM audit_logs)`)
    .run('2026-08-10T12:00:00.000Z');

  logAuditEvent({
    actorUserId: ownerId,
    action: 'order.item_cancelled',
    entityType: 'order_item',
    entityId: 201,
    result: 'success',
    metadata: {
      order_id: 102,
      product_id: 'prod-1',
      product_name: 'Latte',
      previous_status: 'pending',
    },
  });
  getDatabase()
    .prepare(`UPDATE audit_logs SET created_at = ? WHERE id = (SELECT MAX(id) FROM audit_logs)`)
    .run('2026-08-11T09:30:00.000Z');

  logAuditEvent({
    actorUserId: ownerId,
    action: 'order.item_voided',
    entityType: 'order_item',
    entityId: 202,
    result: 'success',
    metadata: {
      order_id: 103,
      product_id: 'prod-2',
      product_name: 'Espresso, Large',
      previous_status: 'preparing',
    },
  });
  getDatabase()
    .prepare(`UPDATE audit_logs SET created_at = ? WHERE id = (SELECT MAX(id) FROM audit_logs)`)
    .run('2026-08-11T15:00:00.000Z');

  // Outside window
  logAuditEvent({
    actorUserId: ownerId,
    action: 'order.cancelled',
    entityType: 'order',
    entityId: 999,
    result: 'success',
    metadata: { previous_status: 'pending' },
  });
  getDatabase()
    .prepare(`UPDATE audit_logs SET created_at = ? WHERE id = (SELECT MAX(id) FROM audit_logs)`)
    .run('2026-08-01T12:00:00.000Z');

  // Failure must be excluded
  logAuditEvent({
    actorUserId: ownerId,
    action: 'order.item_voided',
    entityType: 'order_item',
    entityId: 303,
    result: 'failure',
    metadata: { order_id: 104, product_name: 'Should not appear' },
  });
  getDatabase()
    .prepare(`UPDATE audit_logs SET created_at = ? WHERE id = (SELECT MAX(id) FROM audit_logs)`)
    .run('2026-08-11T16:00:00.000Z');
}

async function main() {
  console.log('\nR12 — Void / Cancel Report\n' + '='.repeat(60));

  const tip = getSupportedSchemaVersion();
  assert(tip >= 84, `schema tip >= 84 (got ${tip})`);

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    tip,
    `fresh DB at user_version ${tip}`,
  );

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRole(db, 'cashier-r12', 'cashier', 'cashier@r12.test');
  const waiter = seedRole(db, 'waiter-r12', 'waiter', 'waiter@r12.test');
  const chef = seedRole(db, 'chef-r12', 'chef', 'chef@r12.test');

  seedVoidAudits(owner.userId);

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

  console.log('\nAC — service summary from audit_logs');
  {
    const report = queryVoidCancelReport(getDatabase(), start, end);
    assertEqual(report.total_count, 3, 'three success events in window');
    assertEqual(report.order_cancelled_count, 1, 'one order cancel');
    assertEqual(report.item_cancelled_count, 1, 'one item cancel');
    assertEqual(report.item_voided_count, 1, 'one item void');
    assert(
      !report.events.some((e: { product_name: string | null }) => e.product_name === 'Should not appear'),
      'failure excluded',
    );
  }

  console.log('\nAC — RBAC JSON');
  {
    const okOwner = await api(baseUrl, `/api/reports/voids?${q}`, {
      headers: owner.authHeader,
    });
    assertEqual(okOwner.status, 200, 'Owner JSON 200');
    assertEqual(okOwner.data.voids.total_count, 3, 'owner total_count');
    assert(Array.isArray(okOwner.data.voids.events), 'events array');
    assert(Array.isArray(okOwner.data.voids.by_action), 'by_action array');

    const okMgr = await api(baseUrl, `/api/reports/voids?${q}`, {
      headers: manager.authHeader,
    });
    assertEqual(okMgr.status, 200, 'Manager JSON 200');

    for (const [role, id] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const denied = await api(baseUrl, `/api/reports/voids?${q}`, {
        headers: auth(id, role),
      });
      assertEqual(denied.status, 403, `${role} JSON 403`);
    }
  }

  console.log('\nAC — CSV + parity + audit');
  {
    const json = await api(baseUrl, `/api/reports/voids?${q}`, {
      headers: owner.authHeader,
    });
    const beforeExport = countAction('report.voids_exported');
    const csv = await apiText(baseUrl, `/api/reports/export/voids.csv?${q}`, owner.authHeader);
    assertEqual(csv.status, 200, 'Owner CSV 200');
    assert(csv.contentType.includes('text/csv'), 'CSV content-type');
    const lines = csv.text.trim().split(/\r?\n/);
    assertEqual(lines[0], VOIDS_CSV_HEADERS.join(','), 'stable CSV header');
    assertEqual(lines.length - 1, json.data.voids.total_count, 'CSV row count matches JSON');

    for (const event of json.data.voids.events) {
      const match = lines.slice(1).some((line: string) => line.includes(String(event.id)));
      assert(match, `CSV includes event id ${event.id}`);
    }
    assert(
      csv.text.includes('"Espresso, Large"') || csv.text.includes('Espresso, Large'),
      'CSV escapes product name with comma',
    );

    assertEqual(countAction('report.voids_exported'), beforeExport + 1, 'report.voids_exported');
    const exportRow = queryAuditLogs({ action: 'report.voids_exported', limit: 1 })[0];
    assertEqual(exportRow.entity_type, 'void_report', 'entity_type void_report');
    assertEqual(exportRow.actor_user_id, owner.userId, 'export actor');
    const meta = exportRow.metadata as Record<string, unknown>;
    assertEqual(meta.format, 'csv', 'format csv');
    assertEqual(meta.start_date, start, 'meta start_date');
    assertEqual(meta.end_date, end, 'meta end_date');
    assertEqual(meta.row_count, 3, 'meta row_count');

    const mgrCsv = await apiText(
      baseUrl,
      `/api/reports/export/voids.csv?${q}`,
      manager.authHeader,
    );
    assertEqual(mgrCsv.status, 200, 'Manager CSV 200');

    for (const [role, id] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const before = countAction('report.voids_exported');
      const denied = await apiText(
        baseUrl,
        `/api/reports/export/voids.csv?${q}`,
        auth(id, role),
      );
      assertEqual(denied.status, 403, `${role} CSV 403`);
      assertEqual(countAction('report.voids_exported'), before, `${role} no export audit`);
    }
  }

  console.log('\nAC — bad range / offline / no side effects');
  {
    const bad = await api(baseUrl, `/api/reports/voids?start_date=2026-08-12&end_date=2026-08-10`, {
      headers: owner.authHeader,
    });
    assertEqual(bad.status, 400, 'inverted range 400');

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

  console.log('\nAC — UI contract + no advanced BI');
  {
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/reports/page.tsx'),
      'utf8',
    );
    assert(page.includes('fetchVoidCancelReport'), 'Reports loads voids');
    assert(page.includes('downloadVoidsCsv'), 'Reports exports voids CSV');
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(en.includes('"reports.voidsTitle"'), 'en voids i18n');
    assert(
      !fs.existsSync(path.join(__dirname, '../main/services/bi-warehouse.ts')),
      'no BI warehouse',
    );
  }

  server.close();
  closeDatabase();

  console.log('\nAC — process restart');
  {
    const { initDatabase, closeDatabase: closeDb2, getDatabase: getDb2 } = require('../main/db');
    initDatabase();
    assertEqual(
      Number(getDb2().pragma('user_version', { simple: true })),
      tip,
      `tip still ${tip} after reopen`,
    );
    const voids = Number(
      getDb2()
        .prepare(
          `SELECT COUNT(*) AS c FROM audit_logs WHERE action IN ('order.cancelled','order.item_cancelled','order.item_voided') AND result = 'success'`,
        )
        .get().c,
    );
    assert(voids >= 3, `void audits persist after restart (got ${voids})`);
    closeDb2();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nR12 FAILED');
    process.exit(1);
  }
  console.log('\nR12 COMPLETE — void/cancel report scenarios passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
