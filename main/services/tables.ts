/**
 * R2 — Table / Floor domain service.
 *
 * Owns: table occupancy CAS, transfer, unpaid merge/split, waiter assignment,
 * deterministic status guards. Does NOT own payments/bills money math.
 */

import { getDatabase, generateOrderNumber, now, parseRowJson, withTxn } from '../db';
import { logAuditEvent } from './audit-log';

export const ACTIVE_ORDER_STATUS_SQL = "status NOT IN ('completed', 'cancelled')";

export const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'cleaning', 'held'] as const;

export type TableStatus = (typeof TABLE_STATUSES)[number];

export class TableServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'TableServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type Db = ReturnType<typeof getDatabase>;

export function activeOrderForTable(
  db: Db,
  tableId: string,
  orderId?: number | string,
): any | null {
  const whereOrder = orderId ? ' AND id = ?' : '';
  const params = orderId ? [tableId, orderId] : [tableId];
  const order = parseRowJson(
    db
      .prepare(
        `
    SELECT * FROM orders
    WHERE table_id = ? AND ${ACTIVE_ORDER_STATUS_SQL}${whereOrder}
    ORDER BY created_at DESC LIMIT 1
  `,
      )
      .get(...params) as any,
  );
  if (!order?.customer_id) return order;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id);
  return { ...order, customer: customer || null };
}

export function tableShape(table: any, activeOrder?: any) {
  const currentOrder = activeOrder || null;
  return {
    ...table,
    name: table.number,
    activeOrder: currentOrder,
    current_order: currentOrder,
  };
}

function throwTableError(message: string, statusCode: number, code: string): never {
  throw new TableServiceError(message, statusCode, code);
}

export function assertTableExists(db: Db, tableId: string): any {
  const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId) as any;
  if (!table) throwTableError('Table not found', 404, 'TABLE_NOT_FOUND');
  return table;
}

export function hasHeldCart(db: Db, tableId: string): boolean {
  const row = db.prepare('SELECT 1 AS ok FROM held_orders WHERE table_id = ? LIMIT 1').get(tableId);
  return !!row;
}

export function hasAnyBill(db: Db, orderId: number | string): boolean {
  const row = db.prepare('SELECT 1 AS ok FROM bills WHERE order_id = ? LIMIT 1').get(orderId);
  return !!row;
}

export function hasSplitCheck(db: Db, orderId: number | string): boolean {
  const row = db
    .prepare('SELECT 1 AS ok FROM bills WHERE order_id = ? AND split_group_id IS NOT NULL LIMIT 1')
    .get(orderId);
  return !!row;
}

