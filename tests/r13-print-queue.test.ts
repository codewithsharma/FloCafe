/**
 * R13 — Print queue / retry (durable outbox thin slice).
 *
 * Usage: npm run test:r13
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r13-print-'));
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

process.env.JWT_SECRET = 'r13-print-queue-secret';

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
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function auth(userId: string, role: string): Record<string, string> {
  const token = jwt.sign(
    { userId, email: `${role}@test.local`, role, jti: `r13-${userId}` },
    getJWTSecret(),
    { expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function seedCashier(db: any): string {
  const id = 'cashier-r13';
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, 'Cashier', 'cashier-r13@test.local', ?, 'cashier', 1, ?, ?)`,
  ).run(id, bcrypt.hashSync('Pass1234!', 10), now(), now());
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
            server.close((err: Error | null) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

async function createPaidBill(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
): Promise<{ orderId: number; billId: number }> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers: authHeader,
  });
  assertEqual(order.status, 201, 'order created');
  const orderId = order.data.order.id as number;
  const bill = await api(baseUrl, '/api/bills/generate', {
    method: 'POST',
    body: { order_id: orderId },
    headers: authHeader,
  });
  assertEqual(bill.status, 201, 'bill generated');
  const billId = bill.data.bill.id as number;
  const pay = await api(baseUrl, `/api/bills/${billId}/payment`, {
    method: 'POST',
    body: { method: 'cash', amount: bill.data.bill.total },
    headers: { ...authHeader, 'Idempotency-Key': `r13-pay-${billId}` },
  });
  assertEqual(pay.status, 200, 'bill paid');
  return { orderId, billId };
}

function setDeadPrinter(db: any, id: string): void {
  db.prepare(`UPDATE printers SET is_default = 0`).run();
  db.prepare(
    `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
     VALUES (?, ?, 'network', '127.0.0.1', 1, 1, '80mm', ?, ?)`,
  ).run(id, `Dead ${id}`, now(), now());
}

function setSinkPrinter(db: any, id: string, port: number): void {
  db.prepare(`UPDATE printers SET is_default = 0`).run();
  db.prepare(
    `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
     VALUES (?, ?, 'network', '127.0.0.1', ?, 1, '80mm', ?, ?)`,
  ).run(id, `Sink ${id}`, port, now(), now());
}

async function main(): Promise<void> {
  console.log('\nR13 — Print queue / retry');
  console.log('='.repeat(60));

  assertEqual(getSupportedSchemaVersion(), 86, 'schema tip is v86');
  initTestDb();
  const db = getDatabase();
  assertEqual(Number(db.pragma('user_version', { simple: true })), 86, 'fresh DB tip 86');

  const cols = (
    db.prepare(`PRAGMA table_info(print_jobs)`).all() as { name: string }[]
  ).map((c) => c.name);
  for (const col of [
    'id',
    'status',
    'attempts',
    'max_attempts',
    'job_type',
    'bill_id',
    'order_id',
    'payload_json',
    'last_error',
    'created_at',
    'updated_at',
    'completed_at',
  ]) {
    assert(cols.includes(col), `print_jobs.${col} column exists`);
  }

  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  const cashierId = seedCashier(db);
  seedCategory(db, 'cat-r13', 'R13 Cat');
  seedProduct(db, 'prod-r13', 'cat-r13', 'R13 Latte', 100);
  const productId = 'prod-r13';

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/printers': printerRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\nR13-01 failed print-bill enqueues print_jobs (no silent drop)');
    const { billId, orderId } = await createPaidBill(baseUrl, owner.authHeader, productId);
    setDeadPrinter(db, 'prn-r13-dead-1');

    const beforeLogs = (
      db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
        n: number;
      }
    ).n;
    const printRes = await api(baseUrl, '/api/printers/print-bill', {
      method: 'POST',
      body: { billId },
      headers: owner.authHeader,
    });
    assert(printRes.status >= 400, `failed print returns error (got ${printRes.status})`);
    assertEqual(
      (
        db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
          n: number;
        }
      ).n,
      beforeLogs,
      'failed print does not write print_logs',
    );

    const job = db
      .prepare(
        `SELECT * FROM print_jobs WHERE bill_id = ? AND status IN ('pending','failed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(billId) as any;
    assert(!!job, 'failed print creates print_jobs row');
    assertEqual(job.job_type, 'bill', 'job_type is bill');
    assertEqual(Number(job.order_id), Number(orderId), 'order_id stored');
    assert(Number(job.attempts) >= 1, 'attempts >= 1 after failure');
    assert(
      job.status === 'failed' || job.status === 'pending',
      `status is pending|failed (got ${job.status})`,
    );
    assert(!!job.last_error, 'last_error recorded');
    const jobId = String(job.id);

    console.log('\nR13-02 GET /jobs Owner/Manager; cashier denied');
    const listOwner = await api(baseUrl, '/api/printers/jobs', { headers: owner.authHeader });
    assertEqual(listOwner.status, 200, 'owner lists jobs');
    assert(
      Array.isArray(listOwner.data.jobs) &&
        listOwner.data.jobs.some((j: any) => j.id === jobId),
      'failed job listed',
    );
    assert(
      listOwner.data.jobs.every((j: any) => j.status === 'pending' || j.status === 'failed'),
      'list only pending/failed',
    );

    const listMgr = await api(baseUrl, '/api/printers/jobs', { headers: manager.authHeader });
    assertEqual(listMgr.status, 200, 'manager lists jobs');

    const listCashier = await api(baseUrl, '/api/printers/jobs', {
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(listCashier.status, 403, 'cashier cannot list jobs');

    console.log('\nR13-03 retry success writes print_logs and marks done');
    const sink = await listenPrinterSink();
    try {
      setSinkPrinter(db, 'prn-r13-sink', sink.port);
      const retryOk = await api(baseUrl, `/api/printers/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: manager.authHeader,
      });
      assertEqual(retryOk.status, 200, 'retry succeeds');
      assertEqual(retryOk.data.job.status, 'done', 'job marked done');
      assert(!!retryOk.data.job.completed_at, 'completed_at set');

      const logs = (
        db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
          n: number;
        }
      ).n;
      assert(logs >= 1, 'print_logs written on retry success');

      const done = db.prepare(`SELECT status, attempts FROM print_jobs WHERE id = ?`).get(jobId) as {
        status: string;
        attempts: number;
      };
      assertEqual(done.status, 'done', 'DB status done');
      assert(Number(done.attempts) >= 2, 'attempts incremented on retry');
    } finally {
      await sink.close();
    }

    console.log('\nR13-04 retry of done job rejected');
    const retryDone = await api(baseUrl, `/api/printers/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(retryDone.status, 409, 'cannot retry done job');

    console.log('\nR13-05 retry failure increments attempts / stays failed');
    const paid2 = await createPaidBill(baseUrl, owner.authHeader, productId);
    setDeadPrinter(db, 'prn-r13-dead-2');
    const fail2 = await api(baseUrl, '/api/printers/print-bill', {
      method: 'POST',
      body: { billId: paid2.billId },
      headers: owner.authHeader,
    });
    assert(fail2.status >= 400, 'second print fails');
    const job2 = db
      .prepare(
        `SELECT * FROM print_jobs WHERE bill_id = ? AND status IN ('pending','failed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(paid2.billId) as any;
    assert(!!job2, 'second failed job exists');
    const attemptsBefore = Number(job2.attempts);

    const retryFail = await api(baseUrl, `/api/printers/jobs/${job2.id}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assert(retryFail.status >= 400, 'retry against dead printer fails');
    const afterRetry = db
      .prepare(`SELECT status, attempts, last_error FROM print_jobs WHERE id = ?`)
      .get(job2.id) as any;
    assertEqual(afterRetry.status, 'failed', 'still failed after retry fail');
    assertEqual(
      Number(afterRetry.attempts),
      attemptsBefore + 1,
      'attempts incremented on failed retry',
    );
    assert(!!afterRetry.last_error, 'last_error updated');

    // Exhaust remaining retries if max_attempts still allows more
    let exhaustedId = String(job2.id);
    let guard = 0;
    while (guard < 5) {
      guard += 1;
      const row = db
        .prepare(`SELECT attempts, max_attempts, status FROM print_jobs WHERE id = ?`)
        .get(exhaustedId) as any;
      if (Number(row.attempts) >= Number(row.max_attempts)) break;
      setDeadPrinter(db, `prn-r13-dead-x${guard}`);
      await api(baseUrl, `/api/printers/jobs/${exhaustedId}/retry`, {
        method: 'POST',
        headers: owner.authHeader,
      });
    }
    const noMore = await api(baseUrl, `/api/printers/jobs/${exhaustedId}/retry`, {
      method: 'POST',
      headers: owner.authHeader,
    });
    assertEqual(noMore.status, 409, 'no retry past max_attempts');

    console.log('\nR13-06 cashier cannot retry');
    const paid3 = await createPaidBill(baseUrl, owner.authHeader, productId);
    setDeadPrinter(db, 'prn-r13-dead-3');
    await api(baseUrl, '/api/printers/print-bill', {
      method: 'POST',
      body: { billId: paid3.billId },
      headers: owner.authHeader,
    });
    const job3 = db
      .prepare(
        `SELECT id FROM print_jobs WHERE bill_id = ? AND status IN ('pending','failed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(paid3.billId) as { id: string };
    const cashierRetry = await api(baseUrl, `/api/printers/jobs/${job3.id}/retry`, {
      method: 'POST',
      headers: auth(cashierId, 'cashier'),
    });
    assertEqual(cashierRetry.status, 403, 'cashier cannot retry');
  } finally {
    server.close();
    closeDatabase();
  }

  const results = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`R13 results: ${results.passed} passed, ${results.failed} failed`);
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
