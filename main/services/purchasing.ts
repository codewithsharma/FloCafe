/**
 * R6 — Purchasing / suppliers / purchase orders / receiving.
 * Stock mutations go through Inventory applyPurchaseReceiptStock.
 */

import { createHash, randomUUID } from 'crypto';
import { getDatabase, now, withTxn } from '../db';
import { logAuditEvent } from './audit-log';
import {
  applyPurchaseReceiptStock,
  type StockTrackedProduct,
} from './inventory';
import {
  ALLOWED_INVENTORY_UNITS,
  convertQuantity,
  isAllowedInventoryUnit,
  type InventoryUnit,
} from './inventory-units';

export class PurchasingServiceError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'PurchasingServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

const LEGAL_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['ordered', 'cancelled'],
  ordered: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

function hashRequest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function lineTotalCents(orderedQty: number, unitCostCents: number): number {
  return Math.round(Number(orderedQty) * Number(unitCostCents));
}

function generatePoNumber(db: ReturnType<typeof getDatabase>): string {
  const day = now().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${day}-`;
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM purchase_orders WHERE po_number LIKE ?`,
    )
    .get(`${prefix}%`) as { c: number };
  const seq = String(Number(row.c) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

function requireSupplier(db: ReturnType<typeof getDatabase>, id: string) {
  const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new PurchasingServiceError(404, 'Supplier not found');
  return row;
}

function requirePo(db: ReturnType<typeof getDatabase>, id: string) {
  const row = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new PurchasingServiceError(404, 'Purchase order not found');
  return row;
}

function mapLine(row: Record<string, unknown>) {
  const ordered = Number(row.ordered_qty);
  const received = Number(row.received_qty);
  return {
    ...row,
    ordered_qty: ordered,
    received_qty: received,
    remaining_qty: Math.max(0, ordered - received),
  };
}

function loadPoLines(db: ReturnType<typeof getDatabase>, poId: string) {
  return (
    db
      .prepare(
        `SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY created_at, id`,
      )
      .all(poId) as Record<string, unknown>[]
  ).map(mapLine);
}

function recomputePoStatusFromLines(
  lines: Array<{ ordered_qty: number; received_qty: number }>,
): PurchaseOrderStatus {
  const anyReceived = lines.some((l) => l.received_qty > 0);
  const allReceived = lines.every((l) => l.received_qty + 1e-9 >= l.ordered_qty);
  if (!anyReceived) return 'ordered';
  if (allReceived) return 'received';
  return 'partially_received';
}

export function createSupplier(
  input: {
    name: string;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    tax_id?: string | null;
    notes?: string | null;
  },
  actorUserId: string | null,
): Record<string, unknown> {
  const db = getDatabase();
  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO suppliers (
      id, name, contact_name, phone, email, address, tax_id, notes, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    input.name.trim(),
    input.contact_name ?? null,
    input.phone ?? null,
    input.email ?? null,
    input.address ?? null,
    input.tax_id ?? null,
    input.notes ?? null,
    ts,
    ts,
  );
  const supplier = requireSupplier(db, id);
  logAuditEvent({
    action: 'supplier.created',
    entityType: 'supplier',
    entityId: id,
    actorUserId: actorUserId ?? undefined,
    metadata: { name: input.name },
  });
  return supplier;
}

export function listSuppliers(opts?: { activeOnly?: boolean }): Record<string, unknown>[] {
  const db = getDatabase();
  if (opts?.activeOnly) {
    return db
      .prepare(`SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name COLLATE NOCASE`)
      .all() as Record<string, unknown>[];
  }
  return db
    .prepare(`SELECT * FROM suppliers ORDER BY name COLLATE NOCASE`)
    .all() as Record<string, unknown>[];
}

export function getSupplier(id: string): Record<string, unknown> {
  return requireSupplier(getDatabase(), id);
}

export function updateSupplier(
  id: string,
  patch: {
    name?: string;
    contact_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    tax_id?: string | null;
    notes?: string | null;
    is_active?: boolean;
  },
  actorUserId: string | null,
): Record<string, unknown> {
  const db = getDatabase();
  requireSupplier(db, id);
  const current = requireSupplier(db, id);
  const next = {
    name: patch.name !== undefined ? patch.name.trim() : String(current.name),
    contact_name:
      patch.contact_name !== undefined ? patch.contact_name : (current.contact_name as string | null),
    phone: patch.phone !== undefined ? patch.phone : (current.phone as string | null),
    email: patch.email !== undefined ? patch.email : (current.email as string | null),
    address: patch.address !== undefined ? patch.address : (current.address as string | null),
    tax_id: patch.tax_id !== undefined ? patch.tax_id : (current.tax_id as string | null),
    notes: patch.notes !== undefined ? patch.notes : (current.notes as string | null),
    is_active:
      patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : Number(current.is_active),
  };
  db.prepare(
    `UPDATE suppliers SET name=?, contact_name=?, phone=?, email=?, address=?, tax_id=?, notes=?, is_active=?, updated_at=? WHERE id=?`,
  ).run(
    next.name,
    next.contact_name,
    next.phone,
    next.email,
    next.address,
    next.tax_id,
    next.notes,
    next.is_active,
    now(),
    id,
  );
  logAuditEvent({
    action: 'supplier.updated',
    entityType: 'supplier',
    entityId: id,
    actorUserId: actorUserId ?? undefined,
  });
  return requireSupplier(db, id);
}

export function deactivateSupplier(
  id: string,
  actorUserId: string | null,
): Record<string, unknown> {
  const db = getDatabase();
  requireSupplier(db, id);
  db.prepare(`UPDATE suppliers SET is_active = 0, updated_at = ? WHERE id = ?`).run(now(), id);
  logAuditEvent({
    action: 'supplier.deactivated',
    entityType: 'supplier',
    entityId: id,
    actorUserId: actorUserId ?? undefined,
  });
  return requireSupplier(db, id);
}

export function listSupplierProducts(supplierId: string): Record<string, unknown>[] {
  const db = getDatabase();
  requireSupplier(db, supplierId);
  return db
    .prepare(
      `SELECT sp.*, p.name as product_name
       FROM supplier_products sp
       JOIN products p ON p.id = sp.product_id
       WHERE sp.supplier_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(supplierId) as Record<string, unknown>[];
}

export function upsertSupplierProduct(
  supplierId: string,
  input: {
    product_id: string;
    supplier_sku?: string | null;
    purchase_unit: string;
    last_purchase_cost_cents?: number | null;
  },
  actorUserId: string | null,
): Record<string, unknown> {
  const db = getDatabase();
  requireSupplier(db, supplierId);
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(input.product_id);
  if (!product) throw new PurchasingServiceError(404, 'Product not found');
  if (!isAllowedInventoryUnit(input.purchase_unit)) {
    throw new PurchasingServiceError(400, 'Invalid purchase unit');
  }
  const existing = db
    .prepare(`SELECT id FROM supplier_products WHERE supplier_id = ? AND product_id = ?`)
    .get(supplierId, input.product_id) as { id: string } | undefined;
  const ts = now();
  if (existing) {
    db.prepare(
      `UPDATE supplier_products SET supplier_sku=?, purchase_unit=?, last_purchase_cost_cents=?, is_active=1, updated_at=? WHERE id=?`,
    ).run(
      input.supplier_sku ?? null,
      input.purchase_unit,
      input.last_purchase_cost_cents ?? null,
      ts,
      existing.id,
    );
    logAuditEvent({
      action: 'supplier.updated',
      entityType: 'supplier_product',
      entityId: existing.id,
      actorUserId: actorUserId ?? undefined,
    });
    return db.prepare('SELECT * FROM supplier_products WHERE id = ?').get(existing.id) as Record<
      string,
      unknown
    >;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO supplier_products (
      id, supplier_id, product_id, supplier_sku, purchase_unit, last_purchase_cost_cents, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    supplierId,
    input.product_id,
    input.supplier_sku ?? null,
    input.purchase_unit,
    input.last_purchase_cost_cents ?? null,
    ts,
    ts,
  );
  logAuditEvent({
    action: 'supplier.updated',
    entityType: 'supplier_product',
    entityId: id,
    actorUserId: actorUserId ?? undefined,
  });
  return db.prepare('SELECT * FROM supplier_products WHERE id = ?').get(id) as Record<
    string,
    unknown
  >;
}

export function createPurchaseOrder(
  input: {
    supplier_id: string;
    expected_date?: string | null;
    notes?: string | null;
    order_date?: string | null;
    tax_cents?: number;
    lines: Array<{
      product_id: string;
      purchase_unit: string;
      ordered_qty: number;
      unit_cost_cents: number;
      tax_cents?: number;
    }>;
  },
  actorUserId: string | null,
): { purchase_order: Record<string, unknown>; lines: Record<string, unknown>[] } {
  const db = getDatabase();
  const supplier = requireSupplier(db, input.supplier_id);
  if (!Number(supplier.is_active)) {
    throw new PurchasingServiceError(400, 'Cannot create PO for inactive supplier');
  }
  if (!input.lines?.length) {
    throw new PurchasingServiceError(400, 'At least one PO line is required');
  }

  return withTxn(() => {
    const id = randomUUID();
    const ts = now();
    const poNumber = generatePoNumber(db);
    const preparedLines: Array<{
      id: string;
      product_id: string;
      purchase_unit: string;
      ordered_qty: number;
      unit_cost_cents: number;
      tax_cents: number;
      line_total_cents: number;
    }> = [];
    for (const line of input.lines) {
      const product = db
        .prepare('SELECT id, inventory_unit FROM products WHERE id = ?')
        .get(line.product_id) as { id: string; inventory_unit?: string } | undefined;
      if (!product) throw new PurchasingServiceError(404, `Product not found: ${line.product_id}`);
      if (!isAllowedInventoryUnit(line.purchase_unit)) {
        throw new PurchasingServiceError(400, 'Invalid purchase unit');
      }
      const invUnit = (product.inventory_unit || 'pcs') as InventoryUnit;
      convertQuantity(line.ordered_qty, line.purchase_unit as InventoryUnit, invUnit);
      const lineTax = Number(line.tax_cents || 0);
      preparedLines.push({
        id: randomUUID(),
        product_id: line.product_id,
        purchase_unit: line.purchase_unit,
        ordered_qty: line.ordered_qty,
        unit_cost_cents: line.unit_cost_cents,
        tax_cents: lineTax,
        line_total_cents: lineTotalCents(line.ordered_qty, line.unit_cost_cents) + lineTax,
      });
    }

    const headerTax = Number(input.tax_cents || 0);
    const lineTaxSum = preparedLines.reduce((s, l) => s + l.tax_cents, 0);
    const taxCents = headerTax + lineTaxSum;
    const subtotalCents = preparedLines.reduce(
      (s, l) => s + lineTotalCents(l.ordered_qty, l.unit_cost_cents),
      0,
    );
    const totalCents = subtotalCents + taxCents;

    db.prepare(
      `INSERT INTO purchase_orders (
        id, supplier_id, po_number, status, order_date, expected_date, notes,
        subtotal_cents, tax_cents, total_cents, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.supplier_id,
      poNumber,
      input.order_date ?? ts.slice(0, 10),
      input.expected_date ?? null,
      input.notes ?? null,
      subtotalCents,
      taxCents,
      totalCents,
      actorUserId,
      ts,
      ts,
    );

    const insertLine = db.prepare(
      `INSERT INTO purchase_order_lines (
        id, purchase_order_id, product_id, purchase_unit, ordered_qty, unit_cost_cents,
        tax_cents, line_total_cents, received_qty, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    );
    for (const line of preparedLines) {
      insertLine.run(
        line.id,
        id,
        line.product_id,
        line.purchase_unit,
        line.ordered_qty,
        line.unit_cost_cents,
        line.tax_cents,
        line.line_total_cents,
        ts,
        ts,
      );
    }

    logAuditEvent({
      action: 'purchase_order.created',
      entityType: 'purchase_order',
      entityId: id,
      actorUserId: actorUserId ?? undefined,
      metadata: { po_number: poNumber, supplier_id: input.supplier_id },
    });

    return {
      purchase_order: requirePo(db, id),
      lines: loadPoLines(db, id),
    };
  });
}

export function listPurchaseOrders(opts?: {
  status?: string;
  supplierId?: string;
}): Record<string, unknown>[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) {
    clauses.push('status = ?');
    params.push(opts.status);
  }
  if (opts?.supplierId) {
    clauses.push('supplier_id = ?');
    params.push(opts.supplierId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT * FROM purchase_orders ${where} ORDER BY created_at DESC, po_number DESC`,
    )
    .all(...params) as Record<string, unknown>[];
}

export function getPurchaseOrder(id: string): {
  purchase_order: Record<string, unknown>;
  lines: Record<string, unknown>[];
} {
  const db = getDatabase();
  return { purchase_order: requirePo(db, id), lines: loadPoLines(db, id) };
}

export function transitionPurchaseOrderStatus(
  id: string,
  nextStatus: PurchaseOrderStatus,
  actorUserId: string | null,
): { purchase_order: Record<string, unknown>; lines: Record<string, unknown>[] } {
  const db = getDatabase();
  return withTxn(() => {
    const po = requirePo(db, id);
    const current = String(po.status) as PurchaseOrderStatus;
    const allowed = LEGAL_TRANSITIONS[current] || [];
    if (!allowed.includes(nextStatus)) {
      throw new PurchasingServiceError(
        409,
        `Illegal transition ${current} → ${nextStatus}`,
        'PO_ILLEGAL_TRANSITION',
      );
    }
    if (nextStatus === 'cancelled') {
      const lines = loadPoLines(db, id);
      if (lines.some((l) => Number(l.received_qty) > 0)) {
        throw new PurchasingServiceError(
          409,
          'Cannot cancel a purchase order that has received inventory',
          'PO_CANCEL_AFTER_RECEIVE',
        );
      }
    }
    // Manual status to partially_received/received only via receive path for ordered.
    if (
      (nextStatus === 'partially_received' || nextStatus === 'received') &&
      current === 'ordered'
    ) {
      throw new PurchasingServiceError(
        409,
        'Use receive endpoint to mark PO as received',
        'PO_ILLEGAL_TRANSITION',
      );
    }

    db.prepare(`UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?`).run(
      nextStatus,
      now(),
      id,
    );

    if (nextStatus === 'ordered') {
      logAuditEvent({
        action: 'purchase_order.ordered',
        entityType: 'purchase_order',
        entityId: id,
        actorUserId: actorUserId ?? undefined,
      });
    } else if (nextStatus === 'cancelled') {
      logAuditEvent({
        action: 'purchase_order.cancelled',
        entityType: 'purchase_order',
        entityId: id,
        actorUserId: actorUserId ?? undefined,
      });
    }

    return { purchase_order: requirePo(db, id), lines: loadPoLines(db, id) };
  });
}

export function receivePurchaseOrder(input: {
  purchaseOrderId: string;
  lines: Array<{ po_line_id: string; quantity: number }>;
  notes?: string | null;
  actorUserId: string;
  idempotencyKey: string;
}): {
  receipt: Record<string, unknown>;
  purchase_order: Record<string, unknown>;
  lines: Record<string, unknown>[];
} {
  const db = getDatabase();
  const requestHash = hashRequest({
    purchaseOrderId: input.purchaseOrderId,
    lines: input.lines,
    notes: input.notes ?? null,
  });

  const prior = db
    .prepare(
      `SELECT purchase_order_id, request_hash, response_json
       FROM purchase_receive_idempotency
       WHERE user_id = ? AND idempotency_key = ?`,
    )
    .get(input.actorUserId, input.idempotencyKey) as
    | { purchase_order_id: string; request_hash: string; response_json: string }
    | undefined;
  if (prior) {
    if (
      String(prior.purchase_order_id) !== String(input.purchaseOrderId) ||
      prior.request_hash !== requestHash
    ) {
      throw new PurchasingServiceError(
        409,
        'Idempotency-Key was already used for a different receive request',
        'PO_RECEIVE_IDEMPOTENCY_CONFLICT',
      );
    }
    return JSON.parse(prior.response_json);
  }

  const response = withTxn(() => {
    const nested = db
      .prepare(
        `SELECT purchase_order_id, request_hash, response_json
         FROM purchase_receive_idempotency
         WHERE user_id = ? AND idempotency_key = ?`,
      )
      .get(input.actorUserId, input.idempotencyKey) as
      | { purchase_order_id: string; request_hash: string; response_json: string }
      | undefined;
    if (nested) {
      return JSON.parse(nested.response_json);
    }

    const po = requirePo(db, input.purchaseOrderId);
    const status = String(po.status) as PurchaseOrderStatus;
    if (status !== 'ordered' && status !== 'partially_received') {
      throw new PurchasingServiceError(
        409,
        `Cannot receive purchase order in status ${status}`,
        'PO_RECEIVE_ILLEGAL_STATUS',
      );
    }
    if (!input.lines?.length) {
      throw new PurchasingServiceError(400, 'At least one receive line is required');
    }

    const ts = now();
    const receiptId = randomUUID();
    db.prepare(
      `INSERT INTO purchase_receipts (id, purchase_order_id, received_at, received_by, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      receiptId,
      input.purchaseOrderId,
      ts,
      input.actorUserId,
      input.notes ?? null,
      ts,
    );

    const insertReceiptLine = db.prepare(
      `INSERT INTO purchase_receipt_lines (
        id, receipt_id, po_line_id, product_id, quantity, purchase_unit,
        unit_cost_cents, inventory_qty, movement_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const recv of input.lines) {
      if (!Number.isFinite(recv.quantity) || recv.quantity <= 0) {
        throw new PurchasingServiceError(400, 'Receive quantity must be positive');
      }
      const line = db
        .prepare(`SELECT * FROM purchase_order_lines WHERE id = ? AND purchase_order_id = ?`)
        .get(recv.po_line_id, input.purchaseOrderId) as Record<string, unknown> | undefined;
      if (!line) {
        throw new PurchasingServiceError(404, `PO line not found: ${recv.po_line_id}`);
      }

      const cas = db
        .prepare(
          `UPDATE purchase_order_lines
           SET received_qty = received_qty + ?, updated_at = ?
           WHERE id = ? AND received_qty + ? <= ordered_qty + 1e-9`,
        )
        .run(recv.quantity, ts, recv.po_line_id, recv.quantity);
      if (cas.changes === 0) {
        throw new PurchasingServiceError(
          409,
          'Receive quantity exceeds outstanding ordered quantity',
          'PO_RECEIVE_EXCEEDS_ORDER',
        );
      }

      const product = db
        .prepare(
          `SELECT id, name, track_inventory, stock_quantity, inventory_unit, cost FROM products WHERE id = ?`,
        )
        .get(String(line.product_id)) as StockTrackedProduct & {
        inventory_unit?: string;
        cost?: number;
      };
      if (!product) throw new PurchasingServiceError(404, 'Product not found for PO line');

      const purchaseUnit = String(line.purchase_unit) as InventoryUnit;
      const invUnit = (product.inventory_unit || 'pcs') as InventoryUnit;
      const inventoryQty = convertQuantity(recv.quantity, purchaseUnit, invUnit);

      const { movementId } = applyPurchaseReceiptStock(db, product, inventoryQty, ts, {
        reason: 'purchase_receipt',
        referenceType: 'purchase_receipt',
        referenceId: receiptId,
      });

      // Catalog cost remains REAL until P0.3; store latest purchase as major units.
      const unitCostCents = Number(line.unit_cost_cents || 0);
      const catalogCost = unitCostCents / 100;
      db.prepare(`UPDATE products SET cost = ?, updated_at = ? WHERE id = ?`).run(
        catalogCost,
        ts,
        product.id,
      );
      db.prepare(
        `UPDATE supplier_products
         SET last_purchase_cost_cents = ?, updated_at = ?
         WHERE supplier_id = ? AND product_id = ?`,
      ).run(unitCostCents, ts, String(po.supplier_id), String(product.id));

      insertReceiptLine.run(
        randomUUID(),
        receiptId,
        recv.po_line_id,
        String(line.product_id),
        recv.quantity,
        purchaseUnit,
        unitCostCents,
        inventoryQty,
        movementId,
        ts,
      );
    }

    const lines = loadPoLines(db, input.purchaseOrderId);
    const nextStatus = recomputePoStatusFromLines(
      lines.map((l) => ({
        ordered_qty: Number(l.ordered_qty),
        received_qty: Number(l.received_qty),
      })),
    );
    db.prepare(`UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?`).run(
      nextStatus,
      ts,
      input.purchaseOrderId,
    );

    const receipt = db.prepare('SELECT * FROM purchase_receipts WHERE id = ?').get(receiptId) as Record<
      string,
      unknown
    >;
    const result = {
      receipt,
      purchase_order: requirePo(db, input.purchaseOrderId),
      lines,
    };

    logAuditEvent({
      action: 'purchase_receipt.created',
      entityType: 'purchase_receipt',
      entityId: receiptId,
      actorUserId: input.actorUserId,
      metadata: { purchase_order_id: input.purchaseOrderId },
    });
    logAuditEvent({
      action: 'purchase_receipt.completed',
      entityType: 'purchase_receipt',
      entityId: receiptId,
      actorUserId: input.actorUserId,
      metadata: { status: nextStatus },
    });

    db.prepare(
      `INSERT INTO purchase_receive_idempotency (
        user_id, idempotency_key, purchase_order_id, request_hash, response_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.actorUserId,
      input.idempotencyKey,
      input.purchaseOrderId,
      requestHash,
      JSON.stringify(result),
      ts,
    );

    return result;
  });

  return response;
}

export function listReceipts(purchaseOrderId: string): Record<string, unknown>[] {
  const db = getDatabase();
  requirePo(db, purchaseOrderId);
  return db
    .prepare(
      `SELECT * FROM purchase_receipts WHERE purchase_order_id = ? ORDER BY received_at DESC`,
    )
    .all(purchaseOrderId) as Record<string, unknown>[];
}

export { ALLOWED_INVENTORY_UNITS };
