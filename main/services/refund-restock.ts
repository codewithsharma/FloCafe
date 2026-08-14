/**
 * Phase 4.2 — Optional refund restock (ADR-011).
 *
 * Separate from createBillRefund (T2): money commits first; this mutates stock
 * only when the active vertical allows restock (retail / retail-test).
 */
import { getDatabase, withTxn } from '../db';
import { getActiveVerticalId } from '../modules';
import {
  InventoryServiceError,
  restockTrackedForRefund,
  sumRefundRestockedQtyForOrderItem,
  type StockTrackedProduct,
} from './inventory';
import { RefundServiceError } from './refund';

const RESTOCK_ROLES = new Set(['owner', 'manager', 'cashier']);
const RESTOCK_VERTICALS = new Set(['retail', 'retail-test']);
const BLOCKED_ITEM_STATUSES = new Set(['voided', 'void_adjustment', 'cancelled']);

export function isRefundRestockVerticalEnabled(verticalId?: string): boolean {
  const id = verticalId ?? getActiveVerticalId();
  return RESTOCK_VERTICALS.has(id);
}

export interface CreateRefundRestockInput {
  refundId: string | number;
  orderItemId: unknown;
  quantity: unknown;
  actorUserId: string;
  actorRole: string;
  idempotencyKey: string;
  requestHash: string;
}

export interface RefundRestockResult {
  restock: {
    refund_id: string;
    order_item_id: string;
    product_id: string;
    quantity: number;
    stock_after: number;
  };
}

function loadRestockReplay(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  idempotencyKey: string,
  billId: number | string,
  requestHash: string,
): RefundRestockResult | null {
  const prior = db
    .prepare(
      `
    SELECT bill_id, request_hash, response_json
    FROM refund_idempotency
    WHERE user_id = ? AND idempotency_key = ?
  `,
    )
    .get(userId, idempotencyKey) as
    { bill_id: number; request_hash: string; response_json: string } | undefined;
  if (!prior) return null;
  if (String(prior.bill_id) !== String(billId) || prior.request_hash !== requestHash) {
    throw new RefundServiceError(
      409,
      'Idempotency-Key was already used for a different refund request',
      'REFUND_IDEMPOTENCY_CONFLICT',
    );
  }
  try {
    return JSON.parse(prior.response_json) as RefundRestockResult;
  } catch {
    throw new RefundServiceError(500, 'Stored restock response is invalid', 'REFUND_INTERNAL');
  }
}

export function createRefundRestock(input: CreateRefundRestockInput): RefundRestockResult {
  if (!RESTOCK_ROLES.has(String(input.actorRole))) {
    throw new RefundServiceError(403, 'Insufficient permissions', 'REFUND_FORBIDDEN');
  }
  if (!isRefundRestockVerticalEnabled()) {
    throw new RefundServiceError(
      403,
      'Refund restock is not available for this vertical',
      'RESTOCK_VERTICAL_DISABLED',
    );
  }
  if (!input.idempotencyKey || typeof input.idempotencyKey !== 'string') {
    throw new RefundServiceError(400, 'Idempotency-Key is required', 'REFUND_IDEMPOTENCY_REQUIRED');
  }
  if (!input.requestHash || typeof input.requestHash !== 'string') {
    throw new RefundServiceError(400, 'Restock request hash is required', 'REFUND_INTERNAL');
  }

  const orderItemId =
    input.orderItemId === undefined || input.orderItemId === null
      ? ''
      : String(input.orderItemId).trim();
  if (!orderItemId) {
    throw new RefundServiceError(400, 'order_item_id is required', 'RESTOCK_ITEM_REQUIRED');
  }

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new RefundServiceError(
      400,
      'Restock quantity must be a positive number',
      'RESTOCK_QUANTITY_INVALID',
    );
  }

  const db = getDatabase();
  const refund = db.prepare('SELECT * FROM refunds WHERE id = ?').get(input.refundId) as
    | {
        id: number | string;
        bill_id: number | string;
        order_id: string | null;
        status: string;
      }
    | undefined;
  if (!refund) {
    throw new RefundServiceError(404, 'Refund not found', 'RESTOCK_REFUND_NOT_FOUND');
  }
  if (!refund.order_id) {
    throw new RefundServiceError(400, 'Refund has no order to restock from', 'RESTOCK_NO_ORDER');
  }

  const replay = loadRestockReplay(
    db,
    input.actorUserId,
    input.idempotencyKey,
    refund.bill_id,
    input.requestHash,
  );
  if (replay) return replay;

  return withTxn(() => {
    const nested = loadRestockReplay(
      db,
      input.actorUserId,
      input.idempotencyKey,
      refund.bill_id,
      input.requestHash,
    );
    if (nested) return nested;

    const item = db
      .prepare(
        `
      SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.status,
             p.track_inventory, p.stock_quantity, p.name, p.deleted_at
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.id = ?
    `,
      )
      .get(orderItemId) as
      | {
          id: string | number;
          order_id: string;
          product_id: string;
          quantity: number;
          status: string;
          track_inventory: number | boolean | null;
          stock_quantity: number;
          name: string;
          deleted_at: string | null;
        }
      | undefined;

    if (!item || String(item.order_id) !== String(refund.order_id)) {
      throw new RefundServiceError(
        400,
        'Order item is not part of this refund',
        'RESTOCK_ITEM_INVALID',
      );
    }
    if (BLOCKED_ITEM_STATUSES.has(String(item.status))) {
      throw new RefundServiceError(
        400,
        'Order item cannot be restocked (voided or cancelled)',
        'RESTOCK_ITEM_NOT_RESTORABLE',
      );
    }
    if (item.deleted_at) {
      throw new RefundServiceError(400, 'Product not found', 'RESTOCK_PRODUCT_MISSING');
    }
    if (!item.track_inventory) {
      throw new RefundServiceError(400, 'Product does not track inventory', 'RESTOCK_NOT_TRACKED');
    }

    const lineQty = Number(item.quantity);
    const already = sumRefundRestockedQtyForOrderItem(db, item.id);
    const remaining = lineQty - already;
    if (quantity > remaining) {
      throw new RefundServiceError(
        400,
        `Restock quantity exceeds remaining restorable (${remaining})`,
        'RESTOCK_QUANTITY_EXCEEDS',
      );
    }

    const product: StockTrackedProduct = {
      id: item.product_id,
      name: item.name,
      track_inventory: item.track_inventory,
      stock_quantity: item.stock_quantity,
    };

    let stockAfter: number;
    try {
      ({ stockAfter } = restockTrackedForRefund(db, product, quantity, {
        refundId: refund.id,
        orderItemId: item.id,
      }));
    } catch (err) {
      if (err instanceof InventoryServiceError) {
        throw new RefundServiceError(err.statusCode, err.message, 'RESTOCK_INVENTORY_FAILED');
      }
      throw err;
    }

    const response: RefundRestockResult = {
      restock: {
        refund_id: String(refund.id),
        order_item_id: String(item.id),
        product_id: String(item.product_id),
        quantity,
        stock_after: stockAfter,
      },
    };

    const { now } = require('../db') as typeof import('../db');
    db.prepare(
      `
      INSERT INTO refund_idempotency (user_id, idempotency_key, bill_id, request_hash, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(
      input.actorUserId,
      input.idempotencyKey,
      refund.bill_id,
      input.requestHash,
      JSON.stringify(response),
      now(),
    );

    return response;
  });
}
