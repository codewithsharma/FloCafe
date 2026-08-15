/**
 * R3 — Kitchen item status + order kitchen priority.
 *
 * Centralizes KDS bump/unbump mutations: CAS, kitchen timestamps, audit.
 * Does NOT touch money/payments. Authz/station checks stay in routes/WS handlers.
 */

import type Database from 'better-sqlite3';
import { now as dbNow } from '../db';
import { logAuditEvent } from './audit-log';

export const KITCHEN_BUMP_STATUSES = ['pending', 'preparing', 'ready', 'served'] as const;
export type KitchenBumpStatus = (typeof KITCHEN_BUMP_STATUSES)[number];

export class KitchenStatusError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'KitchenStatusError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

type Db = Database.Database;

interface OrderItemKitchenRow {
  id: number | string;
  order_id: number | string;
  status: string;
  preparing_started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
}

function isBumpStatus(value: string): value is KitchenBumpStatus {
  return (KITCHEN_BUMP_STATUSES as readonly string[]).includes(value);
}

function computeKitchenTimestamps(
  current: OrderItemKitchenRow,
  newStatus: KitchenBumpStatus,
  nowStr: string,
): {
  preparing_started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
} {
  let preparing = current.preparing_started_at ?? null;
  let ready = current.ready_at ?? null;
  let served = current.served_at ?? null;

  if (newStatus === 'pending') {
    preparing = null;
    ready = null;
    served = null;
  } else if (newStatus === 'preparing') {
    ready = null;
    served = null;
  } else if (newStatus === 'ready') {
    served = null;
  }

  if (newStatus === 'preparing' && !preparing) preparing = nowStr;
  if (newStatus === 'ready' && !ready) ready = nowStr;
  if (newStatus === 'served' && !served) served = nowStr;

  return {
    preparing_started_at: preparing,
    ready_at: ready,
    served_at: served,
  };
}

export function applyKitchenItemStatus(
  db: Db,
  args: {
    itemId: string | number;
    status: string;
    expectedStatus?: string;
    actorUserId?: string | null;
    nowStr?: string;
  },
): { itemId: string | number; status: string; previousStatus: string; orderId: string | number } {
  if (!isBumpStatus(args.status)) {
    throw new KitchenStatusError(
      `Valid status required: ${KITCHEN_BUMP_STATUSES.join(', ')}`,
      400,
      'INVALID_STATUS',
    );
  }
  if (args.expectedStatus !== undefined && !isBumpStatus(args.expectedStatus)) {
    throw new KitchenStatusError(
      `Invalid expected status. Use: ${KITCHEN_BUMP_STATUSES.join(', ')}`,
      400,
      'INVALID_EXPECTED_STATUS',
    );
  }

  const item = db
    .prepare(
      `SELECT id, order_id, status, preparing_started_at, ready_at, served_at
       FROM order_items WHERE id = ?`,
    )
    .get(args.itemId) as OrderItemKitchenRow | undefined;
  if (!item) {
    throw new KitchenStatusError('Order item not found', 404, 'ITEM_NOT_FOUND');
  }

  const nowStr = args.nowStr ?? dbNow();
  const timestamps = computeKitchenTimestamps(item, args.status, nowStr);

  const updateResult =
    args.expectedStatus === undefined
      ? db
          .prepare(
            `UPDATE order_items
             SET status = ?, updated_at = ?,
                 preparing_started_at = ?, ready_at = ?, served_at = ?
             WHERE id = ? AND status NOT IN ('voided', 'void_adjustment', 'completed', 'cancelled')`,
          )
          .run(
            args.status,
            nowStr,
            timestamps.preparing_started_at,
            timestamps.ready_at,
            timestamps.served_at,
            args.itemId,
          )
      : db
          .prepare(
            `UPDATE order_items
             SET status = ?, updated_at = ?,
                 preparing_started_at = ?, ready_at = ?, served_at = ?
             WHERE id = ? AND status = ?`,
          )
          .run(
            args.status,
            nowStr,
            timestamps.preparing_started_at,
            timestamps.ready_at,
            timestamps.served_at,
            args.itemId,
            args.expectedStatus,
          );

  if (updateResult.changes !== 1) {
    throw new KitchenStatusError('STATUS_CONFLICT', 409, 'STATUS_CONFLICT');
  }

  logAuditEvent({
    actorUserId: args.actorUserId ?? null,
    action: 'kitchen.item_status_changed',
    entityType: 'order_item',
    entityId: item.id,
    metadata: {
      order_id: item.order_id,
      from: item.status,
      to: args.status,
      expected_status: args.expectedStatus ?? null,
      preparing_started_at: timestamps.preparing_started_at,
      ready_at: timestamps.ready_at,
      served_at: timestamps.served_at,
    },
  });

  return {
    itemId: item.id,
    status: args.status,
    previousStatus: item.status,
    orderId: item.order_id,
  };
}

export function setOrderKitchenPriority(
  db: Db,
  args: {
    orderId: string | number;
    priority: number;
    actorUserId?: string | null;
  },
): void {
  const priority = args.priority;
  if (typeof priority !== 'number' || !Number.isInteger(priority) || priority < 0 || priority > 9) {
    throw new KitchenStatusError(
      'priority must be an integer from 0 to 9',
      400,
      'INVALID_PRIORITY',
    );
  }

  const order = db
    .prepare('SELECT id, kitchen_priority FROM orders WHERE id = ?')
    .get(args.orderId) as { id: number | string; kitchen_priority: number | null } | undefined;
  if (!order) {
    throw new KitchenStatusError('Order not found', 404, 'ORDER_NOT_FOUND');
  }

  const previous = order.kitchen_priority ?? 0;
  const nowStr = dbNow();
  db.prepare('UPDATE orders SET kitchen_priority = ?, updated_at = ? WHERE id = ?').run(
    priority,
    nowStr,
    args.orderId,
  );

  logAuditEvent({
    actorUserId: args.actorUserId ?? null,
    action: 'kitchen.priority_changed',
    entityType: 'order',
    entityId: order.id,
    metadata: {
      from: previous,
      to: priority,
    },
  });
}
