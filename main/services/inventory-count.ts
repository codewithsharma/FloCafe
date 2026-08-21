/**
 * R4 Inventory OS — physical stock counts (draft → submit → apply/cancel).
 * Apply uses adjustProductStock set path (ledger) — never silent overwrite.
 */

import { randomUUID } from 'crypto';
import { getDatabase, now, withTxn } from '../db';
import { adjustProductStock, InventoryServiceError } from './inventory';
import { logAuditEvent } from './audit-log';

export type InventoryCountStatus = 'draft' | 'submitted' | 'applied' | 'cancelled';

export interface InventoryCountRow {
  id: string;
  status: InventoryCountStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  applied_at: string | null;
}

export interface InventoryCountLineRow {
  id: number;
  count_id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number;
  variance: number;
  applied_movement_id: number | null;
}

function requireCount(db: any, countId: string): InventoryCountRow {
  const row = db.prepare('SELECT * FROM inventory_counts WHERE id = ?').get(countId) as
    InventoryCountRow | undefined;
  if (!row) {
    throw new InventoryServiceError(404, 'Inventory count not found');
  }
  return row;
}

export function createInventoryCount(args: {
  notes?: string | null;
  createdBy: string;
}): InventoryCountRow {
  const db = getDatabase();
  const id = `cnt-${randomUUID().slice(0, 8)}`;
  const ts = now();
  return withTxn(() => {
    db.prepare(
      `
    INSERT INTO inventory_counts (id, status, notes, created_by, created_at, updated_at)
    VALUES (?, 'draft', ?, ?, ?, ?)
  `,
    ).run(id, args.notes ?? null, args.createdBy, ts, ts);
    logAuditEvent({
      actorUserId: args.createdBy,
      action: 'inventory.count_created',
      entityType: 'inventory_count',
      entityId: id,
      result: 'success',
      metadata: { status: 'draft', notes: args.notes ?? null },
    });
    return requireCount(db, id);
  });
}

export function upsertCountLine(args: {
  countId: string;
  productId: string;
  countedQty: number;
}): InventoryCountLineRow {
  if (
    typeof args.countedQty !== 'number' ||
    !Number.isFinite(args.countedQty) ||
    args.countedQty < 0
  ) {
    throw new InventoryServiceError(400, 'counted_qty must be a non-negative number');
  }

  return withTxn(() => {
    const db = getDatabase();
    const count = requireCount(db, args.countId);
    if (count.status !== 'draft') {
      throw new InventoryServiceError(400, 'Lines can only be edited on draft counts');
    }

    const product = db
      .prepare(
        'SELECT id, stock_quantity, track_inventory FROM products WHERE id = ? AND deleted_at IS NULL',
      )
      .get(args.productId) as
      { id: string; stock_quantity: number; track_inventory: number } | undefined;
    if (!product) {
      throw new InventoryServiceError(404, 'Product not found');
    }
    if (!product.track_inventory) {
      throw new InventoryServiceError(400, 'Product does not track inventory');
    }

    const systemQty = Number(product.stock_quantity ?? 0);
    const variance = args.countedQty - systemQty;
    const ts = now();

    db.prepare(
      `
      INSERT INTO inventory_count_lines (count_id, product_id, system_qty, counted_qty, variance)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(count_id, product_id) DO UPDATE SET
        system_qty = excluded.system_qty,
        counted_qty = excluded.counted_qty,
        variance = excluded.variance,
        applied_movement_id = NULL
    `,
    ).run(args.countId, args.productId, systemQty, args.countedQty, variance);

    db.prepare('UPDATE inventory_counts SET updated_at = ? WHERE id = ?').run(ts, args.countId);

    return db
      .prepare('SELECT * FROM inventory_count_lines WHERE count_id = ? AND product_id = ?')
      .get(args.countId, args.productId) as InventoryCountLineRow;
  });
}

