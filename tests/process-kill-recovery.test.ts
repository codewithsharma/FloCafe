/**
 * Foundation Phase 2 — process-kill / crash-mid-transaction recovery harness.
 *
 * Proves SQLite transaction atomicity under real process interruption (SIGKILL),
 * not ordinary thrown exceptions: a child opens the live DB, BEGIN IMMEDIATE,
 * mutates payment / inventory / purchase-adjacent state, then is killed before COMMIT.
 * Parent reopens and asserts pre-txn invariants (rollback + recovery).
 *
 * Usage: npm run test:process-kill
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const electronPath = require('electron');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-process-kill-'));
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

process.env.JWT_SECRET = 'process-kill-recovery-secret';

const Database = require('better-sqlite3');
const {
  initTestDb,
  seedOwnerUser,
  seedCategory,
  seedProduct,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  getDatabase,
  now,
} = require('./helpers/test-setup');
const { getDbPath } = require('../main/db');

const workerPath = path.join(__dirname, 'helpers', 'process-kill-worker.cjs');

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function killMidTransaction(
  dbPath: string,
  scenario: 'payment' | 'inventory' | 'purchase',
): Promise<void> {
  const child = spawn(
    electronPath as unknown as string,
    [workerPath],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        FLO_KILL_DB_PATH: dbPath,
        FLO_KILL_SCENARIO: scenario,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let ready = false;
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      reject(new Error(`timeout waiting READY for ${scenario}: ${stderr}`));
    }, 15_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('READY:')) {
        ready = true;
        clearTimeout(timer);
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`worker exited early code=${code} signal=${signal} stderr=${stderr}`));
      }
    });
  });

  // Uncommitted writes are in-flight — hard-kill the process (not a soft throw).
  child.kill('SIGKILL');
  await sleep(200);
}

function openReadonlyCheck(dbPath: string) {
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  return db;
}

async function main() {
  console.log('\nFoundation Phase 2 — Process-Kill Recovery\n' + '='.repeat(60));

  const db = initTestDb();
  seedOwnerUser(db);
  seedCategory(db, 'cat-kill', 'Kill');
  seedProduct(db, 'prod-kill', 'cat-kill', 'Kill Latte', 50, {
    track_inventory: true,
    stock_quantity: 100,
  });
  // Ensure cost fields exist for purchase scenario
  db.prepare('UPDATE products SET cost = 5.0, cost_cents = 500 WHERE id = ?').run('prod-kill');

  const orderId = db
    .prepare(
      `INSERT INTO orders (order_number, type, status, subtotal, tax_amount, total, subtotal_cents, tax_amount_cents, total_cents, created_at, updated_at)
       VALUES ('KILL-001', 'dine_in', 'pending', 50, 0, 50, 5000, 0, 5000, ?, ?)`,
    )
    .run(now(), now()).lastInsertRowid;

  const billId = db
    .prepare(
      `INSERT INTO bills (bill_number, order_id, subtotal, tax_amount, total, paid_amount, balance, payment_status,
        subtotal_cents, tax_amount_cents, total_cents, paid_amount_cents, balance_cents, created_at, updated_at)
       VALUES ('BILL-KILL-001', ?, 50, 0, 50, 0, 50, 'unpaid', 5000, 0, 5000, 0, 5000, ?, ?)`,
    )
    .run(orderId, now(), now()).lastInsertRowid;

  const beforeBill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
  const beforeProduct = db.prepare('SELECT * FROM products WHERE id = ?').get('prod-kill') as any;
  const beforeMovements = (
    db.prepare('SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?').get('prod-kill') as any
  ).c;

  const dbPath = getDbPath();
  closeDatabase();

  // ── Payment mid-txn kill ────────────────────────────────────────────
  console.log('\nKILL-01 Payment transaction interrupted before COMMIT');
  await killMidTransaction(dbPath, 'payment');
  {
    const check = openReadonlyCheck(dbPath);
    const bill = check.prepare('SELECT * FROM bills WHERE id = ?').get(billId) as any;
    assertEqual(bill.payment_status, 'unpaid', 'bill payment_status rolled back to unpaid');
    assertEqual(Number(bill.paid_amount), 0, 'bill paid_amount rolled back to 0');
    assertEqual(Number(bill.paid_amount_cents ?? 0), 0, 'bill paid_amount_cents rolled back');
    assertEqual(Number(bill.balance), 50, 'bill balance restored');
    assertEqual(Number(bill.balance_cents ?? 5000), 5000, 'bill balance_cents restored');
    check.close();
  }

  // ── Inventory mid-txn kill ──────────────────────────────────────────
  console.log('\nKILL-02 Inventory mutation interrupted before COMMIT');
  await killMidTransaction(dbPath, 'inventory');
  {
    const check = openReadonlyCheck(dbPath);
    const product = check.prepare('SELECT * FROM products WHERE id = ?').get('prod-kill') as any;
    assertEqual(Number(product.stock_quantity), 100, 'stock_quantity rolled back to 100');
    const movements = (
      check.prepare('SELECT COUNT(*) AS c FROM inventory_movements WHERE product_id = ?').get('prod-kill') as any
    ).c;
    assertEqual(movements, beforeMovements, 'no orphan inventory_movements after kill');
    check.close();
  }

  // ── Purchase-adjacent mid-txn kill ──────────────────────────────────
  console.log('\nKILL-03 Purchase receive-adjacent product update interrupted before COMMIT');
  await killMidTransaction(dbPath, 'purchase');
  {
    const check = openReadonlyCheck(dbPath);
    const product = check.prepare('SELECT * FROM products WHERE id = ?').get('prod-kill') as any;
    assertEqual(Number(product.stock_quantity), 100, 'purchase kill: stock unchanged');
    assertEqual(Number(product.cost), 5, 'purchase kill: cost REAL unchanged');
    assertEqual(Number(product.cost_cents), 500, 'purchase kill: cost_cents unchanged');
    check.close();
  }

  assert(beforeBill.payment_status === 'unpaid', 'baseline bill was unpaid');
  assert(Number(beforeProduct.stock_quantity) === 100, 'baseline stock was 100');

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
