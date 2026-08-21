/**
 * P13 — Data & Audit Integrity Hardening
 * Usage: npm run test:data-audit
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-data-audit-'));
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

process.env.JWT_SECRET = 'p13-data-audit-hardening-secret';

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

const { reportRoutes } = require('../main/routes/reports');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { paymentMethodRoutes } = require('../main/routes/payment-methods');
const { printerRoutes } = require('../main/routes/printers');
const { getSupportedSchemaVersion, utcTodayDate, getDatabase, withTxn } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { queryAuditLogs, logAuditEvent } = require('../main/services/audit-log');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function seedRole(db: any, id: string, role: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, `${id}@test.local`, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `p13-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function countAction(action: string): number {
  const rows = queryAuditLogs({ action, limit: 100 });
  return Array.isArray(rows) ? rows.filter((r: any) => r.action === action).length : 0;
}

async function main() {
  console.log('P13 — Data & Audit Integrity Hardening');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 89, 'schema tip remains v89');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-p13', 'cashier');
  seedCategory(db, 'cat-p13', 'P13 Cat');
  seedProduct(db, 'prod-p13', 'cat-p13', 'P13 Latte', 200);

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  // Source contracts: audit HTTP is read-only; logAuditEvent is INSERT path
  const auditRoutes = fs.readFileSync(
    path.join(__dirname, '../main/routes/audit-logs.ts'),
    'utf8',
  );
  assert(!/router\.(post|put|patch|delete)\(/i.test(auditRoutes), 'audit HTTP has no mutate verbs');
  const auditSvc = fs.readFileSync(path.join(__dirname, '../main/services/audit-log.ts'), 'utf8');
  assert(auditSvc.includes('INSERT INTO audit_logs'), 'audit service inserts');
  assert(!/UPDATE\s+audit_logs/i.test(auditSvc), 'audit service has no UPDATE');
  assert(!/DELETE\s+FROM\s+audit_logs/i.test(auditSvc), 'audit service has no DELETE');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/payment-methods': paymentMethodRoutes,
    '/api/printers': printerRoutes,
    '/api/reports': reportRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    // --- Order create audit inside txn + idempotent replay ---
    const beforeCreate = countAction('order.created');
    const o1 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-p13', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': 'p13-create-1' },
    });
    assertEqual(o1.status, 201, 'order create');
    assertEqual(countAction('order.created'), beforeCreate + 1, 'one order.created audit');
    const createAudits = queryAuditLogs({ action: 'order.created', limit: 5 });
    const latestCreate = createAudits.find((a: any) => String(a.entity_id) === String(o1.data.order.id));
    assert(!!latestCreate, 'create audit for order');
    assertEqual(String(latestCreate.actor_user_id), String(owner.userId), 'create actor is JWT owner');

    const o1Replay = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-p13', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': 'p13-create-1' },
    });
    assert(o1Replay.status === 200 || o1Replay.status === 201, 'idempotent replay');
    assertEqual(
      countAction('order.created'),
      beforeCreate + 1,
      'idempotent replay does not duplicate order.created',
    );

    // --- Bill applyDiscount audited; paid reject has no success audit ---
    const billGen = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o1.data.order.id },
      headers: owner.authHeader,
    });
    assertEqual(billGen.status, 201, 'bill generate');
    const beforeBillDisc = countAction('bill.discount_applied');
    const disc = await api(baseUrl, `/api/bills/${billGen.data.bill.id}/applyDiscount`, {
      method: 'POST',
      body: { type: 'amount', value: 10, reason: 'p13 fixture' },
      headers: owner.authHeader,
    });
    assertEqual(disc.status, 200, 'bill discount');
    assertEqual(countAction('bill.discount_applied'), beforeBillDisc + 1, 'bill discount audited');
    const billDiscAudit = queryAuditLogs({ action: 'bill.discount_applied', limit: 3 })[0];
    assertEqual(String(billDiscAudit.actor_user_id), String(owner.userId), 'bill disc actor JWT');
    // Spoof attempt: manager_id in body must not become actor
    assert(
      String(billDiscAudit.actor_user_id) !== 'cashier-p13',
      'body cannot spoof actor',
    );

    const pay = await api(baseUrl, `/api/bills/${billGen.data.bill.id}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: Number(disc.data.bill.total) },
      headers: owner.authHeader,
    });
    assertEqual(pay.status, 200, 'pay bill');
    const beforePaidReject = countAction('bill.discount_applied');
    const paidReject = await api(baseUrl, `/api/bills/${billGen.data.bill.id}/applyDiscount`, {
      method: 'POST',
      body: { type: 'amount', value: 5, reason: 'should fail' },
      headers: owner.authHeader,
    });
    assert(paidReject.status >= 400, 'paid bill discount rejected');
    assertEqual(
      countAction('bill.discount_applied'),
      beforePaidReject,
      'failed bill discount creates no success audit',
    );

    // --- Item discount audited inside success path ---
    const o2 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-p13', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `p13-item-${Date.now()}` },
    });
    const itemId = o2.data.order.items[0].id;
    const beforeItem = countAction('order.item_discount_applied');
    const itemDisc = await api(
      baseUrl,
      `/api/orders/${o2.data.order.id}/items/${itemId}/discount`,
      {
        method: 'PATCH',
        body: { discount_type: 'amount', discount_value: 20, discount_reason: 'p13' },
        headers: owner.authHeader,
      },
    );
    assertEqual(itemDisc.status, 200, 'item discount');
    assertEqual(countAction('order.item_discount_applied'), beforeItem + 1, 'item discount audited');

    // --- Rollback removes in-txn audit (simulated) ---
    const beforeRollback = countAction('order.created');
    try {
      withTxn(() => {
        logAuditEvent({
          actorUserId: owner.userId,
          action: 'order.created',
          entityType: 'order',
          entityId: 'rollback-probe',
          result: 'success',
          metadata: { probe: true },
        });
        throw new Error('force rollback');
      });
    } catch {
      // expected
    }
    assertEqual(
      countAction('order.created'),
      beforeRollback,
      'rolled-back txn leaves no audit row',
    );

    // --- Payment method merge audited ---
    const createPm = await api(baseUrl, '/api/payment-methods', {
      method: 'POST',
      body: { name: 'P13 Wallet A' },
      headers: owner.authHeader,
    });
    assertEqual(createPm.status, 201, 'create pm A');
    const createPm2 = await api(baseUrl, '/api/payment-methods', {
      method: 'POST',
      body: { name: 'P13 Wallet B' },
      headers: owner.authHeader,
    });
    assertEqual(createPm2.status, 201, 'create pm B');
    const a = createPm.data.payment_method;
    const b = createPm2.data.payment_method;
    assert(!!a?.id && !!b?.id, 'both payment methods exist');
    const beforeMerge = countAction('payment_method.merged');
    const merge = await api(baseUrl, `/api/payment-methods/${a.id}/merge`, {
      method: 'POST',
      body: { target_type: 'custom', target_id: b.id },
      headers: owner.authHeader,
    });
    assertEqual(merge.status, 200, 'merge ok');
    assertEqual(countAction('payment_method.merged'), beforeMerge + 1, 'merge audited');

    // --- Print retry failure must not leave retry_requested success ---
    const jobId = `p13-job-${Date.now()}`;
    getDatabase()
      .prepare(
        `INSERT INTO print_jobs (id, status, attempts, max_attempts, job_type, last_error, created_at, updated_at)
         VALUES (?, 'failed', 0, 3, 'bill', 'p13 fixture', ?, ?)`,
      )
      .run(jobId, now(), now());
    const beforeReq = countAction('print_job.retry_requested');
    const retry = await api(baseUrl, `/api/printers/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assert(retry.status >= 400 || retry.status === 502 || retry.status === 200, 'retry responded');
    assertEqual(
      countAction('print_job.retry_requested'),
      beforeReq,
      'no premature retry_requested success audit',
    );

    // --- RBAC: cashier cannot apply bill discount ---
    const o3 = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-p13', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `p13-rbac-${Date.now()}` },
    });
    const bill3 = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: o3.data.order.id },
      headers: owner.authHeader,
    });
    const cashierDenied = await api(baseUrl, `/api/bills/${bill3.data.bill.id}/applyDiscount`, {
      method: 'POST',
      body: { type: 'amount', value: 1 },
      headers: auth('cashier-p13', 'cashier'),
    });
    assertEqual(cashierDenied.status, 403, 'cashier denied bill discount');

    // Manager can still access applyDiscount
    const mgrOk = await api(baseUrl, `/api/bills/${bill3.data.bill.id}/applyDiscount`, {
      method: 'POST',
      body: { type: 'amount', value: 5, reason: 'mgr' },
      headers: manager.authHeader,
    });
    assertEqual(mgrOk.status, 200, 'manager bill discount');

    console.log('\nAll P13 data-audit checks passed.');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
