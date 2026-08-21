/**
 * PRINT-HEALTH — Printer health & recovery UX.
 * Usage: npm run test:print-health
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-print-health-'));
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

process.env.JWT_SECRET = 'print-health-secret';

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

const { getSupportedSchemaVersion } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { printerRoutes } = require('../main/routes/printers');
const {
  claimJobForRetry,
  enqueueBillPrintFailure,
  getPrintHealth,
  PrintQueueError,
} = require('../main/services/print-queue');
const { queryAuditLogs } = require('../main/services/audit-log');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `ph-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function seedRole(db: any, id: string, role: string): string {
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, role, `${id}@test.local`, bcrypt.hashSync('Pass1234!', 10), role, now(), now());
  return id;
}

function listenPrinterSink(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket: any) => {
      socket.on('data', () => undefined);
      socket.end();
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        port: addr.port,
        close: () =>
          new Promise((res, rej) => {
            server.close((err: Error | undefined) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

async function main() {
  console.log('PRINT-HEALTH — Printer health & recovery');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getSupportedSchemaVersion(), 88, 'schema tip remains v88');

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedRole(db, 'cashier-ph', 'cashier');
  seedRole(db, 'waiter-ph', 'waiter');
  seedRole(db, 'chef-ph', 'chef');
  seedCategory(db, 'cat-ph', 'Print Health');
  seedProduct(db, 'prod-ph', 'cat-ph', 'Health Burger', 500);

  // Healthy baseline — no jobs; may be degraded if no default printer
  let health = getPrintHealth();
  assertEqual(health.queue.open_count, 0, 'no open jobs');
  assert(
    health.overall === 'healthy' || health.overall === 'degraded',
    `baseline overall without jobs (${health.overall})`,
  );
  if (!health.default_printer.present) {
    assertEqual(health.overall, 'degraded', 'missing default → degraded');
  } else {
    assertEqual(health.overall, 'healthy', 'default + empty queue → healthy');
  }

  // Seed default printer (healthy config)
  const sink = await listenPrinterSink();
  db.prepare(`UPDATE printers SET is_default = 0`).run();
  db.prepare(
    `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
     VALUES ('ptr-ph-1', 'Health Printer', 'network', '127.0.0.1', ?, 1, '80mm', ?, ?)`,
  ).run(sink.port, now(), now());

  health = getPrintHealth();
  assertEqual(health.overall, 'healthy', 'default present + empty → healthy');
  assertEqual(health.default_printer.present, true, 'default present');

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/printers': printerRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      body: { type: 'takeaway', items: [{ product_id: 'prod-ph', quantity: 1 }] },
      headers: { ...owner.authHeader, 'Idempotency-Key': `ph-o-${Date.now()}` },
    });
    assertEqual(order.status, 201, 'order');
    const bill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      body: { order_id: order.data.order.id },
      headers: owner.authHeader,
    });
    assertEqual(bill.status, 201, 'bill');
    const billId = bill.data.bill.id;
    const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
      method: 'POST',
      body: { method: 'cash', amount: bill.data.bill.total },
      headers: { ...owner.authHeader, 'Idempotency-Key': `ph-pay-${billId}` },
    });
    assertEqual(pay.status, 200, 'paid');

    // Force print failure — dead port
    db.prepare(`UPDATE printers SET is_default = 0`).run();
    db.prepare(
      `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
       VALUES ('ptr-ph-dead', 'Dead', 'network', '127.0.0.1', 1, 1, '80mm', ?, ?)`,
    ).run(now(), now());

    const printFail = await api(baseUrl, '/api/printers/print-bill', {
      method: 'POST',
      body: { billId },
      headers: owner.authHeader,
    });
    assert(printFail.status >= 400, `print fail (${printFail.status})`);
    assert(!!printFail.data.print_job_id, 'print_job_id returned');

    health = getPrintHealth();
    assertEqual(health.overall, 'degraded', 'open retryable job → degraded');
    assert(health.queue.failed_count >= 1, 'failed_count');
    assert(health.queue.retryable_count >= 1, 'retryable_count');
    assertEqual(health.jobs[0].last_error?.includes('stack'), false, 'no stack in sanitized error');

    // API health RBAC
    const ownerH = await api(baseUrl, '/api/printers/health', { headers: owner.authHeader });
    assertEqual(ownerH.status, 200, 'owner health');
    assertEqual(ownerH.data.health.overall, 'degraded', 'API overall');

    const mgrH = await api(baseUrl, '/api/printers/health', { headers: manager.authHeader });
    assertEqual(mgrH.status, 200, 'manager health');

    for (const [id, role] of [
      ['cashier-ph', 'cashier'],
      ['waiter-ph', 'waiter'],
      ['chef-ph', 'chef'],
    ] as const) {
      const denied = await api(baseUrl, '/api/printers/health', { headers: auth(id, role) });
      assertEqual(denied.status, 403, `${role} health denied`);
      const deniedRetry = await api(baseUrl, `/api/printers/jobs/${printFail.data.print_job_id}/retry`, {
        method: 'POST',
        headers: auth(id, role),
      });
      assertEqual(deniedRetry.status, 403, `${role} retry denied`);
    }

    // Concurrent claim protection
    const openJobId = printFail.data.print_job_id as string;
    const claimed = claimJobForRetry(openJobId);
    assertEqual(claimed.status, 'pending', 'claim → pending');
    let busy = false;
    try {
      claimJobForRetry(openJobId);
    } catch (e: any) {
      busy = e instanceof PrintQueueError && e.code === 'PRINT_JOB_BUSY';
    }
    assert(busy, 'second claim → PRINT_JOB_BUSY');
    // Restore to failed for recovery path
    db.prepare(
      `UPDATE print_jobs SET status = 'failed', updated_at = ? WHERE id = ?`,
    ).run(now(), openJobId);

    // Point default printer at live sink and recover
    db.prepare(`UPDATE printers SET is_default = 0`).run();
    db.prepare(
      `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
       VALUES ('ptr-ph-sink', 'Sink', 'network', '127.0.0.1', ?, 1, '80mm', ?, ?)`,
    ).run(sink.port, now(), now());

    const retry = await api(baseUrl, `/api/printers/jobs/${openJobId}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(retry.status, 200, 'retry success');
    assertEqual(retry.data.job.status, 'done', 'job done');

    health = getPrintHealth();
    assertEqual(health.overall, 'healthy', 'recovery clears unhealthy');
    assertEqual(health.queue.open_count, 0, 'no open after recovery');

    // Retry completed → 409
    const again = await api(baseUrl, `/api/printers/jobs/${openJobId}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(again.status, 409, 'done not retryable');

    // Exhausted → error overall
    const jobEx = enqueueBillPrintFailure({
      billId,
      orderId: order.data.order.id,
      lastError: 'still down',
      maxAttempts: 1,
    });
    health = getPrintHealth();
    assertEqual(health.overall, 'error', 'exhausted → error');
    assert(health.queue.exhausted_count >= 1, 'exhausted counted');
    const exRetry = await api(baseUrl, `/api/printers/jobs/${jobEx.id}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(exRetry.status, 409, 'exhausted retry 409');

    // Missing job
    const missing = await api(baseUrl, '/api/printers/jobs/no-such-job/retry', {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(missing.status, 404, 'missing job 404');

    // Audits present for retry path
    const audits = queryAuditLogs({ action: 'print_job.retry_succeeded', limit: 10 });
    assert(
      Array.isArray(audits) && audits.some((a: any) => a.action === 'print_job.retry_succeeded'),
      'retry success audited',
    );

    // FE contracts
    const panel = fs.readFileSync(
      path.join(__dirname, '../frontend/src/components/settings/PrinterHealthPanel.tsx'),
      'utf8',
    );
    const lib = fs.readFileSync(
      path.join(__dirname, '../frontend/src/lib/printer-health.ts'),
      'utf8',
    );
    const settings = fs.readFileSync(
      path.join(__dirname, '../frontend/src/app/(dashboard)/settings/page.tsx'),
      'utf8',
    );
    const en = fs.readFileSync(path.join(__dirname, '../frontend/src/lib/i18n/en.json'), 'utf8');
    assert(lib.includes('fetchPrinterHealth'), 'FE lib health');
    assert(lib.includes('retryPrintJob'), 'FE lib retry');
    assert(panel.includes('retryingId'), 'double-click guard');
    assert(settings.includes('PrinterHealthPanel'), 'settings wired');
    assert(en.includes('settings.printHealthTitle'), 'i18n');

    console.log('\nAll PRINT-HEALTH checks passed.');
  } finally {
    server.close();
    await sink.close();
    closeDatabase();
  }

  const results = getResults();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
