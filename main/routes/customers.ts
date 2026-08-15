import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase, now, getSettingValue, withTxn } from '../db';
import { requireRole } from '../middleware/security';
import { parsePhoneE164, stripPhoneDigits } from '../lib/phone';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { logAuditEvent } from '../services/audit-log';
import { correlationId } from '../errors';
import {
  buildCustomer360,
  customerMatchesSegment,
  CustomerCrmError,
  getCrmMetrics,
  listCustomerNotes,
} from '../services/customer-crm';
import {
  customerCreateBodySchema,
  customerIdParamsSchema,
  customerListQuerySchema,
  customerNoteBodySchema,
  customerNoteIdParamsSchema,
  customerUpdateBodySchema,
} from '../validation/customers';

export function parseCustomer(c: any): any {
  if (!c) return c;
  return {
    ...c,
    tag_counts: c.tag_counts
      ? (() => {
          try {
            return JSON.parse(c.tag_counts);
          } catch {
            return null;
          }
        })()
      : null,
  };
}

function actorUserId(req: Request): string | null {
  return (req as Request & { user?: { userId?: string } }).user?.userId ?? null;
}

function auditCtx(req: Request) {
  return {
    requestId: correlationId(),
    clientIp: req.ip || req.socket.remoteAddress || null,
  };
}

const router = Router();

export function getWalletBalance(customerId: string | number | null): number {
  if (!customerId) return 0;
  const db = getDatabase();
  const credits = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger
    WHERE customer_id = ? AND type = 'credit'
  `,
    )
    .get(customerId) as { total: number };

  const debits = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger
    WHERE customer_id = ? AND type = 'debit'
  `,
    )
    .get(customerId) as { total: number };

  return Math.max(0, credits.total - debits.total);
}

