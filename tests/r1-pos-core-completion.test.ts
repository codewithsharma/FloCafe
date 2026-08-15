/**
 * R1 — POS Core Completion
 *
 * Illegal transitions · cancel/discount Idempotency-Key · required addons ·
 * reprint coerce · digital preview · order create audit · item discount audit
 *
 * Usage: npm run test:r1
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-r1-pos-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'r1-pos-core-completion-secret';

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
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');

const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { printerRoutes } = require('../main/routes/printers');

const uuid = () => crypto.randomUUID();

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

async function createOrder(
  baseUrl: string,
  auth: Record<string, string>,
  productId: string,
  itemExtras: Record<string, unknown> = {},
) {
  return api(baseUrl, '/api/orders', {
    method: 'POST',
    body: {
      type: 'takeaway',
      items: [{ product_id: productId, quantity: 1, ...itemExtras }],
    },
    headers: auth,
  });
}

async function main() {
  console.log('\nR1 — POS Core Completion\n' + '='.repeat(60));
  const db = initTestDb();
  const owner = seedOwnerUser(db);
  seedCategory(db, 'cat-r1', 'R1 Cat');
  seedProduct(db, 'prod-r1', 'cat-r1', 'R1 Latte', 100);
  const productId = 'prod-r1';
  const auth = owner.authHeader;

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

  try {
    console.log('\nR1-LIFE-01 illegal status transitions');
    {
      const created = await createOrder(baseUrl, auth, productId);
      assertEqual(created.status, 201, 'order created');
      const id = created.data.order.id;
      await api(baseUrl, `/api/orders/${id}/status`, {
        method: 'PATCH',
        body: { status: 'completed' },
        headers: auth,
      });
      const bad = await api(baseUrl, `/api/orders/${id}/status`, {
        method: 'PATCH',
        body: { status: 'preparing' },
        headers: auth,
      });
      assertEqual(bad.status, 409, 'completed → preparing blocked');
      assertEqual(bad.data.code, 'ILLEGAL_STATUS_TRANSITION', 'ILLEGAL_STATUS_TRANSITION code');

      const created2 = await createOrder(baseUrl, auth, productId);
      const id2 = created2.data.order.id;
      await api(baseUrl, `/api/orders/${id2}/status`, {
        method: 'PATCH',
        body: { status: 'cancelled', reason: 'test' },
        headers: auth,
      });
      const bad2 = await api(baseUrl, `/api/orders/${id2}/status`, {
        method: 'PATCH',
        body: { status: 'ready' },
        headers: auth,
      });
      assertEqual(bad2.status, 409, 'cancelled → ready blocked');
    }

    console.log('\nR1-AUDIT-01 order.created audit');
    {
      const before = (
        db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.created'`).get() as {
          c: number;
        }
      ).c;
      const created = await createOrder(baseUrl, auth, productId);
      assertEqual(created.status, 201, 'order created for audit');
      const after = (
        db.prepare(`SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.created'`).get() as {
          c: number;
        }
      ).c;
      assert(after > before, 'order.created audit written');
      const row = db
        .prepare(
          `SELECT * FROM audit_logs WHERE action = 'order.created' AND entity_id = ? ORDER BY id DESC LIMIT 1`,
        )
        .get(String(created.data.order.id)) as any;
      assert(row, 'audit row for order id');
      assertEqual(row.result, 'success', 'audit success');
    }

    console.log('\nR1-CANCEL-01 cancel Idempotency-Key replay');
    {
      const created = await createOrder(baseUrl, auth, productId);
      const id = created.data.order.id;
      const key = `r1-cancel-${id}`;
      const first = await api(baseUrl, `/api/orders/${id}/status`, {
        method: 'PATCH',
        body: { status: 'cancelled', reason: 'dup-safe' },
        headers: { ...auth, 'Idempotency-Key': key },
      });
      assertEqual(first.status, 200, 'first cancel ok');
      const audits1 = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.cancelled' AND entity_id = ?`,
          )
          .get(String(id)) as { c: number }
      ).c;
      const second = await api(baseUrl, `/api/orders/${id}/status`, {
        method: 'PATCH',
        body: { status: 'cancelled', reason: 'dup-safe' },
        headers: { ...auth, 'Idempotency-Key': key },
      });
      assertEqual(second.status, 200, 'replay cancel ok');
      assert(
        second.data.idempotent_replay === true || second.data.order?.status === 'cancelled',
        'replay flagged or cancelled',
      );
      const audits2 = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.cancelled' AND entity_id = ?`,
          )
          .get(String(id)) as { c: number }
      ).c;
      assertEqual(audits2, audits1, 'no second cancel audit on idempotent replay');
    }

    console.log('\nR1-DISC-01 discount Idempotency-Key replay');
    {
      const created = await createOrder(baseUrl, auth, productId);
      const id = created.data.order.id;
      const key = `r1-disc-${id}`;
      const body = { discount_type: 'percentage', discount_value: 10, discount_reason: 'r1' };
      const first = await api(baseUrl, `/api/orders/${id}/discount`, {
        method: 'PATCH',
        body,
        headers: { ...auth, 'Idempotency-Key': key },
      });
      assertEqual(first.status, 200, 'first discount ok');
      const amount1 = first.data.order.discount_amount;
      const audits1 = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.discount_applied' AND entity_id = ?`,
          )
          .get(String(id)) as { c: number }
      ).c;
      const second = await api(baseUrl, `/api/orders/${id}/discount`, {
        method: 'PATCH',
        body,
        headers: { ...auth, 'Idempotency-Key': key },
      });
      assertEqual(second.status, 200, 'replay discount ok');
      assertEqual(second.data.order.discount_amount, amount1, 'same discount amount');
      const audits2 = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.discount_applied' AND entity_id = ?`,
          )
          .get(String(id)) as { c: number }
      ).c;
      assertEqual(audits2, audits1, 'no second discount audit on idempotent replay');
    }

    console.log('\nR1-DISC-02 item discount audit');
    {
      const created = await createOrder(baseUrl, auth, productId);
      const id = created.data.order.id;
      const itemId = created.data.order.items[0].id;
      const before = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.item_discount_applied'`,
          )
          .get() as { c: number }
      ).c;
      const res = await api(baseUrl, `/api/orders/${id}/items/${itemId}/discount`, {
        method: 'PATCH',
        body: { discount_type: 'amount', discount_value: 5 },
        headers: auth,
      });
      assertEqual(res.status, 200, 'item discount ok');
      const after = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM audit_logs WHERE action = 'order.item_discount_applied'`,
          )
          .get() as { c: number }
      ).c;
      assert(after > before, 'item discount audit written');
    }

    console.log('\nR1-ADDON-01 required addon group enforced');
    {
      const groupId = uuid();
      const addonId = uuid();
      const t = now();
      db.prepare(
        `INSERT INTO addon_groups (id, name, is_required, min_selection, max_selection, is_active, sort_order, created_at, updated_at)
         VALUES (?, 'Required Extra', 1, 1, 1, 1, 0, ?, ?)`,
      ).run(groupId, t, t);
      db.prepare(
        `INSERT INTO addons (id, addon_group_id, name, price, is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, 'Extra Shot', 10, 1, 0, ?, ?)`,
      ).run(addonId, groupId, t, t);
      db.prepare(`INSERT INTO addon_group_product (addon_group_id, product_id) VALUES (?, ?)`).run(
        groupId,
        productId,
      );

      const denied = await createOrder(baseUrl, auth, productId);
      assertEqual(denied.status, 400, 'empty addons rejected when required group linked');
      assert(
        String(denied.data.error || '')
          .toLowerCase()
          .includes('required') ||
          String(denied.data.error || '')
            .toLowerCase()
            .includes('at least'),
        'error mentions required/min selection',
      );

      const ok = await createOrder(baseUrl, auth, productId, {
        addons: [
          { id: addonId, name: 'Extra Shot', price: 10, quantity: 1, addon_group_id: groupId },
        ],
      });
      assertEqual(ok.status, 201, 'order with required addon accepted');

      db.prepare(`DELETE FROM addon_group_product WHERE addon_group_id = ? AND product_id = ?`).run(
        groupId,
        productId,
      );
      db.prepare(`UPDATE addon_groups SET is_active = 0, updated_at = ? WHERE id = ?`).run(
        now(),
        groupId,
      );
    }

    console.log('\nR1-RCPT-01 digital receipt preview foundation');
    {
      db.prepare(`UPDATE printers SET is_default = 0`).run();
      db.prepare(
        `INSERT INTO printers (id, name, connection_type, ip_address, port, paper_width, is_default, created_at, updated_at)
         VALUES (?, 'R1 Preview Printer', 'network', '127.0.0.1', 9100, '80', 1, ?, ?)`,
      ).run(uuid(), now(), now());

      const created = await createOrder(baseUrl, auth, productId);
      const orderId = created.data.order.id;
      const bill = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: orderId },
        headers: auth,
      });
      assertEqual(bill.status, 201, 'bill generated');
      const billId = bill.data.bill.id;
      await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: bill.data.bill.total },
        headers: { ...auth, 'Idempotency-Key': `r1-pay-preview-${billId}` },
      });
      const preview = await api(baseUrl, '/api/printers/print-bill', {
        method: 'POST',
        body: { billId, preview: true },
        headers: auth,
      });
      assertEqual(preview.status, 200, 'preview ok');
      assertEqual(preview.data.preview, true, 'preview flag');
      assert(typeof preview.data.text === 'string' && preview.data.text.length > 0, 'preview text');
      assert(
        typeof preview.data.escpos_base64 === 'string' && preview.data.escpos_base64.length > 0,
        'escpos_base64',
      );
      assert(typeof preview.data.columns === 'number', 'columns');
      assertEqual(preview.data.bill_id, billId, 'bill_id in preview');
    }

    console.log('\nR1-RCPT-02 server forces reprint after first print');
    {
      const sink = await listenPrinterSink();
      db.prepare(`UPDATE printers SET is_default = 0`).run();
      db.prepare(
        `INSERT INTO printers (id, name, connection_type, ip_address, port, paper_width, is_default, created_at, updated_at)
         VALUES (?, 'R1 Sink', 'network', '127.0.0.1', ?, '80', 1, ?, ?)`,
      ).run(uuid(), sink.port, now(), now());

      const created = await createOrder(baseUrl, auth, productId);
      const orderId = created.data.order.id;
      const bill = await api(baseUrl, '/api/bills/generate', {
        method: 'POST',
        body: { order_id: orderId },
        headers: auth,
      });
      const billId = bill.data.bill.id;
      await api(baseUrl, `/api/bills/${billId}/payment`, {
        method: 'POST',
        body: { method: 'cash', amount: bill.data.bill.total },
        headers: { ...auth, 'Idempotency-Key': `r1-pay-print-${billId}` },
      });

      const first = await api(baseUrl, '/api/printers/print-bill', {
        method: 'POST',
        body: { billId, isReprint: false },
        headers: auth,
      });
      assertEqual(first.status, 200, 'first print ok');
      const type1 = (
        db
          .prepare(`SELECT print_type FROM print_logs WHERE bill_id = ? ORDER BY id DESC LIMIT 1`)
          .get(billId) as { print_type: string }
      ).print_type;
      assertEqual(type1, 'receipt', 'first log is receipt');

      const second = await api(baseUrl, '/api/printers/print-bill', {
        method: 'POST',
        body: { billId, isReprint: false },
        headers: auth,
      });
      assertEqual(second.status, 200, 'second print ok');
      const type2 = (
        db
          .prepare(`SELECT print_type FROM print_logs WHERE bill_id = ? ORDER BY id DESC LIMIT 1`)
          .get(billId) as { print_type: string }
      ).print_type;
      assertEqual(type2, 'reprint', 'second log coerced to reprint');

      await sink.close();
    }

    console.log('\nR1-WEBUSB-01 usePrinter posts bill print log when local print succeeds');
    {
      const src = fs.readFileSync(
        path.join(__dirname, '../frontend/src/hooks/usePrinter.ts'),
        'utf8',
      );
      assert(
        src.includes('/bills/') && src.includes('/print'),
        'usePrinter references bills print API',
      );
      assert(src.includes('print_logged') || src.includes('printLogged'), 'handles print_logged');
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
