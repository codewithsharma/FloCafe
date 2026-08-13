import { createHash, randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import {
  attachEffectiveAddons,
  utcDayBounds,
  generateBillNumber,
  getDatabase,
  getSettingValue,
  now,
  parseItemJson,
  parseRowJson,
  utcTodayDate,
  verifyPin,
  withTxn,
} from '../db';
import { notifyKdsUpdate, notifyOrderUpdated } from '../services/kds';
import { isModuleEnabled } from '../modules';
import { printReceipt } from '../services/receipt';
import { requireRole } from '../middleware/security';
import {
  applyPayableRounding,
  calculateConfiguredChargeTaxes,
  combineItemAndChargeTaxes,
  getActiveCountryPack,
  scaleItemTaxForDiscountRatio,
  computeDiscountTaxRatio,
} from '../services/tax';
import { sendEvent } from '../services/telemetry';
import { readTerminalIdHeaderFromRequest } from '../services/shift';
import { applyPaymentBatch } from '../services/payment-tender';


const router = Router();

function getOrderWithItems(db: ReturnType<typeof getDatabase>, orderId: number, billId?: number): any {
  const order = parseRowJson(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
  if (!order) return order;
  const allocations = billId === undefined ? [] : db.prepare('SELECT order_item_id, quantity FROM bill_items WHERE bill_id = ?').all(billId) as any[];
  const allocated = new Map(allocations.map((row) => [Number(row.order_item_id), Number(row.quantity)]));
  const itemRows = (db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[])
    .filter((item) => allocations.length === 0 || allocated.has(Number(item.id)))
    .map((item) => {
      const quantity = allocated.get(Number(item.id));
      if (quantity === undefined || quantity === Number(item.quantity)) return item;
      const ratio = quantity / Number(item.quantity);
      return { ...item, quantity, subtotal: Number((Number(item.subtotal) * ratio).toFixed(2)), tax_amount: Number((Number(item.tax_amount || 0) * ratio).toFixed(2)), total: Number((Number(item.total) * ratio).toFixed(2)) };
    });
  return {
    ...order,
    items: attachEffectiveAddons(db, itemRows.map(parseItemJson)),
  };
}

// Rate limiting for PIN validation (simple in-memory)
const pinAttempts = new Map<string, { count: number; resetAt: number }>();
const PIN_MAX_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkPinRateLimit(key: string): boolean {
  const nowMs = Date.now();
  if (pinAttempts.size > 500) {
    for (const [k, v] of pinAttempts.entries()) {
      if (nowMs > v.resetAt) pinAttempts.delete(k);
    }
  }
  const entry = pinAttempts.get(key);
  if (!entry || nowMs > entry.resetAt) {
    pinAttempts.set(key, { count: 1, resetAt: nowMs + PIN_WINDOW_MS });
    return true;
  }
  if (entry.count >= PIN_MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

router.get('/', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params: any[] = [];

    if (req.query.status) {
      query += ' AND payment_status = ?';
      params.push(req.query.status);
    }
    if (req.query.order_id) {
      query += ' AND order_id = ?';
      params.push(req.query.order_id);
    }
    if (req.query.customer_id) {
      query += ' AND customer_id = ?';
      params.push(req.query.customer_id);
    }
    if (req.query.today === 'true') {
      // #208: UTC-day range hits `idx_bills_created_at` instead of date() on every row.
      const [s, e] = utcDayBounds(utcTodayDate());
      query += ' AND created_at >= ? AND created_at < ?';
      params.push(s, e);
    }

    query += ' ORDER BY created_at DESC';

    // #208: default page size of 50 and a hard cap even when clients omit
    // per_page — the previous "unbounded" default could return every bill
    // ever when a caller left the param off.
    const requestedPerPage = req.query.per_page ? parseInt(req.query.per_page as string, 10) : NaN;
    const perPage = Number.isInteger(requestedPerPage) && requestedPerPage > 0
      ? Math.min(Math.max(requestedPerPage, 1), 500)
      : 50;
    query += ' LIMIT ?';
    params.push(perPage);

    const bills = db.prepare(query).all(...params).map(parseRowJson);
    res.json({ bills });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get('/:id', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const bill = parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id));
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const order = getOrderWithItems(db, (bill as any).order_id, Number((bill as any).id));
    const customer = (bill as any).customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get((bill as any).customer_id) : null;

    res.json({ bill: { ...bill, order, customer } });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get bill by order ID
router.get('/order/:orderId', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const bill = parseRowJson(db.prepare('SELECT * FROM bills WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(req.params.orderId));
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found for this order' });
    }

    const order = getOrderWithItems(db, (bill as any).order_id, Number((bill as any).id));
    const customer = (bill as any).customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get((bill as any).customer_id) : null;

    res.json({ bill: { ...bill, order, customer } });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post('/generate', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id) as any;
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const result = withTxn(() => {
      const existingBill = db.prepare('SELECT * FROM bills WHERE order_id = ?').get(order_id) as any;
      if (existingBill) {
        if (existingBill.split_group_id) return { bill: parseRowJson(existingBill), isNew: false };
        // Re-sync bill totals from the order in case discount/adjustments were applied
        // after the bill was first generated (e.g. discount applied → then checkout clicked).
        // Only sync if the bill is still unpaid (partial or full payments must not be changed).
        const orderSubtotal      = order.subtotal        || 0;
        const orderTaxAmount     = order.tax_amount      || 0;
        const orderDiscountAmt   = order.discount_amount || 0;
        const orderDelivery      = order.delivery_charge || 0;
        const orderPackaging     = order.packaging_charge|| 0;
        const orderTotal         = order.total           || 0;

        const pack = getActiveCountryPack(getSettingValue('country') || 'IN');
        const { total: roundedOrderTotal, adjustment: orderRoundOff } = applyPayableRounding(orderTotal, pack);

        const totalsChanged =
          (existingBill.payment_status === 'unpaid' || existingBill.payment_status === 'partial') && (
            existingBill.discount_amount !== orderDiscountAmt ||
            existingBill.subtotal        !== orderSubtotal    ||
            existingBill.total           !== roundedOrderTotal
          );

        if (totalsChanged) {
          const newBalance = Math.max(0, roundedOrderTotal - (existingBill.paid_amount || 0));
          db.prepare(`
            UPDATE bills
            SET subtotal       = ?,
                tax_amount     = ?,
                tax_breakdown  = ?,
                tax_snapshot   = ?,
                discount_amount= ?,
                discount_type  = ?,
                discount_value = ?,
                discount_reason= ?,
                delivery_charge= ?,
                packaging_charge= ?,
                round_off      = ?,
                total          = ?,
                balance        = ?,
                updated_at     = ?
            WHERE id = ?
          `).run(
            orderSubtotal, orderTaxAmount, order.tax_breakdown, order.tax_snapshot,
            orderDiscountAmt, order.discount_type, order.discount_value, order.discount_reason,
            orderDelivery, orderPackaging, orderRoundOff,
            roundedOrderTotal, newBalance, now(),
            existingBill.id
          );

          const updated = parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(existingBill.id));
          return { bill: updated, isNew: false };
        }

        return { bill: parseRowJson(existingBill), isNew: false };
      }

      // Generate bill number inside transaction to prevent race conditions
      const billNumber = generateBillNumber();
      const subtotal = order.subtotal || 0;
      const taxAmount = order.tax_amount || 0;
      const discountAmount = order.discount_amount || 0;
      const deliveryCharge = order.delivery_charge || 0;
      const packagingCharge = order.packaging_charge || 0;
      const pack = getActiveCountryPack(getSettingValue('country') || 'IN');
      const { total, adjustment: roundOff } = applyPayableRounding(order.total || 0, pack);

      const runResult = db.prepare(`
        INSERT INTO bills (bill_number, order_id, customer_id, subtotal, tax_amount, tax_breakdown, tax_snapshot,
          discount_amount, discount_type, discount_value, discount_reason,
          delivery_charge, packaging_charge, round_off, total, paid_amount, balance, payment_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)
      `).run(
        billNumber, order_id, order.customer_id, subtotal, taxAmount, order.tax_breakdown, order.tax_snapshot,
        discountAmount, order.discount_type, order.discount_value, order.discount_reason,
        deliveryCharge, packagingCharge, roundOff, total, 0, total, now(), now()
      );

      const newBill = parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(runResult.lastInsertRowid));
      return { bill: newBill, isNew: true };
    });

    notifyOrderUpdated();
    res.status(result.isNew ? 201 : 200).json({ bill: result.bill });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Divide one unpaid dine-in bill into independently payable guest checks.
// The kitchen order and inventory rows remain singular; bill_items stores only
// the whole-unit quantity allocated to each resulting check.
router.post('/:id/split-check', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    if (getSettingValue('split_checks_enabled') !== 'true') return res.status(403).json({ error: 'Split checks are not enabled' });
    const source = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id) as any;
    if (!source) return res.status(404).json({ error: 'Bill not found' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(source.order_id) as any;
    if (order?.type !== 'dine_in') return res.status(400).json({ error: 'Only dine-in checks can be split' });
    if (source.payment_status !== 'unpaid' || Number(source.paid_amount || 0) !== 0 || source.payment_details) {
      return res.status(409).json({ error: 'A check can only be split before any payment is recorded' });
    }
    if (source.split_group_id || Number((db.prepare('SELECT COUNT(*) AS n FROM bills WHERE order_id = ?').get(source.order_id) as any).n) > 1) {
      return res.status(409).json({ error: 'This check has already been split' });
    }
    const checks = req.body?.checks;
    if (!Array.isArray(checks) || checks.length < 2 || checks.length > 20) return res.status(400).json({ error: 'Create between 2 and 20 guest checks' });
    const activeItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? AND status NOT IN ('cancelled', 'voided') ORDER BY id").all(source.order_id) as any[];
    const itemById = new Map(activeItems.map((item) => [Number(item.id), item]));
    const assigned = new Map<number, number>();
    const normalized = checks.map((check: any, index: number) => {
      const label = String(check?.label || `Guest ${index + 1}`).trim().slice(0, 40) || `Guest ${index + 1}`;
      if (!Array.isArray(check?.items) || check.items.length === 0) throw Object.assign(new Error(`${label} must contain at least one item`), { statusCode: 400 });
      const seenItems = new Set<number>();
      const items = check.items.map((entry: any) => {
        const itemId = Number(entry?.order_item_id);
        const quantity = Number(entry?.quantity);
        const item = itemById.get(itemId);
        if (!item || !Number.isSafeInteger(quantity) || quantity < 1) throw Object.assign(new Error(`Invalid item allocation in ${label}`), { statusCode: 400 });
        if (seenItems.has(itemId)) throw Object.assign(new Error(`${label} contains the same item more than once`), { statusCode: 400 });
        seenItems.add(itemId);
        assigned.set(itemId, (assigned.get(itemId) || 0) + quantity);
        return { item, quantity };
      });
      return { label, items };
    });
    for (const item of activeItems) {
      if ((assigned.get(Number(item.id)) || 0) !== Number(item.quantity)) return res.status(400).json({ error: `Allocate all ${item.quantity} × ${item.product_name}` });
    }

    const result = withTxn(() => {
      const groupId = randomUUID();
      const weights = normalized.map((check: { items: { item: any; quantity: number }[] }) => check.items.reduce((sum: number, entry: { item: any; quantity: number }) => sum + Number(entry.item.total || entry.item.subtotal || 0) * entry.quantity / Number(entry.item.quantity), 0));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0) || normalized.length;
      const fields = ['subtotal', 'tax_amount', 'discount_amount', 'delivery_charge', 'packaging_charge', 'round_off', 'total'] as const;
      const allocations: Record<string, number[]> = {};
      for (const field of fields) {
        const totalMinor = Math.round(Number(source[field] || 0) * 100);
        let used = 0;
        allocations[field] = normalized.map((_check, index) => {
          const minor = index === normalized.length - 1 ? totalMinor - used : Math.round(totalMinor * weights[index] / totalWeight);
          used += minor;
          return minor / 100;
        });
      }
      const splitBreakdown = (index: number) => {
        const breakdown = typeof source.tax_breakdown === 'string' ? (() => { try { return JSON.parse(source.tax_breakdown); } catch { return null; } })() : source.tax_breakdown;
        if (!Array.isArray(breakdown)) return source.tax_breakdown;
        return JSON.stringify(breakdown.map((line: any) => ({ ...line, amount: Number((Number(line.amount || 0) * weights[index] / totalWeight).toFixed(2)) })));
      };
      const billIds: number[] = [];
      normalized.forEach((check, index) => {
        let billId: number;
        if (index === 0) {
          db.prepare(`UPDATE bills SET split_group_id = ?, split_label = ?, subtotal = ?, tax_amount = ?, tax_breakdown = ?, discount_amount = ?, delivery_charge = ?, packaging_charge = ?, round_off = ?, total = ?, balance = ?, updated_at = ? WHERE id = ?`)
            .run(groupId, check.label, allocations.subtotal[index], allocations.tax_amount[index], splitBreakdown(index), allocations.discount_amount[index], allocations.delivery_charge[index], allocations.packaging_charge[index], allocations.round_off[index], allocations.total[index], allocations.total[index], now(), source.id);
          billId = Number(source.id);
        } else {
          const inserted = db.prepare(`INSERT INTO bills (bill_number, order_id, customer_id, subtotal, tax_amount, tax_breakdown, tax_snapshot, discount_amount, discount_type, discount_value, discount_reason, delivery_charge, packaging_charge, round_off, total, paid_amount, balance, payment_status, split_group_id, split_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'unpaid', ?, ?, ?, ?)`)
            .run(generateBillNumber(), source.order_id, source.customer_id, allocations.subtotal[index], allocations.tax_amount[index], splitBreakdown(index), source.tax_snapshot, allocations.discount_amount[index], source.discount_type, source.discount_value, source.discount_reason, allocations.delivery_charge[index], allocations.packaging_charge[index], allocations.round_off[index], allocations.total[index], allocations.total[index], groupId, check.label, now(), now());
          billId = Number(inserted.lastInsertRowid);
        }
        billIds.push(billId);
        const insertItem = db.prepare('INSERT INTO bill_items (bill_id, order_item_id, quantity) VALUES (?, ?, ?)');
        for (const entry of check.items) insertItem.run(billId, entry.item.id, entry.quantity);
      });
      return billIds.map((id) => parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(id)));
    });
    void sendEvent('feature_used', { feature: 'split_checks', action: 'created', check_count: result.length });
    notifyOrderUpdated();
    res.status(201).json({ bills: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Unable to split check' });
  }
});


// Payment tender prepare/apply lives in main/services/payment-tender.ts (Phase 2.15).
// HTTP surface + Idempotency-Key hashing stay here.
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

function canonicalizePaymentRequest(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalizePaymentRequest).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalizePaymentRequest((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  if (value === undefined) return 'undefined';
  return JSON.stringify(value);
}

function paymentRequestHash(billId: string, payments: unknown, customerId: unknown): string {
  return createHash('sha256')
    .update(canonicalizePaymentRequest({ billId, payments, customer_id: customerId }))
    .digest('hex');
}

function paymentIdempotencyKey(req: Request): string {
  const supplied = req.get('Idempotency-Key')?.trim();
  if (!supplied) {
    throw Object.assign(new Error('Idempotency-Key is required'), {
      statusCode: 400,
      code: 'PAYMENT_IDEMPOTENCY_REQUIRED',
    });
  }
  if (supplied.length > MAX_IDEMPOTENCY_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(supplied)) {
    throw Object.assign(new Error('Idempotency-Key is invalid or too long'), {
      statusCode: 400,
      code: 'PAYMENT_IDEMPOTENCY_INVALID',
    });
  }
  return supplied;
}

router.post('/:id/payment', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const payment = req.body;
    if (!payment || typeof payment !== 'object' || Array.isArray(payment)) {
      return res.status(400).json({ error: 'Payment body must be an object' });
    }
    const db = getDatabase();
    const requestHash = paymentRequestHash(req.params.id as string, [payment], payment.customer_id);
    const result = withTxn(() => applyPaymentBatch(
      db, req.params.id as string, [payment], payment.customer_id, true,
      paymentIdempotencyKey(req), requestHash, String((req as any).user.userId),
      readTerminalIdHeaderFromRequest(req),
    ));

    const billStatus = (result.bill as any)?.payment_status;
    if (billStatus === 'paid') {
      if (isModuleEnabled('kds')) notifyKdsUpdate();
    }
    else notifyOrderUpdated();

    res.json(result);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    console.error('[API] Bill payment failed:', error);
    const payload: { error: string; code?: string } = {
      error: statusCode >= 500 ? 'Bill payment failed' : error.message,
    };
    if (error.code) payload.code = error.code;
    res.status(statusCode).json(payload);
  }
});

// POST /:id/payments — atomic split-payment batch endpoint (#177). Applies every
// payment line in the array within a single transaction, so a failure partway
// through (insufficient wallet balance, an invalid amount, etc.) rolls back every
// line already applied instead of leaving the bill partially paid.
router.post('/:id/payments', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Payment batch body must be an object' });
    }
    const { payments, customer_id: bodyCustomerId } = body;
    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ error: 'payments must be a non-empty array' });
    }

    const db = getDatabase();
    const requestHash = paymentRequestHash(req.params.id as string, payments, bodyCustomerId);
    const result = withTxn(() => applyPaymentBatch(
      db, req.params.id as string, payments, bodyCustomerId, false,
      paymentIdempotencyKey(req), requestHash, String((req as any).user.userId),
      readTerminalIdHeaderFromRequest(req),
    ));

    const billStatus = (result.bill as any)?.payment_status;
    if (billStatus === 'paid') {
      if (isModuleEnabled('kds')) notifyKdsUpdate();
    }
    else notifyOrderUpdated();

    res.json(result);
  } catch (error: any) {

    const statusCode = error.statusCode || 500;
    console.error('[API] Batch bill payment failed:', error);
    const payload: { error: string; code?: string } = {
      error: statusCode >= 500 ? 'Bill payment failed' : error.message,
    };
    if (error.code) payload.code = error.code;
    res.status(statusCode).json(payload);
  }
});

