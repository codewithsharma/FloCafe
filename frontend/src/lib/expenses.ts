/**
 * R9 Slice 1 — Expenses API client helpers.
 */

import api from './api';

export type ExpenseCategory =
  'supplies' | 'rent' | 'utilities' | 'wages' | 'maintenance' | 'marketing' | 'transport' | 'other';

export type ExpenseStatus = 'posted' | 'voided';

export interface Expense {
  id: string;
  amount_cents: number;
  category: ExpenseCategory | string;
  description: string;
  notes: string | null;
  expense_date: string;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string;
  void_reason?: string | null;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'supplies',
  'rent',
  'utilities',
  'wages',
  'maintenance',
  'marketing',
  'transport',
  'other',
];

export function formatExpenseAmount(cents: number, currency = 'INR'): string {
  const value = Number(cents) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)}`;
  }
}

export async function listExpenses(params?: Record<string, string>): Promise<Expense[]> {
  const { data } = await api.get('/expenses', { params });
  return data.expenses || [];
}

export async function createExpense(body: {
  amount_cents: number;
  category: ExpenseCategory;
  description?: string;
  notes?: string | null;
  expense_date: string;
}): Promise<Expense> {
  const { data } = await api.post('/expenses', body);
  return data.expense;
}

export async function updateExpense(
  id: string,
  body: Partial<{
    amount_cents: number;
    category: ExpenseCategory;
    description: string;
    notes: string | null;
    expense_date: string;
  }>,
): Promise<Expense> {
  const { data } = await api.patch(`/expenses/${id}`, body);
  return data.expense;
}

export async function voidExpense(id: string, reason: string): Promise<Expense> {
  const { data } = await api.post(`/expenses/${id}/void`, { reason });
  return data.expense;
}