/** Sum stored item money fields — does not recompute tax engine. */
export function rollupOrderMoneyFromItems(db: Db, orderId: number | string) {
  const row = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(subtotal), 0) AS subtotal,
      COALESCE(SUM(tax_amount), 0) AS tax_amount,
      COALESCE(SUM(total), 0) AS total,
      COALESCE(SUM(discount_amount), 0) AS item_discount
    FROM order_items
    WHERE order_id = ?
      AND status NOT IN ('cancelled', 'voided', 'void_adjustment')
  `,
    )
    .get(orderId) as {
    subtotal: number;
    tax_amount: number;
    total: number;
    item_discount: number;
  };
  return row;
}

export function applyOrderMoneyRollup(db: Db, orderId: number | string, nowStr: string): void {
  const rollup = rollupOrderMoneyFromItems(db, orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  const delivery = Number(order?.delivery_charge || 0);
  const packaging = Number(order?.packaging_charge || 0);
  const orderDiscount = Number(order?.discount_amount || 0);
  const total = Number((rollup.total + delivery + packaging - orderDiscount).toFixed(2));
  db.prepare(
    `
    UPDATE orders SET
      subtotal = ?,
      tax_amount = ?,
      total = ?,
      updated_at = ?
    WHERE id = ?
  `,
  ).run(rollup.subtotal, rollup.tax_amount, total, nowStr, orderId);
}

/**
 * Refuse opening when another active order or held cart already exists.
 * Call BEFORE inserting a new dine-in order.
 */
export function assertTableCanOpen(db: Db, tableId: string): void {
  const table = assertTableExists(db, tableId);
  if (table.is_active === 0) {
    throwTableError('Table is deactivated', 409, 'TABLE_INACTIVE');
  }
  if (table.status === 'held') {
    throwTableError('Table has a held cart', 409, 'TABLE_HELD');
  }
  const existing = activeOrderForTable(db, tableId);
  if (existing) {
    throwTableError('Table already has an active order', 409, 'TABLE_HAS_ACTIVE_ORDER');
  }
  if (hasHeldCart(db, tableId)) {
    throwTableError('Table has a held cart', 409, 'TABLE_HELD');
  }
  if (!['available', 'reserved', 'cleaning'].includes(table.status)) {
    throwTableError('Table is not available to open', 409, 'TABLE_NOT_AVAILABLE');
  }
}

/**
 * CAS occupy after a dine-in order row exists. Does not re-check active orders
 * (the new order would match). Pair with assertTableCanOpen before insert.
 */
export function markTableOccupiedCas(db: Db, tableId: string, nowStr: string = now()): void {
  const result = db
    .prepare(
      `
    UPDATE tables SET status = 'occupied', updated_at = ?
    WHERE id = ? AND is_active = 1 AND status IN ('available', 'reserved', 'cleaning')
  `,
    )
    .run(nowStr, tableId);
  if (result.changes === 0) {
    throwTableError('Table is not available to open', 409, 'TABLE_NOT_AVAILABLE');
  }
}

/**
 * Occupy a table for dine-in create. Call only when no order row exists yet,
 * or use assertTableCanOpen + markTableOccupiedCas around insert.
 */
export function occupyTableForOrder(db: Db, tableId: string, nowStr: string = now()): void {
  assertTableCanOpen(db, tableId);
  markTableOccupiedCas(db, tableId, nowStr);
}

/** Free table when order completes/cancels. Clears waiter assignment. */
export function freeTableIfModule(db: Db, tableId: string, nowStr: string = now()): void {
  db.prepare(
    `
    UPDATE tables SET status = 'available', assigned_waiter_id = NULL, updated_at = ?
    WHERE id = ?
  `,
  ).run(nowStr, tableId);
}

export function transferOrderBetweenTables(args: {
  sourceTableId: string;
  targetTableId: string;
  orderId?: number | string;
  actorUserId?: string | null;
}): {
  order: any;
  sourceTable: any;
  targetTable: any;
} {
  const db = getDatabase();
  return withTxn(() => {
    const sourceTableId = args.sourceTableId;
    const targetTableId = args.targetTableId;
    if (targetTableId === sourceTableId) {
      throwTableError('Order is already on this table', 400, 'SAME_TABLE');
    }

    const sourceTable = assertTableExists(db, sourceTableId);
    const targetTable = assertTableExists(db, targetTableId);

    if (targetTable.is_active === 0) {
      throwTableError('Target table is deactivated', 409, 'TABLE_INACTIVE');
    }
    if (targetTable.status === 'cleaning') {
      throwTableError('Target table is being cleaned', 409, 'TABLE_CLEANING');
    }
    if (targetTable.status === 'held' || hasHeldCart(db, targetTableId)) {
      throwTableError('Target table has a held cart', 409, 'TABLE_HELD');
    }
    if (hasHeldCart(db, sourceTableId)) {
      throwTableError('Source table has a held cart', 409, 'TABLE_HELD');
    }

    const order = activeOrderForTable(db, sourceTableId, args.orderId) as any;
    if (!order) {
      throwTableError(
        args.orderId
          ? 'Active order not found on source table'
          : 'Source table has no active order',
        404,
        'ORDER_NOT_FOUND',
      );
    }

    const targetActive = activeOrderForTable(db, targetTableId);
    if (targetActive) {
      throwTableError('Target table already has an active order', 409, 'TARGET_TABLE_OCCUPIED');
    }

    const nowStr = now();
    const cas = db
      .prepare(
        `
      UPDATE orders SET table_id = ?, updated_at = ?
      WHERE id = ? AND table_id = ? AND ${ACTIVE_ORDER_STATUS_SQL}
    `,
      )
      .run(targetTableId, nowStr, order.id, sourceTableId);
    if (cas.changes === 0) {
      throwTableError('Transfer conflict — order already moved', 409, 'TRANSFER_CONFLICT');
    }

    db.prepare(
      `
      UPDATE tables SET status = 'available', assigned_waiter_id = NULL, updated_at = ?
      WHERE id = ?
    `,
    ).run(nowStr, sourceTableId);
    db.prepare(
      `
      UPDATE tables SET status = 'occupied', updated_at = ?
      WHERE id = ?
    `,
    ).run(nowStr, targetTableId);

    logAuditEvent({
      actorUserId: args.actorUserId ?? null,
      action: 'table.order_transferred',
      entityType: 'order',
      entityId: order.id,
      metadata: {
        source_table_id: sourceTableId,
        target_table_id: targetTableId,
        source_number: sourceTable.number,
        target_number: targetTable.number,
      },
    });

    const updatedOrder = parseRowJson(
      db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as any,
    );
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    const updatedSource = db.prepare('SELECT * FROM tables WHERE id = ?').get(sourceTableId) as any;
    const updatedTarget = db.prepare('SELECT * FROM tables WHERE id = ?').get(targetTableId) as any;

    return {
      order: {
        ...updatedOrder,
        items,
        table: { ...updatedTarget, name: updatedTarget.number },
      },
      sourceTable: tableShape(updatedSource, activeOrderForTable(db, sourceTableId)),
      targetTable: tableShape(updatedTarget, activeOrderForTable(db, targetTableId)),
    };
  });
}

/**
 * Unpaid-only merge (Phase 4.13 SAFE NOW): reparent items onto surviving order,
 * cancel source without stock restore, free source table.
 */
export function mergeUnpaidTables(args: {
  survivingTableId: string;
  sourceTableId: string;
  actorUserId?: string | null;
}): {
  survivingOrder: any;
  sourceOrderId: number | string;
  survivingTable: any;
  sourceTable: any;
} {
  const db = getDatabase();
  return withTxn(() => {
    const survivingTableId = args.survivingTableId;
    const sourceTableId = args.sourceTableId;
    if (survivingTableId === sourceTableId) {
      throwTableError('Cannot merge a table into itself', 400, 'SAME_TABLE');
    }

    assertTableExists(db, survivingTableId);
    assertTableExists(db, sourceTableId);

    if (hasHeldCart(db, survivingTableId) || hasHeldCart(db, sourceTableId)) {
      throwTableError('Cannot merge tables with held carts', 409, 'TABLE_HELD');
    }

    const survivingOrder = activeOrderForTable(db, survivingTableId) as any;
    const sourceOrder = activeOrderForTable(db, sourceTableId) as any;
    if (!survivingOrder) {
      throwTableError('Surviving table has no active order', 404, 'ORDER_NOT_FOUND');
    }
    if (!sourceOrder) {
      throwTableError('Source table has no active order', 404, 'ORDER_NOT_FOUND');
    }

    if (hasAnyBill(db, survivingOrder.id) || hasAnyBill(db, sourceOrder.id)) {
      throwTableError(
        'Cannot merge billed orders — ADR required for billed merge',
        409,
        'BILLED_MERGE_FORBIDDEN',
      );
    }
    if (hasSplitCheck(db, survivingOrder.id) || hasSplitCheck(db, sourceOrder.id)) {
      throwTableError('Cannot merge split-check orders', 409, 'SPLIT_MERGE_FORBIDDEN');
    }
    if (
      Number(survivingOrder.discount_amount || 0) > 0 ||
      Number(sourceOrder.discount_amount || 0) > 0
    ) {
      throwTableError(
        'Cannot merge orders with order-level discounts',
        409,
        'DISCOUNT_MERGE_FORBIDDEN',
      );
    }

    const nowStr = now();
    const moved = db
      .prepare('UPDATE order_items SET order_id = ?, updated_at = ? WHERE order_id = ?')
      .run(survivingOrder.id, nowStr, sourceOrder.id);
    if (moved.changes === 0) {
      throwTableError('Source order has no items to merge', 409, 'NO_ITEMS');
    }

    applyOrderMoneyRollup(db, survivingOrder.id, nowStr);

    db.prepare(
      `
      UPDATE orders SET
        status = 'cancelled',
        cancelled_at = ?,
        cancellation_reason = ?,
        subtotal = 0,
        tax_amount = 0,
        total = 0,
        updated_at = ?
      WHERE id = ?
    `,
    ).run(nowStr, 'Merged into table order', nowStr, sourceOrder.id);

    freeTableIfModule(db, sourceTableId, nowStr);
    db.prepare("UPDATE tables SET status = 'occupied', updated_at = ? WHERE id = ?").run(
      nowStr,
      survivingTableId,
    );

    logAuditEvent({
      actorUserId: args.actorUserId ?? null,
      action: 'table.merged',
      entityType: 'table',
      entityId: survivingTableId,
      metadata: {
        source_table_id: sourceTableId,
        surviving_order_id: survivingOrder.id,
        source_order_id: sourceOrder.id,
        items_moved: moved.changes,
      },
    });

    const updatedSurviving = parseRowJson(
      db.prepare('SELECT * FROM orders WHERE id = ?').get(survivingOrder.id) as any,
    );
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(survivingOrder.id);
    return {
      survivingOrder: { ...updatedSurviving, items },
      sourceOrderId: sourceOrder.id,
      survivingTable: tableShape(
        db.prepare('SELECT * FROM tables WHERE id = ?').get(survivingTableId) as any,
        activeOrderForTable(db, survivingTableId),
      ),
      sourceTable: tableShape(
        db.prepare('SELECT * FROM tables WHERE id = ?').get(sourceTableId) as any,
        activeOrderForTable(db, sourceTableId),
      ),
    };
  });
}

/**
 * Unpaid split: move selected items onto a new dine-in order on an available target table.
 */
export function splitOrderToTable(args: {
  sourceTableId: string;
  targetTableId: string;
  orderItemIds: Array<number | string>;
  actorUserId?: string | null;
}): {
  sourceOrder: any;
  newOrder: any;
  sourceTable: any;
  targetTable: any;
} {
  const db = getDatabase();
  return withTxn(() => {
    const sourceTableId = args.sourceTableId;
    const targetTableId = args.targetTableId;
    if (sourceTableId === targetTableId) {
      throwTableError('Cannot split onto the same table', 400, 'SAME_TABLE');
    }
    if (!args.orderItemIds?.length) {
      throwTableError('order_item_ids is required', 400, 'MISSING_ITEMS');
    }

    assertTableExists(db, sourceTableId);
    const targetTable = assertTableExists(db, targetTableId);
    if (targetTable.is_active === 0) {
      throwTableError('Target table is deactivated', 409, 'TABLE_INACTIVE');
    }
    if (hasHeldCart(db, sourceTableId) || hasHeldCart(db, targetTableId)) {
      throwTableError('Cannot split with held carts', 409, 'TABLE_HELD');
    }
    if (activeOrderForTable(db, targetTableId)) {
      throwTableError('Target table already has an active order', 409, 'TARGET_TABLE_OCCUPIED');
    }
    assertTableCanOpen(db, targetTableId);

    const sourceOrder = activeOrderForTable(db, sourceTableId) as any;
    if (!sourceOrder) {
      throwTableError('Source table has no active order', 404, 'ORDER_NOT_FOUND');
    }
    if (hasAnyBill(db, sourceOrder.id)) {
      throwTableError('Cannot split billed orders — ADR required', 409, 'BILLED_SPLIT_FORBIDDEN');
    }
    if (Number(sourceOrder.discount_amount || 0) > 0) {
      throwTableError(
        'Cannot split orders with order-level discounts',
        409,
        'DISCOUNT_SPLIT_FORBIDDEN',
      );
    }

    const placeholders = args.orderItemIds.map(() => '?').join(',');
    const items = db
      .prepare(
        `
      SELECT * FROM order_items
      WHERE order_id = ?
        AND id IN (${placeholders})
        AND status NOT IN ('cancelled', 'voided', 'void_adjustment')
    `,
      )
      .all(sourceOrder.id, ...args.orderItemIds) as any[];

    if (items.length !== args.orderItemIds.length) {
      throwTableError('One or more items not found on source order', 404, 'ITEM_NOT_FOUND');
    }

    const remaining = db
      .prepare(
        `
      SELECT COUNT(*) AS c FROM order_items
      WHERE order_id = ?
        AND id NOT IN (${placeholders})
        AND status NOT IN ('cancelled', 'voided', 'void_adjustment')
    `,
      )
      .get(sourceOrder.id, ...args.orderItemIds) as { c: number };
    if (Number(remaining.c) < 1) {
      throwTableError(
        'Split must leave at least one item on the source order',
        409,
        'SPLIT_EMPTY_SOURCE',
      );
    }

    const nowStr = now();
    const orderNumber = generateOrderNumber();
    const insert = db
      .prepare(
        `
      INSERT INTO orders (
        order_number, table_id, customer_id, user_id, type, guest_count,
        special_instructions, status, subtotal, tax_amount, discount_amount, total,
        delivery_charge, packaging_charge, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'dine_in', ?, ?, 'pending', 0, 0, 0, 0, 0, 0, ?, ?)
    `,
      )
      .run(
        orderNumber,
        targetTableId,
        sourceOrder.customer_id || null,
        args.actorUserId || sourceOrder.user_id || null,
        sourceOrder.guest_count || 1,
        sourceOrder.special_instructions || null,
        nowStr,
        nowStr,
      );
    const newOrderId = insert.lastInsertRowid;

    for (const item of items) {
      db.prepare('UPDATE order_items SET order_id = ?, updated_at = ? WHERE id = ?').run(
        newOrderId,
        nowStr,
        item.id,
      );
    }

    applyOrderMoneyRollup(db, sourceOrder.id, nowStr);
    applyOrderMoneyRollup(db, newOrderId, nowStr);

    // Order already inserted — CAS occupy only (assert happened before insert)
    markTableOccupiedCas(db, targetTableId, nowStr);
    db.prepare("UPDATE tables SET status = 'occupied', updated_at = ? WHERE id = ?").run(
      nowStr,
      sourceTableId,
    );

    logAuditEvent({
      actorUserId: args.actorUserId ?? null,
      action: 'table.split',
      entityType: 'table',
      entityId: sourceTableId,
      metadata: {
        target_table_id: targetTableId,
        source_order_id: sourceOrder.id,
        new_order_id: newOrderId,
        item_ids: args.orderItemIds.map(String),
      },
    });

    const updatedSource = parseRowJson(
      db.prepare('SELECT * FROM orders WHERE id = ?').get(sourceOrder.id) as any,
    );
    const newOrder = parseRowJson(
      db.prepare('SELECT * FROM orders WHERE id = ?').get(newOrderId) as any,
    );
    const sourceItems = db
      .prepare('SELECT * FROM order_items WHERE order_id = ?')
      .all(sourceOrder.id);
    const newItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(newOrderId);

    return {
      sourceOrder: { ...updatedSource, items: sourceItems },
      newOrder: { ...newOrder, items: newItems },
      sourceTable: tableShape(
        db.prepare('SELECT * FROM tables WHERE id = ?').get(sourceTableId) as any,
        activeOrderForTable(db, sourceTableId),
      ),
      targetTable: tableShape(
        db.prepare('SELECT * FROM tables WHERE id = ?').get(targetTableId) as any,
        activeOrderForTable(db, targetTableId),
      ),
    };
  });
}

export function assignWaiterToTable(args: {
  tableId: string;
  waiterUserId: string | null;
  actorUserId?: string | null;
}): any {
  const db = getDatabase();
  return withTxn(() => {
    const table = assertTableExists(db, args.tableId);
    let waiterId: string | null = args.waiterUserId;
    if (waiterId) {
      const user = db
        .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
        .get(waiterId) as any;
      if (!user) {
        throwTableError('Waiter user not found', 404, 'WAITER_NOT_FOUND');
      }
      const allowed = ['waiter', 'cashier', 'manager', 'owner'];
      if (!allowed.includes(user.role)) {
        throwTableError('User role cannot be assigned as floor waiter', 400, 'INVALID_WAITER_ROLE');
      }
    } else {
      waiterId = null;
    }

    const nowStr = now();
    db.prepare('UPDATE tables SET assigned_waiter_id = ?, updated_at = ? WHERE id = ?').run(
      waiterId,
      nowStr,
      args.tableId,
    );

    logAuditEvent({
      actorUserId: args.actorUserId ?? null,
      action: 'table.waiter_assigned',
      entityType: 'table',
      entityId: args.tableId,
      metadata: {
        assigned_waiter_id: waiterId,
        previous_waiter_id: table.assigned_waiter_id || null,
      },
    });

    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(args.tableId) as any;
    return tableShape(updated, activeOrderForTable(db, args.tableId));
  });
}

export function applyTableStatus(args: {
  tableId: string;
  status: string;
  actorUserId?: string | null;
}): any {
  const db = getDatabase();
  return withTxn(() => {
    if (!TABLE_STATUSES.includes(args.status as TableStatus)) {
      throwTableError(`Invalid status. Use: ${TABLE_STATUSES.join(', ')}`, 400, 'INVALID_STATUS');
    }
    const table = assertTableExists(db, args.tableId);
    const active = activeOrderForTable(db, args.tableId);
    const status = args.status as TableStatus;

    if (status === 'available' || status === 'reserved' || status === 'cleaning') {
      if (active) {
        throwTableError(
          'Cannot change status while table has an active order',
          409,
          'TABLE_HAS_ACTIVE_ORDER',
        );
      }
    }
    if (status === 'occupied' && !active) {
      throwTableError(
        'Cannot mark occupied without an active order',
        409,
        'OCCUPIED_REQUIRES_ORDER',
      );
    }
    if (status === 'held') {
      throwTableError(
        'Held status is managed by held-orders, not status PATCH',
        400,
        'HELD_VIA_HELD_ORDERS',
      );
    }

    const nowStr = now();
    const clearWaiter = status === 'available' ? null : table.assigned_waiter_id;
    if (status === 'available') {
      db.prepare(
        'UPDATE tables SET status = ?, assigned_waiter_id = NULL, updated_at = ? WHERE id = ?',
      ).run(status, nowStr, args.tableId);
    } else {
      db.prepare('UPDATE tables SET status = ?, updated_at = ? WHERE id = ?').run(
        status,
        nowStr,
        args.tableId,
      );
    }

    logAuditEvent({
      actorUserId: args.actorUserId ?? null,
      action: 'table.status_changed',
      entityType: 'table',
      entityId: args.tableId,
      metadata: {
        from: table.status,
        to: status,
        assigned_waiter_id: clearWaiter,
      },
    });

    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(args.tableId) as any;
    return tableShape(updated, activeOrderForTable(db, args.tableId));
  });
}