router.post('/:id/applyDiscount', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const { type, value, reason } = req.body;

    if (!type || !['percentage', 'amount'].includes(type)) {
      return res.status(400).json({ error: 'Valid discount type is required (percentage, amount)' });
    }

    if (value === undefined || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({ error: 'Valid discount value is required' });
    }

    const db = getDatabase();
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id) as any;
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (bill.payment_status === 'paid') {
      return res.status(400).json({ error: 'Cannot apply discount to a paid bill' });
    }
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(bill.order_id) as any;
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if approval is required
    const requiresApproval = getSettingValue('discount_requires_approval') === 'true';
    if (requiresApproval && value > 0) {
      const { override_pin } = req.body;
      if (!override_pin) {
        return res.status(403).json({ error: 'Manager PIN required for discounts', requiresApproval: true });
      }
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rateLimitKey = `pin:${clientIp}:bill-discount`;
      if (!checkPinRateLimit(rateLimitKey)) {
        return res.status(429).json({ error: 'Too many PIN attempts. Try again in 15 minutes.' });
      }
      const managerId = req.body.manager_id || req.body.user_id;
      let user: any = null;
      if (managerId) {
        const candidate = db.prepare("SELECT * FROM users WHERE id = ? AND pin_hash IS NOT NULL AND role IN ('owner', 'manager') AND is_active = 1").get(managerId) as any;
        if (candidate && verifyPin(candidate.pin_hash, override_pin)) {
          user = candidate;
        }
      }
      if (!user) {
        const managers = db.prepare("SELECT * FROM users WHERE pin_hash IS NOT NULL AND role IN ('owner', 'manager') AND is_active = 1").all() as any[];
        for (const u of managers) {
          if (verifyPin(u.pin_hash, override_pin)) {
            user = u;
            break;
          }
        }
      }
      if (!user) {
        return res.status(403).json({ error: 'Invalid manager PIN' });
      }
    }

    // Check discount mode
    const discountMode = getSettingValue('discount_mode') || 'percentage';
    if (discountMode === 'flat' && type === 'percentage') {
      return res.status(400).json({ error: 'Percentage discounts are disabled' });
    }
    if (discountMode === 'percentage' && type === 'amount') {
      return res.status(400).json({ error: 'Flat amount discounts are disabled' });
    }

    // Check against limits from settings (0 = no limit)
    if (type === 'percentage') {
      const maxPercentage = parseFloat(getSettingValue('discount_max_percentage') || '25');
      if (maxPercentage > 0 && value > maxPercentage) {
        return res.status(400).json({ error: `discount value exceeds maximum percentage of ${maxPercentage}` });
      }
    } else {
      const maxAmount = parseFloat(getSettingValue('discount_max_amount') || '0');
      if (maxAmount > 0 && value > maxAmount) {
        return res.status(400).json({ error: `discount value exceeds maximum amount of ${maxAmount}` });
      }
    }

    let discountAmount = 0;
    if (type === 'percentage') {
      discountAmount = (bill.subtotal * Number(value)) / 100;
    } else {
      discountAmount = Number(value);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    // Always derive the undiscounted tax basis from active item rows. Using
    // bill.tax_amount here compounds the previous discount whenever a manager
    // edits 10% to 20%. Keep inclusive tax out of the payable total.
    const activeItems = db.prepare(
      "SELECT * FROM order_items WHERE order_id = ? AND status != 'cancelled'"
    ).all(bill.order_id) as any[];
    let itemTaxAmount = 0;
    let itemExclusiveTax = 0;
    const itemBreakdowns: any[][] = [];
    const itemSnapshots: (string | null)[] = [];
    for (const item of activeItems) {
      const taxAmount = item.tax_amount || 0;
      itemTaxAmount += taxAmount;
      if (item.tax_type !== 'inclusive') itemExclusiveTax += taxAmount;
      if (item.tax_breakdown) {
        try {
          const breakdown = JSON.parse(item.tax_breakdown);
          if (Array.isArray(breakdown)) itemBreakdowns.push(breakdown);
        } catch { }
      }
      itemSnapshots.push(item.tax_snapshot || null);
    }

    const discountedSubtotal = Math.max(0, bill.subtotal - discountAmount);
    const taxRatio = computeDiscountTaxRatio(discountedSubtotal, bill.subtotal);
    // Bills historically always Math.round even when ratio === 1.
    const scaled = scaleItemTaxForDiscountRatio(itemTaxAmount, itemExclusiveTax, taxRatio);
    const newTaxAmount = scaled.taxAmount;
    const newExclusiveTax = scaled.exclusiveTaxAmount;
    const tenantInfo = {
      country: getSettingValue('country') || 'IN',
      business_type: getSettingValue('business_type') || 'restaurant',
      state_code: getSettingValue('state_code') || '',
      taxes_enabled: getSettingValue('taxes_enabled') === 'true',
    };
    const customer = bill.customer_id
      ? db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id) as any
      : null;
    const chargeTaxes = calculateConfiguredChargeTaxes(tenantInfo, {
      ...order,
      packaging_charge: bill.packaging_charge || 0,
      delivery_charge: bill.delivery_charge || 0,
      service_charge: bill.service_charge || 0,
    }, customer);
    const taxRollup = combineItemAndChargeTaxes({
      itemTaxAmount: newTaxAmount,
      itemExclusiveTaxAmount: newExclusiveTax,
      itemBreakdowns,
      itemSnapshots,
      itemTaxRatio: taxRatio,
      chargeTaxes,
    });
    const taxBreakdownJson = JSON.stringify(taxRollup.breakdowns);

    const preRoundTotal = discountedSubtotal + taxRollup.exclusiveTaxAmount
      + (bill.delivery_charge || 0) + (bill.packaging_charge || 0) + (bill.service_charge || 0);
    const exactTotal = Number(preRoundTotal.toFixed(2));
    const pack = getActiveCountryPack(tenantInfo.country);
    const { total: newTotal, adjustment: newRoundOff } = applyPayableRounding(exactTotal, pack);
    const newBalance = Math.max(0, newTotal - (bill.paid_amount || 0));

    const updatedBill = withTxn(() => {
      db.prepare(`
        UPDATE bills SET discount_amount = ?, discount_type = ?, discount_value = ?,
          discount_reason = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?,
          total = ?, round_off = ?, balance = ?, updated_at = ?
        WHERE id = ?
      `).run(
        discountAmount, type, value, reason || null, taxRollup.taxAmount, taxBreakdownJson,
        taxRollup.snapshotJson, newTotal, newRoundOff, newBalance, now(), req.params.id,
      );

      // orders.total stays the exact, unrounded amount — only the bill (the
      // settlement boundary) holds the pack-rounded payable total (#170).
      db.prepare(`
        UPDATE orders SET discount_amount = ?, discount_type = ?, discount_value = ?,
          discount_reason = ?, tax_amount = ?, tax_breakdown = ?, tax_snapshot = ?,
          total = ?, round_off = ?, updated_at = ?
        WHERE id = ?
      `).run(
        discountAmount, type, value, reason || null, taxRollup.taxAmount, taxBreakdownJson,
        taxRollup.snapshotJson, exactTotal, 0, now(), bill.order_id,
      );

      return parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id));
    });

    notifyOrderUpdated();
    res.json({ bill: updatedBill });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    console.error('[API] Bill discount failed:', error);
    res.status(statusCode).json({ error: statusCode >= 500 ? 'Internal server error' : error.message });
  }
});