// Cleanup endpoint: delete all customers with null IDs - must be before /:id
router.delete('/admin/cleanup', requireRole('owner'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM customers WHERE id IS NULL').run();
    res.json({ message: `Deleted ${result.changes} customers with null IDs` });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/alerts',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const result = db
        .prepare(
          `
      SELECT COUNT(*) as count 
      FROM customers 
      WHERE is_active = 1 
      AND phone IS NOT NULL AND phone != '' 
      AND phone != '+' || phone_digits
    `,
        )
        .get() as { count: number };

      res.json({ invalidPhonesCount: result.count });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  validateQuery(customerListQuerySchema),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      // #208: the previous version ran 4 correlated subqueries per customer
      // (visits, spent, wallet credits, wallet debits, last visit) and never
      // hit any index for `WHERE o.customer_id = c.id`. The equivalent join
      // uses the new `idx_orders_customer` and groups once. Aggregates across
      // customers sit in three CTEs so each scans its index once.
      let query = `
      WITH order_stats AS (
        SELECT customer_id,
          COUNT(*) AS visits_count,
          COALESCE(SUM(COALESCE(total_cents, CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER))), 0) AS total_spent_cents,
          COALESCE(SUM(COALESCE(total_cents, CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER))), 0) / 100.0 AS total_spent,
          MAX(created_at) AS last_visit_at
        FROM orders
        WHERE customer_id IS NOT NULL AND status != 'cancelled'
        GROUP BY customer_id
      ),
      ledger_credits AS (
        SELECT customer_id, COALESCE(SUM(amount), 0) AS credits
        FROM loyalty_ledger
        WHERE type = 'credit'
        GROUP BY customer_id
      ),
      ledger_debits AS (
        SELECT customer_id, COALESCE(SUM(amount), 0) AS debits
        FROM loyalty_ledger
        WHERE type = 'debit'
        GROUP BY customer_id
      )
      SELECT c.*,
        COALESCE(os.visits_count, 0) as visits_count,
        COALESCE(os.total_spent, 0) as total_spent,
        COALESCE(os.total_spent_cents, 0) as total_spent_cents,
        MAX(0, COALESCE(lc.credits, 0) - COALESCE(ld.debits, 0)) as wallet_balance,
        os.last_visit_at
      FROM customers c
      LEFT JOIN order_stats os ON os.customer_id = c.id
      LEFT JOIN ledger_credits lc ON lc.customer_id = c.id
      LEFT JOIN ledger_debits ld ON ld.customer_id = c.id
      WHERE 1=1
    `;
      const params: unknown[] = [];

      // Phase 3.6E: owner/manager may include inactive rows for deliberate locate/reactivate.
      // Cashiers/waiters (and omitted flag) keep the historical active-only list.
      const includeInactive =
        req.query.include_inactive === 'true' &&
        ['owner', 'manager'].includes(String((req as any).user?.role || ''));
      if (!includeInactive) {
        query += ' AND c.is_active = 1';
      }

      if (req.query.search) {
        const search = `%${req.query.search}%`;
        query += ' AND (c.name LIKE ? OR c.phone_digits LIKE ? OR c.email LIKE ?)';
        params.push(search, search, search);
      }

      if (req.query.filter === 'invalid_phones') {
        query += " AND c.phone IS NOT NULL AND c.phone != '' AND c.phone != '+' || c.phone_digits";
      }

      const sortField = (req.query.sort as string) || 'name';
      const sortOrder = (req.query.order as string) === 'desc' ? 'DESC' : 'ASC';

      const allowedSortFields: Record<string, string> = {
        name: 'c.name COLLATE NOCASE',
        phone: 'c.phone_digits',
        visits: 'visits_count',
        spent: 'total_spent',
        loyalty: 'wallet_balance',
        last_visit: 'last_visit_at',
      };

      const orderBy = allowedSortFields[sortField] || 'c.name COLLATE NOCASE';
      query += ` ORDER BY ${orderBy} ${sortOrder}`;

      if (req.query.per_page !== undefined) {
        const rawPerPage = String(req.query.per_page).trim();
        if (!/^\d+$/.test(rawPerPage)) {
          return res
            .status(400)
            .json({ error: 'Invalid per_page parameter. Must be a positive integer.' });
        }
        const parsed = parseInt(rawPerPage, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return res
            .status(400)
            .json({ error: 'Invalid per_page parameter. Must be a positive integer.' });
        }
        const limit = Math.min(parsed, 500);
        query += ` LIMIT ${limit}`;
      } else {
        // #208: unbounded default meant every customers list response fanned
        // the full backend on each search keystroke. Cap at 200 as a sensible
        // first-page default; clients that need more can page (cursor support
        // is a follow-up).
        query += ` LIMIT 200`;
      }

      let customers = db.prepare(query).all(...params) as Array<{ id: string }>;
      const segment = typeof req.query.segment === 'string' ? req.query.segment : '';
      if (segment) {
        customers = customers.filter((c) => customerMatchesSegment(String(c.id), segment));
      }
      res.json({ data: customers });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get('/metrics', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const metrics = getCrmMetrics();
    res.json({ metrics });
  } catch (error: unknown) {
    console.error('[API] CRM metrics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/:id/crm',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  validateParams(customerIdParamsSchema),
  (req: Request, res: Response) => {
    try {
      const crm = buildCustomer360(String(req.params.id));
      res.json({ crm });
    } catch (error: unknown) {
      if (error instanceof CustomerCrmError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('[API] Customer 360 error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/:id/notes',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  validateParams(customerIdParamsSchema),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json({ notes: listCustomerNotes(db, String(req.params.id)) });
    } catch (error: unknown) {
      console.error('[API] Customer notes list error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/:id/notes',
  requireRole('owner', 'manager', 'cashier'),
  validateParams(customerIdParamsSchema),
  validateBody(customerNoteBodySchema),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      const noteId = `cnote-${randomUUID()}`;
      const ts = now();
      const actor = actorUserId(req);
      withTxn(() => {
        db.prepare(
          `INSERT INTO customer_notes (id, customer_id, body, created_by_user_id, updated_by_user_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(noteId, req.params.id, String(req.body.body).trim(), actor, actor, ts, ts);
        logAuditEvent({
          actorUserId: actor,
          action: 'customer.note_created',
          entityType: 'customer_note',
          entityId: noteId,
          result: 'success',
          metadata: { customer_id: req.params.id },
          context: auditCtx(req),
        });
      });
      const note = db.prepare('SELECT * FROM customer_notes WHERE id = ?').get(noteId);
      res.status(201).json({ note });
    } catch (error: unknown) {
      console.error('[API] Customer note create error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.put(
  '/:id/notes/:noteId',
  requireRole('owner', 'manager'),
  validateParams(customerNoteIdParamsSchema),
  validateBody(customerNoteBodySchema),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const note = db
        .prepare(
          `SELECT * FROM customer_notes WHERE id = ? AND customer_id = ? AND deleted_at IS NULL`,
        )
        .get(req.params.noteId, req.params.id) as { id: string } | undefined;
      if (!note) return res.status(404).json({ error: 'Note not found' });
      const actor = actorUserId(req);
      const ts = now();
      withTxn(() => {
        db.prepare(
          `UPDATE customer_notes SET body = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`,
        ).run(String(req.body.body).trim(), actor, ts, note.id);
        logAuditEvent({
          actorUserId: actor,
          action: 'customer.note_updated',
          entityType: 'customer_note',
          entityId: String(note.id),
          result: 'success',
          metadata: { customer_id: req.params.id },
          context: auditCtx(req),
        });
      });
      const updated = db.prepare('SELECT * FROM customer_notes WHERE id = ?').get(note.id);
      res.json({ note: updated });
    } catch (error: unknown) {
      console.error('[API] Customer note update error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.delete(
  '/:id/notes/:noteId',
  requireRole('owner', 'manager'),
  validateParams(customerNoteIdParamsSchema),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const note = db
        .prepare(
          `SELECT * FROM customer_notes WHERE id = ? AND customer_id = ? AND deleted_at IS NULL`,
        )
        .get(req.params.noteId, req.params.id) as { id: string } | undefined;
      if (!note) return res.status(404).json({ error: 'Note not found' });
      const actor = actorUserId(req);
      const ts = now();
      withTxn(() => {
        db.prepare(
          `UPDATE customer_notes SET deleted_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`,
        ).run(ts, actor, ts, note.id);
        logAuditEvent({
          actorUserId: actor,
          action: 'customer.note_deleted',
          entityType: 'customer_note',
          entityId: String(note.id),
          result: 'success',
          metadata: { customer_id: req.params.id },
          context: auditCtx(req),
        });
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      console.error('[API] Customer note delete error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/:id',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  validateParams(customerIdParamsSchema),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const customerRaw = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!customerRaw) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      const customer = parseCustomer(customerRaw);

      const walletBalance = getWalletBalance(req.params.id as string);
      const loyaltyHistory = db
        .prepare(
          `
      SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50
    `,
        )
        .all(req.params.id);

      const recentOrders = db
        .prepare(
          `
      SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10
    `,
        )
        .all(req.params.id);

      res.json({ customer: { ...customer, walletBalance, loyaltyHistory, recentOrders } });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/:id/wallet',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const customerId = req.params.id as string;
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const balance = getWalletBalance(customerId);
      const transactions = db
        .prepare(
          `
      SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100
    `,
        )
        .all(customerId);

      res.json({ balance, transactions });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  validateBody(customerCreateBodySchema),
  (req: Request, res: Response) => {
    try {
      const { phone, name, email, address, notes, country_code } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Name is required' });
      }

      const db = getDatabase();

      let finalPhone = phone ? String(phone).trim() : null;
      let finalCountryCode = country_code ? String(country_code).trim() : null;

      if (finalPhone) {
        const tenantCountry = getSettingValue('country') || 'IN';
        const parsed = parsePhoneE164(finalPhone, tenantCountry);
        if (!parsed) {
          return res.status(400).json({
            message: 'Phone number is not valid. Use international format (e.g. +919876543210).',
          });
        }
        finalPhone = parsed.e164;
        finalCountryCode = parsed.countryCode;

        const phoneDigits = stripPhoneDigits(finalPhone);
        const existing = db
          .prepare('SELECT * FROM customers WHERE phone_digits = ?')
          .get(phoneDigits) as any;
        if (existing) {
          if (existing.is_active === 0) {
            db.prepare(
              `
            UPDATE customers SET
              name = ?,
              email = ?,
              country_code = COALESCE(NULLIF(?, ''), country_code),
              address = ?,
              notes = ?,
              is_active = 1,
              updated_at = ?
            WHERE id = ?
          `,
            ).run(
              String(name).trim(),
              email ? String(email).trim() : null,
              finalCountryCode,
              address ? String(address).trim() : null,
              notes ? String(notes).trim() : null,
              now(),
              existing.id,
            );
            const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
            logAuditEvent({
              actorUserId: actorUserId(req),
              action: 'customer.updated',
              entityType: 'customer',
              entityId: String(existing.id),
              result: 'success',
              metadata: { soft_reactivate: true },
              context: auditCtx(req),
            });
            return res.status(201).json({ customer });
          } else {
            return res.status(409).json({ message: 'Customer with this phone already exists' });
          }
        }
      }

      const id = `cust-${randomUUID()}`;
      const timestamp = now();
      db.prepare(
        `
      INSERT INTO customers (id, phone, name, email, country_code, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      ).run(
        id,
        finalPhone,
        String(name).trim(),
        email ? String(email).trim() : null,
        finalCountryCode,
        address ? String(address).trim() : null,
        notes ? String(notes).trim() : null,
        timestamp,
        timestamp,
      );

      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      logAuditEvent({
        actorUserId: actorUserId(req),
        action: 'customer.created',
        entityType: 'customer',
        entityId: id,
        result: 'success',
        metadata: { phone: finalPhone },
        context: auditCtx(req),
      });
      res.status(201).json({ customer });
    } catch (error: unknown) {
      console.error('[Customer POST error]', error);
      res.status(500).json({ message: 'Failed to create customer' });
    }
  },
);

router.put(
  '/:id',
  requireRole('owner', 'manager', 'cashier'),
  validateParams(customerIdParamsSchema),
  validateBody(customerUpdateBodySchema),
  (req: Request, res: Response) => {
    try {
      const { phone, name, email, address, notes, country_code } = req.body;
      const db = getDatabase();

      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      let finalPhone = phone ? String(phone).trim() : null;
      let finalCountryCode = country_code ? String(country_code).trim() : null;

      if (finalPhone) {
        const tenantCountry = getSettingValue('country') || 'IN';
        const parsed = parsePhoneE164(finalPhone, tenantCountry);
        if (!parsed) {
          return res.status(400).json({
            error: 'Phone number is not valid. Use international format (e.g. +919876543210).',
          });
        }
        finalPhone = parsed.e164;
        finalCountryCode = parsed.countryCode;

        const phoneDigits = stripPhoneDigits(finalPhone);
        const existing = db
          .prepare('SELECT id FROM customers WHERE phone_digits = ? AND id != ?')
          .get(phoneDigits, req.params.id) as any;
        if (existing) {
          return res.status(409).json({ error: 'Customer with this phone already exists' });
        }
      }

      db.prepare(
        `
      UPDATE customers SET
        phone = COALESCE(NULLIF(?, ''), phone),
        name = COALESCE(NULLIF(?, ''), name),
        email = COALESCE(NULLIF(?, ''), email),
        country_code = COALESCE(NULLIF(?, ''), country_code),
        address = COALESCE(NULLIF(?, ''), address),
        notes = COALESCE(NULLIF(?, ''), notes),
        updated_at = ?
      WHERE id = ?
    `,
      ).run(finalPhone, name, email, finalCountryCode, address, notes, now(), req.params.id);

      const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      logAuditEvent({
        actorUserId: actorUserId(req),
        action: 'customer.updated',
        entityType: 'customer',
        entityId: String(req.params.id),
        result: 'success',
        context: auditCtx(req),
      });
      res.json({ customer: updated });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// Phase 3.6E: reactivate flips lifecycle flag only — no loyalty/wallet/order writes.
// Auth matches POST / soft-reactivate-by-phone (no permission widening).
router.post(
  '/:id/reactivate',
  requireRole('owner', 'manager', 'cashier', 'waiter'),
  (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as
        { id: string; is_active: number } | undefined;
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      if (Number(customer.is_active) === 1) {
        return res.status(400).json({ error: 'Already active' });
      }

      db.prepare('UPDATE customers SET is_active = 1, updated_at = ? WHERE id = ?').run(
        now(),
        req.params.id,
      );
      const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      logAuditEvent({
        actorUserId: actorUserId(req),
        action: 'customer.updated',
        entityType: 'customer',
        entityId: String(req.params.id),
        result: 'success',
        metadata: { reactivated: true },
        context: auditCtx(req),
      });
      res.json({ customer: parseCustomer(updated) });
    } catch (error: unknown) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post('/:id/deactivate', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id) as
      { id: string; is_active: number } | undefined;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    if (Number(customer.is_active) === 0) {
      return res.status(400).json({ error: 'Already inactive' });
    }

    db.prepare('UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?').run(
      now(),
      req.params.id,
    );
    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    logAuditEvent({
      actorUserId: actorUserId(req),
      action: 'customer.archived',
      entityType: 'customer',
      entityId: String(req.params.id),
      result: 'success',
      context: auditCtx(req),
    });
    res.json({ customer: parseCustomer(updated) });
  } catch (error: unknown) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customers are never deletable — not even soft-deleted — by design: every
// row is permanently referenced by orders/bills/loyalty_ledger with no FK,
// and losing a customer's history/loyalty standing is worse than a stale
// record. There is intentionally no DELETE /:id route.

export const customerRoutes = router;
