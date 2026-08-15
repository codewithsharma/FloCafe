/**
 * Child worker for process-kill recovery tests.
 *
 * Opens the shared SQLite DB, BEGIN IMMEDIATE, performs a mid-transaction write,
 * prints READY, then sleeps until SIGKILL. Never COMMITs.
 *
 * Env:
 *   FLO_KILL_DB_PATH  — absolute path to flo.db
 *   FLO_KILL_SCENARIO — payment | inventory | purchase
 */
'use strict';

const Database = require('better-sqlite3');
const dbPath = process.env.FLO_KILL_DB_PATH;
const scenario = process.env.FLO_KILL_SCENARIO || 'payment';

if (!dbPath) {
  console.error('FLO_KILL_DB_PATH required');
  process.exit(2);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec('BEGIN IMMEDIATE');

if (scenario === 'payment') {
  const bill = db.prepare("SELECT id, paid_amount, balance, payment_status FROM bills ORDER BY id LIMIT 1").get();
  if (!bill) throw new Error('no bill for payment kill scenario');
  db.prepare(
    `UPDATE bills SET paid_amount = ?, balance = 0, payment_status = 'paid',
      paid_amount_cents = ?, balance_cents = 0 WHERE id = ?`,
  ).run(999.99, 99999, bill.id);
} else if (scenario === 'inventory') {
  const product = db
    .prepare("SELECT id, stock_quantity FROM products WHERE track_inventory = 1 ORDER BY id LIMIT 1")
    .get();
  if (!product) throw new Error('no tracked product for inventory kill scenario');
  db.prepare('UPDATE products SET stock_quantity = stock_quantity - 5 WHERE id = ?').run(product.id);
  const after = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id);
  db.prepare(
    `INSERT INTO inventory_movements (
      product_id, quantity_delta, movement_type, reference_type, reference_id,
      reason, stock_after, created_at
    ) VALUES (?, -5, 'adjustment', 'test', 'kill', 'kill_test', ?, datetime('now'))`,
  ).run(product.id, after.stock_quantity);
} else if (scenario === 'purchase') {
  const product = db
    .prepare("SELECT id, stock_quantity, cost, cost_cents FROM products WHERE track_inventory = 1 ORDER BY id LIMIT 1")
    .get();
  if (!product) throw new Error('no product for purchase kill scenario');
  db.prepare(
    `UPDATE products SET stock_quantity = stock_quantity + 10, cost = 12.34, cost_cents = 1234 WHERE id = ?`,
  ).run(product.id);
} else {
  throw new Error(`unknown scenario ${scenario}`);
}

// Signal parent that uncommitted writes are in-flight, then hang until killed.
process.stdout.write(`READY:${scenario}\n`);
setInterval(() => {}, 1 << 30);