router.post('/:id/markPrinted', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    db.prepare('UPDATE bills SET printed_at = ?, updated_at = ? WHERE id = ?')
      .run(now(), now(), req.params.id);

    const updatedBill = parseRowJson(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id));
    res.json({ bill: updatedBill });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/bills/:id/print - Print or reprint bill
router.post('/:id/print', requireRole('owner', 'manager', 'cashier'), async (req: Request, res: Response) => {
  try {
    const { print_type } = req.body;

    if (!print_type || !['receipt', 'reprint'].includes(print_type)) {
      return res.status(400).json({ error: 'print_type must be receipt or reprint' });
    }

    // User ID is set by the requireAuth middleware after JWT verification
    const userId = (req as any).user?.userId || (req as any).user?.id || 'unknown';

    const result = await printReceipt(parseInt(req.params.id as string), userId, print_type);
    res.json(result);
  } catch (error: any) {
    // Return 404 for "Bill not found", 500 for other errors
    const statusCode = error.message?.includes('Bill not found') ? 404 : 500;
    console.error('[API] Receipt printing failed:', error);
    res.status(statusCode).json({ error: statusCode >= 500 ? 'Receipt printing failed' : 'Bill not found' });
  }
});

// GET /api/bills/:id/print-history - Get print history for bill
router.get('/:id/print-history', requireRole('owner', 'manager', 'cashier'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const prints = db.prepare(`
      SELECT pl.*, u.name as user_name
      FROM print_logs pl
      LEFT JOIN users u ON pl.user_id = u.id
      WHERE pl.bill_id = ?
      ORDER BY pl.printed_at DESC
    `).all(req.params.id);

    res.json({ prints });
  } catch (error: any) {
    console.error("[API] Internal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export const billRoutes = router;
