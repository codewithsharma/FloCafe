/**
 * R9 Slice 1 — Expenses HTTP routes (`/api/expenses/*`).
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  createExpense,
  getExpense,
  listExpenses,
  updateExpense,
  voidExpense,
  ExpenseServiceError,
} from '../services/expenses';
import {
  expenseCreateBodySchema,
  expenseIdParamsSchema,
  expenseListQuerySchema,
  expenseUpdateBodySchema,
  expenseVoidBodySchema,
} from '../validation/expenses';

const router = Router();

function actorId(req: Request): string | null {
  return (req as { user?: { userId?: string } }).user?.userId ?? null;
}

function mapError(error: unknown, res: Response): boolean {
  if (error instanceof ExpenseServiceError) {
    res.status(error.statusCode).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
    return true;
  }
  return false;
}

router.get(
  '/',
  requireRole('owner', 'manager'),
  validateQuery(expenseListQuerySchema),
  (req, res) => {
    try {
      const query = req.query as {
        status?: 'posted' | 'voided' | 'all';
        category?: import('../validation/expenses').ExpenseCategory;
        date_from?: string;
        date_to?: string;
        limit?: number;
      };
      const expenses = listExpenses({
        status: query.status,
        category: query.category,
        date_from: query.date_from,
        date_to: query.date_to,
        limit: query.limit,
      });
      res.json({ expenses });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] list expenses error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/',
  requireRole('owner', 'manager'),
  validateBody(expenseCreateBodySchema),
  (req, res) => {
    try {
      const expense = createExpense(req.body, actorId(req));
      res.status(201).json({ expense });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] create expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.get(
  '/:id',
  requireRole('owner', 'manager'),
  validateParams(expenseIdParamsSchema),
  (req, res) => {
    try {
      const expense = getExpense(String((req.params as { id: string }).id));
      res.json({ expense });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] get expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.patch(
  '/:id',
  requireRole('owner', 'manager'),
  validateParams(expenseIdParamsSchema),
  validateBody(expenseUpdateBodySchema),
  (req, res) => {
    try {
      const expense = updateExpense(
        String((req.params as { id: string }).id),
        req.body,
        actorId(req),
      );
      res.json({ expense });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] update expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.post(
  '/:id/void',
  requireRole('owner', 'manager'),
  validateParams(expenseIdParamsSchema),
  validateBody(expenseVoidBodySchema),
  (req, res) => {
    try {
      const expense = voidExpense(
        String((req.params as { id: string }).id),
        req.body.reason,
        actorId(req),
      );
      res.json({ expense });
    } catch (error: unknown) {
      if (mapError(error, res)) return;
      console.error('[API] void expense error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export { router as expenseRoutes };