export function submitInventoryCount(
  countId: string,
  actorUserId?: string | null,
): InventoryCountRow {
  return withTxn(() => {
    const db = getDatabase();
    const count = requireCount(db, countId);
    if (count.status !== 'draft') {
      throw new InventoryServiceError(400, 'Only draft counts can be submitted');
    }
    const lineCount = (
      db
        .prepare('SELECT COUNT(*) AS c FROM inventory_count_lines WHERE count_id = ?')
        .get(countId) as { c: number }
    ).c;
    if (lineCount < 1) {
      throw new InventoryServiceError(400, 'Cannot submit a count with no lines');
    }
    const ts = now();
    db.prepare(`UPDATE inventory_counts SET status = 'submitted', updated_at = ? WHERE id = ?`).run(
      ts,
      countId,
    );
    logAuditEvent({
      actorUserId: actorUserId ?? count.created_by,
      action: 'inventory.count_submitted',
      entityType: 'inventory_count',
      entityId: countId,
      result: 'success',
      metadata: { previous_status: 'draft', line_count: lineCount },
    });
    return requireCount(db, countId);
  });
}

export function cancelInventoryCount(
  countId: string,
  actorUserId?: string | null,
): InventoryCountRow {
  return withTxn(() => {
    const db = getDatabase();
    const count = requireCount(db, countId);
    if (count.status === 'applied') {
      throw new InventoryServiceError(400, 'Applied counts cannot be cancelled');
    }
    if (count.status === 'cancelled') {
      return count;
    }
    const ts = now();
    db.prepare(`UPDATE inventory_counts SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
      ts,
      countId,
    );
    logAuditEvent({
      actorUserId: actorUserId ?? count.created_by,
      action: 'inventory.count_cancelled',
      entityType: 'inventory_count',
      entityId: countId,
      result: 'success',
      metadata: { previous_status: count.status },
    });
    return requireCount(db, countId);
  });
}

export function applyInventoryCount(args: {
  countId: string;
  actorUserId: string;
}): InventoryCountRow {
  return withTxn(() => {
    const db = getDatabase();
    const count = requireCount(db, args.countId);
    if (count.status !== 'submitted') {
      throw new InventoryServiceError(400, 'Only submitted counts can be applied');
    }

    const lines = db
      .prepare('SELECT * FROM inventory_count_lines WHERE count_id = ?')
      .all(args.countId) as InventoryCountLineRow[];

    for (const line of lines) {
      if (Number(line.variance) === 0) continue;

      adjustProductStock(String(line.product_id), 'set', Number(line.counted_qty), {
        reason: 'count_variance',
        referenceType: 'inventory_count',
        referenceId: args.countId,
      });

      const movement = db
        .prepare(
          `
        SELECT id FROM inventory_movements
        WHERE product_id = ? AND reference_type = 'inventory_count' AND reference_id = ?
        ORDER BY id DESC LIMIT 1
      `,
        )
        .get(line.product_id, args.countId) as { id: number } | undefined;

      if (movement) {
        db.prepare('UPDATE inventory_count_lines SET applied_movement_id = ? WHERE id = ?').run(
          movement.id,
          line.id,
        );
      }
    }

    const ts = now();
    db.prepare(
      `UPDATE inventory_counts SET status = 'applied', updated_at = ?, applied_at = ? WHERE id = ?`,
    ).run(ts, ts, args.countId);

    logAuditEvent({
      actorUserId: args.actorUserId,
      action: 'inventory.count_applied',
      entityType: 'inventory_count',
      entityId: args.countId,
      result: 'success',
      metadata: {
        line_count: lines.length,
        variance_lines: lines.filter((l) => Number(l.variance) !== 0).length,
      },
    });

    return requireCount(db, args.countId);
  });
}

export function listInventoryCounts(): InventoryCountRow[] {
  return getDatabase()
    .prepare('SELECT * FROM inventory_counts ORDER BY created_at DESC, id DESC')
    .all() as InventoryCountRow[];
}

export function getInventoryCount(countId: string): {
  count: InventoryCountRow;
  lines: InventoryCountLineRow[];
} {
  const db = getDatabase();
  const count = requireCount(db, countId);
  const lines = db
    .prepare('SELECT * FROM inventory_count_lines WHERE count_id = ? ORDER BY id ASC')
    .all(countId) as InventoryCountLineRow[];
  return { count, lines };
}
