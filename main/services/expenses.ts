/**
 * R9 Slice 1 — Expenses service (local SQLite SoR, integer cents).
 */

import { randomUUID } from 'crypto';
import { getDatabase, now, withTxn } from '../db';
import { logAuditEvent } from './audit-log';
import type { ExpenseCategory } from '../validation/expenses';

export class ExpenseServiceError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'ExpenseServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type ExpenseStatus = 'posted' | 'voided';

export interface ExpenseRow {
  id: string;
  amount_cents: number;
  category: string;
  description: string;
  notes: string | null;
  expense_date: string;
  status: ExpenseStatus;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  voided_by_user_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseInput {
  amount_cents: number;
  category: ExpenseCategory;
  description?: string;
  notes?: string | null;
  expense_date: string;
}

export interface UpdateExpenseInput {
  amount_cents?: number;
  category?: ExpenseCategory;
  description?: string;
  notes?: string | null;
  expense_date?: string;
}

export interface ListExpensesFilter {
  status?: 'posted' | 'voided' | 'all';
  category?: ExpenseCategory;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

function mapRow(row: Record<string, unknown>): ExpenseRow {
  return {
    id: String(row.id),
    amount_cents: Number(row.amount_cents),
    category: String(row.category),
    description: String(row.description ?? ''),
    notes: row.notes == null ? null : String(row.notes),
    expense_date: String(row.expense_date),
    status: String(row.status) as ExpenseStatus,
    created_by_user_id: row.created_by_user_id == null ? null : String(row.created_by_user_id),
    updated_by_user_id: row.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    voided_by_user_id: row.voided_by_user_id == null ? null : String(row.voided_by_user_id),
    voided_at: row.voided_at == null ? null : String(row.voided_at),
    void_reason: row.void_reason == null ? null : String(row.void_reason),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function requireExpense(db: ReturnType<typeof getDatabase>, id: string): ExpenseRow {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as
    Record<string, unknown> | undefined;
  if (!row) throw new ExpenseServiceError(404, 'Expense not found', 'EXPENSE_NOT_FOUND');
  return mapRow(row);
}

export function createExpense(input: CreateExpenseInput, actorUserId: string | null): ExpenseRow {
  if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
    throw new ExpenseServiceError(
      400,
      'amount_cents must be a positive integer',
      'EXPENSE_INVALID_AMOUNT',
    );
  }

  const id = randomUUID();
  const ts = now();
  const description = (input.description ?? '').trim();
  const notes = input.notes === undefined ? null : input.notes;

  return withTxn(() => {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO expenses (
         id, amount_cents, category, description, notes, expense_date, status,
         created_by_user_id, updated_by_user_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?)`,
    ).run(
      id,
      input.amount_cents,
      input.category,
      description,
      notes,
      input.expense_date,
      actorUserId,
      actorUserId,
      ts,
      ts,
    );

    logAuditEvent({
      action: 'expense.created',
      entityType: 'expense',
      entityId: id,
      actorUserId: actorUserId ?? undefined,
      metadata: {
        amount_cents: input.amount_cents,
        category: input.category,
        expense_date: input.expense_date,
      },
    });

    return requireExpense(db, id);
  });
}

export function getExpense(id: string): ExpenseRow {
  return requireExpense(getDatabase(), id);
}

export function listExpenses(filter: ListExpensesFilter = {}): ExpenseRow[] {
  const db = getDatabase();
  const status = filter.status ?? 'posted';
  const limit = filter.limit ?? 100;
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (status !== 'all') {
    clauses.push('status = ?');
    params.push(status);
  }
  if (filter.category) {
    clauses.push('category = ?');
    params.push(filter.category);
  }
  if (filter.date_from) {
    clauses.push('expense_date >= ?');
    params.push(filter.date_from);
  }
  if (filter.date_to) {
    clauses.push('expense_date <= ?');
    params.push(filter.date_to);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT * FROM expenses ${where}
       ORDER BY expense_date DESC, created_at DESC
       LIMIT ?`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map(mapRow);
}

export function updateExpense(
  id: string,
  input: UpdateExpenseInput,
  actorUserId: string | null,
): ExpenseRow {
  return withTxn(() => {
    const db = getDatabase();
    const current = requireExpense(db, id);
    if (current.status !== 'posted') {
      throw new ExpenseServiceError(
        409,
        'Only posted expenses can be updated',
        'EXPENSE_NOT_EDITABLE',
      );
    }

    if (input.amount_cents !== undefined) {
      if (!Number.isInteger(input.amount_cents) || input.amount_cents <= 0) {
        throw new ExpenseServiceError(
          400,
          'amount_cents must be a positive integer',
          'EXPENSE_INVALID_AMOUNT',
        );
      }
    }

    const next = {
      amount_cents: input.amount_cents ?? current.amount_cents,
      category: input.category ?? current.category,
      description: input.description !== undefined ? input.description.trim() : current.description,
      notes: input.notes !== undefined ? input.notes : current.notes,
      expense_date: input.expense_date ?? current.expense_date,
    };

    const ts = now();
    db.prepare(
      `UPDATE expenses SET
         amount_cents = ?, category = ?, description = ?, notes = ?, expense_date = ?,
         updated_by_user_id = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      next.amount_cents,
      next.category,
      next.description,
      next.notes,
      next.expense_date,
      actorUserId,
      ts,
      id,
    );

    logAuditEvent({
      action: 'expense.updated',
      entityType: 'expense',
      entityId: id,
      actorUserId: actorUserId ?? undefined,
      metadata: {
        amount_cents: next.amount_cents,
        category: next.category,
        expense_date: next.expense_date,
      },
    });

    return requireExpense(db, id);
  });
}

export function voidExpense(id: string, reason: string, actorUserId: string | null): ExpenseRow {
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ExpenseServiceError(400, 'void reason is required', 'EXPENSE_VOID_REASON_REQUIRED');
  }

  return withTxn(() => {
    const db = getDatabase();
    const current = requireExpense(db, id);
    if (current.status === 'voided') {
      throw new ExpenseServiceError(409, 'Expense is already voided', 'EXPENSE_ALREADY_VOIDED');
    }

    const ts = now();
    db.prepare(
      `UPDATE expenses SET
         status = 'voided',
         voided_by_user_id = ?,
         voided_at = ?,
         void_reason = ?,
         updated_by_user_id = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(actorUserId, ts, trimmed, actorUserId, ts, id);

    logAuditEvent({
      action: 'expense.voided',
      entityType: 'expense',
      entityId: id,
      actorUserId: actorUserId ?? undefined,
      reason: trimmed,
      metadata: {
        amount_cents: current.amount_cents,
        category: current.category,
        expense_date: current.expense_date,
      },
    });

    return requireExpense(db, id);
  });
}
