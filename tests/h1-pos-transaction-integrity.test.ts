/**
 * H1 — POS Transaction Integrity Hardening
 * Void order audit · discount audit + paid guards · print-bill print_logs
 *
 * Usage: node tests/run-electron-node-test.cjs tests/h1-pos-transaction-integrity.test.ts
 *        npm run test:h1
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-h1-integrity-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'h1-pos-transaction-integrity-secret';

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

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { printerRoutes } = require('../main/routes/printers');

const ROOT = path.join(__dirname, '..');

function listenPrinterSink(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
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
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

async function createUnpaidOrder(
  baseUrl: string,
  authHeader: Record<string, string>,
  productId: string,
): Promise<{ orderId: number; itemId: number }> {
  const order = await api(baseUrl, '/api/orders', {
    method: 'POST',
    body: { type: 'takeaway', items: [{ product_id: productId, quantity: 1 }] },
    headers: authHeader,
  });
  assertEqual(order.status, 201, 'order created');
  const orderId = order.data.order.id as number;
  const itemId = order.data.order.items[0].id as number;
  return { orderId, itemId };
}

async function payOrder(
  baseUrl: string,
  authHeader: Record<string, string>,
  orderId: number,
): Promise<number> {
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
    headers: { ...authHeader, 'Idempotency-Key': `h1-pay-${billId}-${Date.now()}` },
  });
  assertEqual(pay.status, 200, 'bill paid');
  return billId;
}

async function main() {
  console.log('H1 — POS Transaction Integrity Hardening');
  console.log('='.repeat(60));

  const db = initTestDb();
  const owner = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedCategory(db, 'cat-h1', 'H1 Cat');
  seedProduct(db, 'prod-h1', 'cat-h1', 'H1 Latte', 100);
  const productId = 'prod-h1';

  // Disable discount PIN approval for deterministic discount tests
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_requires_approval', 'false', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('discount_mode', 'both', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(now());

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/printers': printerRoutes,
  });
  const { baseUrl, server } = await startServer(app);
  const auth = owner.authHeader;

  // ── H1-VOID-01: full order cancel writes audit_logs ────────────────────────
  console.log('\nH1-VOID-01 order cancel audit');
  {
    const { orderId } = await createUnpaidOrder(baseUrl, auth, productId);
    const cancel = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'h1 void audit' },
      headers: auth,
    });
    assertEqual(cancel.status, 200, 'cancel pending order 200');
    const audit = db
      .prepare(
        `SELECT * FROM audit_logs WHERE action = 'order.cancelled' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(String(orderId)) as any;
    assert(!!audit, 'order.cancelled audit row exists');
    if (audit) {
      assertEqual(audit.actor_user_id, owner.userId, 'cancel audit actor is owner');
      const meta = JSON.parse(audit.metadata_json || '{}');
      assertEqual(meta.reason, 'h1 void audit', 'cancel audit stores reason');
    }
  }

  // ── H1-VOID-02: item cancel blocked after successful tender ────────────────
  console.log('\nH1-VOID-02 item cancel after tender');
  {
    const { orderId, itemId } = await createUnpaidOrder(baseUrl, auth, productId);
    await payOrder(baseUrl, auth, orderId);
    const voidItem = await api(baseUrl, `/api/orders/${orderId}/items/${itemId}/cancel`, {
      method: 'PATCH',
      body: {},
      headers: auth,
    });
    assertEqual(voidItem.status, 409, 'paid item cancel returns 409');
    assertEqual(
      voidItem.data.code,
      'ORDER_HAS_SUCCESSFUL_TENDER',
      'paid item cancel code ORDER_HAS_SUCCESSFUL_TENDER',
    );
  }

  // ── H1-DISC-01: order discount writes audit_logs ───────────────────────────
  console.log('\nH1-DISC-01 order discount audit');
  {
    const { orderId } = await createUnpaidOrder(baseUrl, auth, productId);
    const disc = await api(baseUrl, `/api/orders/${orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'percentage', discount_value: 10, discount_reason: 'h1 audit' },
      headers: auth,
    });
    assertEqual(disc.status, 200, 'discount applied 200');
    const audit = db
      .prepare(
        `SELECT * FROM audit_logs WHERE action = 'order.discount_applied' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
      )
      .get(String(orderId)) as any;
    assert(!!audit, 'order.discount_applied audit row exists');
    if (audit) {
      assertEqual(audit.actor_user_id, owner.userId, 'discount audit actor');
      const meta = JSON.parse(audit.metadata_json || '{}');
      assertEqual(meta.discount_type, 'percentage', 'discount audit type');
      assertEqual(meta.discount_value, 10, 'discount audit value');
    }
  }

  // ── H1-DISC-02: discount blocked after successful tender ───────────────────
  console.log('\nH1-DISC-02 discount after tender');
  {
    const { orderId } = await createUnpaidOrder(baseUrl, auth, productId);
    await payOrder(baseUrl, auth, orderId);
    const disc = await api(baseUrl, `/api/orders/${orderId}/discount`, {
      method: 'PATCH',
      body: { discount_type: 'amount', discount_value: 5, discount_reason: 'too late' },
      headers: auth,
    });
    assertEqual(disc.status, 409, 'paid discount returns 409');
    assertEqual(
      disc.data.code,
      'ORDER_HAS_SUCCESSFUL_TENDER',
      'paid discount code ORDER_HAS_SUCCESSFUL_TENDER',
    );
  }

  // ── H1-RCPT-01: successful print-bill writes print_logs ────────────────────
  console.log('\nH1-RCPT-01 print-bill success logs');
  const sink = await listenPrinterSink();
  try {
    const { orderId } = await createUnpaidOrder(baseUrl, auth, productId);
    const billId = await payOrder(baseUrl, auth, orderId);

    db.prepare(`UPDATE printers SET is_default = 0`).run();
    db.prepare(
      `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
       VALUES (?, ?, 'network', '127.0.0.1', ?, 1, '80mm', ?, ?)`,
    ).run('prn-h1-1', 'H1 Sink', sink.port, now(), now());

    const before = (
      db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
        n: number;
      }
    ).n;

    const printRes = await api(baseUrl, '/api/printers/print-bill', {
      method: 'POST',
      body: { billId, isReprint: false },
      headers: auth,
    });
    assertEqual(printRes.status, 200, 'print-bill success 200');
    assertEqual(printRes.data.success, true, 'print-bill success true');
    assertEqual(printRes.data.print_logged, true, 'print-bill reports print_logged');

    const after = (
      db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
        n: number;
      }
    ).n;
    assertEqual(after, before + 1, 'print_logs increased by 1');
    const log = db
      .prepare(`SELECT print_type FROM print_logs WHERE bill_id = ? ORDER BY id DESC LIMIT 1`)
      .get(billId) as { print_type: string };
    assertEqual(log.print_type, 'receipt', 'print_type is receipt');
    const bill = db.prepare(`SELECT printed_at FROM bills WHERE id = ?`).get(billId) as {
      printed_at: string | null;
    };
    assert(!!bill.printed_at, 'bills.printed_at set after successful print-bill');
  } finally {
    await sink.close();
  }

  // ── H1-RCPT-02: failed print-bill does not write print_logs ────────────────
  console.log('\nH1-RCPT-02 print-bill failure does not log');
  {
    const { orderId } = await createUnpaidOrder(baseUrl, auth, productId);
    const billId = await payOrder(baseUrl, auth, orderId);
    db.prepare(`UPDATE printers SET is_default = 0`).run();
    db.prepare(
      `INSERT INTO printers (id, name, connection_type, ip_address, port, is_default, paper_width, created_at, updated_at)
       VALUES (?, ?, 'network', '127.0.0.1', 1, 1, '80mm', ?, ?)`,
    ).run('prn-h1-fail', 'H1 Dead', now(), now());

    const before = (
      db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
        n: number;
      }
    ).n;
    const printRes = await api(baseUrl, '/api/printers/print-bill', {
      method: 'POST',
      body: { billId },
      headers: manager.authHeader,
    });
    assert(printRes.status >= 400, `failed print returns error (got ${printRes.status})`);
    const after = (
      db.prepare(`SELECT COUNT(*) AS n FROM print_logs WHERE bill_id = ?`).get(billId) as {
        n: number;
      }
    ).n;
    assertEqual(after, before, 'failed print does not write print_logs');
  }

  // ── Frontend contract: skip duplicate log when server already logged ───────
  console.log('\nH1-RCPT-03 frontend avoids double-log after print-bill');
  {
    const usePrinter = fs.readFileSync(
      path.join(ROOT, 'frontend/src/hooks/usePrinter.ts'),
      'utf8',
    );
    const ordersPage = fs.readFileSync(
      path.join(ROOT, 'frontend/src/app/(dashboard)/orders/page.tsx'),
      'utf8',
    );
    assert(
      usePrinter.includes('printLogged') || usePrinter.includes('print_logged'),
      'usePrinter surfaces print_logged from print-bill',
    );
    assert(
      ordersPage.includes('printLogged') || ordersPage.includes('print_logged'),
      'orders page skips /bills/:id/print when server already logged',
    );
  }

  server.close();
  closeDatabase();

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
