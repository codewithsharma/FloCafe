/**
 * R9 Slice 2 — Financial Audit-Trail Hardening.
 *
 * Usage: npm run test:r9.2
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r9-audit-'));
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

process.env.JWT_SECRET = 'r9-audit-trail-secret';

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

const { auditLogRoutes } = require('../main/routes/audit-logs');
const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs } = require('../main/services/audit-log');
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
    { userId, email: `${role}@test.local`, role, jti: `r9a-${userId}` },
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

async function main() {
  console.log('\nR9 Slice 2 — Financial Audit-Trail Hardening\n' + '='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip is v88');

  const db = initTestDb();
  assertEqual(
    Number(db.pragma('user_version', { simple: true })),
    86,
    'fresh DB at user_version 88',
  );
  assert(
    !!db.prepare(`SELECT name FROM sqlite_master WHERE name='audit_logs'`).get(),
    'audit_logs table exists',
  );

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashier = seedRole(db, 'cashier-r9a', 'cashier', 'cashier@r9a.test');
  const waiter = seedRole(db, 'waiter-r9a', 'waiter', 'waiter@r9a.test');
  const chef = seedRole(db, 'chef-r9a', 'chef', 'chef@r9a.test');

  const tEarly = '2026-01-01T10:00:00.000Z';
  const tMid = '2026-01-02T12:00:00.000Z';
  const tLate = '2026-01-03T14:00:00.000Z';

  const seedActions = [
    { action: 'payment.received', entityType: 'bill', entityId: 'bill-1', at: tEarly },
    { action: 'payment.refunded', entityType: 'refund', entityId: 'ref-1', at: tMid },
    { action: 'expense.created', entityType: 'expense', entityId: 'exp-1', at: tMid },
    { action: 'day.closed', entityType: 'day_close', entityId: '2026-01-02', at: tLate },
    { action: 'order.cancelled', entityType: 'order', entityId: 'ord-1', at: tLate },
    { action: 'auth.login.success', entityType: 'auth', entityId: owner.userId, at: tEarly },
  ];

  for (const row of seedActions) {
    getDatabase()
      .prepare(
        `INSERT INTO audit_logs (
          actor_user_id, action, entity_type, entity_id, result, reason,
          metadata_json, terminal_id, request_id, created_at
        ) VALUES (?, ?, ?, ?, 'success', NULL, ?, NULL, NULL, ?)`,
      )
      .run(
        owner.userId,
        row.action,
        row.entityType,
        row.entityId,
        JSON.stringify({ seeded: true, note: 'r9.2' }),
        row.at,
      );
  }

  const paymentsBefore = Number(
    getDatabase()
      .prepare(
        `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('payment_details','payments')`,
      )
      .get().c,
  );

  const app = createApp({
    '/api/audit-logs': auditLogRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  console.log('\nAC — list RBAC');
  {
    const okOwner = await api(baseUrl, '/api/audit-logs?limit=50', {
      headers: owner.authHeader,
    });
    assertEqual(okOwner.status, 200, 'Owner list 200');
    assert(Array.isArray(okOwner.data.audit), 'Owner list has audit array');
    assert(okOwner.data.audit.length >= 5, 'Owner sees seeded rows');

    const okMgr = await api(baseUrl, '/api/audit-logs?limit=50', {
      headers: manager.authHeader,
    });
    assertEqual(okMgr.status, 200, 'Manager list 200');

    for (const [role, id] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const denied = await api(baseUrl, '/api/audit-logs', {
        headers: auth(id, role),
      });
      assertEqual(denied.status, 403, `${role} list 403`);
    }
  }

  console.log('\nAC — filters');
  {
    const byAction = await api(baseUrl, '/api/audit-logs?action=payment.received', {
      headers: owner.authHeader,
    });
    assertEqual(byAction.status, 200, 'filter action 200');
    assert(
      byAction.data.audit.every((r: any) => r.action === 'payment.received'),
      'action filter exact',
    );
    assertEqual(byAction.data.audit.length, 1, 'one payment.received');

    const byEntity = await api(baseUrl, '/api/audit-logs?entity_type=expense', {
      headers: owner.authHeader,
    });
    assert(
      byEntity.data.audit.every((r: any) => r.entity_type === 'expense'),
      'entity_type filter',
    );

    const byActor = await api(baseUrl, `/api/audit-logs?actor_user_id=${owner.userId}`, {
      headers: owner.authHeader,
    });
    assert(
      byActor.data.audit.every((r: any) => r.actor_user_id === owner.userId),
      'actor filter',
    );

    const windowed = await api(
      baseUrl,
      `/api/audit-logs?since=${encodeURIComponent(tMid)}&until=${encodeURIComponent(tMid)}`,
      { headers: owner.authHeader },
    );
    assertEqual(windowed.status, 200, 'since+until 200');
    assert(
      windowed.data.audit.every((r: any) => r.created_at === tMid),
      'time window inclusive',
    );
    assert(
      windowed.data.audit.some((r: any) => r.action === 'expense.created'),
      'window includes expense.created',
    );
  }

  console.log('\nAC — financial events visible');
  {
    const all = await api(baseUrl, '/api/audit-logs?limit=100', {
      headers: owner.authHeader,
    });
    const actions = new Set(all.data.audit.map((r: any) => r.action));
    for (const required of [
      'payment.received',
      'payment.refunded',
      'expense.created',
      'day.closed',
      'order.cancelled',
    ]) {
      assert(actions.has(required), `visible ${required}`);
    }
  }

  console.log('\nAC — CSV export');
  {
    const beforeExport = countAction('audit.exported');
    const csv = await apiText(
      baseUrl,
      '/api/audit-logs/export.csv?action=expense.created',
      owner.authHeader,
    );
    assertEqual(csv.status, 200, 'Owner CSV 200');
    assert(csv.contentType.includes('text/csv'), 'CSV content-type');
    const lines = csv.text.trim().split(/\r?\n/);
    assertEqual(
      lines[0],
      'id,created_at,actor_user_id,actor_name,action,entity_type,entity_id,result,reason,metadata_json,terminal_id,request_id',
      'stable CSV header',
    );
    assert(lines.length >= 2, 'CSV has data row');
    assert(
      lines.some((l) => l.includes('expense.created')),
      'CSV contains expense.created',
    );
    assert(
      lines.slice(1).every((l) => l.includes('expense.created')),
      'CSV respects action filter',
    );
    assert(csv.text.includes('seeded'), 'metadata preserved');

    assertEqual(countAction('audit.exported'), beforeExport + 1, 'audit.exported written');
    const exportRow = queryAuditLogs({ action: 'audit.exported', limit: 1 })[0];
    assertEqual(exportRow.entity_type, 'audit_log', 'export entity_type');
    assertEqual(exportRow.actor_user_id, owner.userId, 'export actor');
    const meta = exportRow.metadata as Record<string, unknown>;
    assertEqual(meta.format, 'csv', 'export format csv');
    assert(typeof meta.row_count === 'number', 'row_count present');
    assert(meta.filters && typeof meta.filters === 'object', 'filters summary');

    const mgrCsv = await apiText(baseUrl, '/api/audit-logs/export.csv?limit=5', manager.authHeader);
    assertEqual(mgrCsv.status, 200, 'Manager CSV 200');

    for (const [role, id] of [
      ['cashier', cashier],
      ['waiter', waiter],
      ['chef', chef],
    ] as const) {
      const before = countAction('audit.exported');
      const denied = await apiText(baseUrl, '/api/audit-logs/export.csv', auth(id, role));
      assertEqual(denied.status, 403, `${role} export 403`);
      assertEqual(countAction('audit.exported'), before, `${role} no audit.exported`);
    }
  }

  console.log('\nAC — offline local SQLite');
  {
    const local = queryAuditLogs({ action: 'payment.received', limit: 5 });
    assertEqual(local.length, 1, 'local SQLite query works without cloud');
  }

  assertEqual(
    Number(
      getDatabase()
        .prepare(
          `SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name IN ('payment_details','payments')`,
        )
        .get().c,
    ),
    paymentsBefore,
    'no payment table schema side effects',
  );

  server.close();
  closeDatabase();

  console.log('\nAC — process restart persistence');
  {
    const { initDatabase, closeDatabase: closeDb2, getDatabase: getDb2 } = require('../main/db');
    initDatabase();
    const count = Number(getDb2().prepare(`SELECT COUNT(*) AS c FROM audit_logs`).get().c);
    assert(count >= 6, `audit rows persist after restart (got ${count})`);
    const payment = getDb2()
      .prepare(`SELECT action FROM audit_logs WHERE action = 'payment.received'`)
      .get();
    assert(!!payment, 'payment.received survives restart');
    assertEqual(getSupportedSchemaVersion(), 88, 'tip still 87 after reopen');
    closeDb2();
  }

  console.log('\nAC — UI / i18n source contract');
  {
    const nav = fs.readFileSync(
      path.join(__dirname, '../frontend/src/config/navigation.ts'),
      'utf8',
    );
    assert(nav.includes("href: '/audit'"), 'nav has /audit');
    assert(nav.includes("id: 'audit'"), 'nav audit id');
    const page = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/audit/page.tsx'),
      'utf8',
    );
    assert(page.includes('export'), 'audit page has export');
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(en.includes('"flo.nav.audit"'), 'en audit nav key');
    assert(en.includes('"audit.title"'), 'en audit title');
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nR9 Slice 2 FAILED');
    process.exit(1);
  }
  console.log('\nR9 Slice 2 COMPLETE — audit-trail scenarios passed');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
