'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader, LoadingState, Panel } from '@/components/flo';
import { useI18n } from '@/hooks/useI18n';
import {
  EXPENSE_CATEGORIES,
  createExpense,
  formatExpenseAmount,
  listExpenses,
  voidExpense,
  type Expense,
  type ExpenseCategory,
} from '@/lib/expenses';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'posted' | 'voided' | 'all'>('posted');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amountMajor, setAmountMajor] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('supplies');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayIsoDate());
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string> = { status: statusFilter };
    if (categoryFilter) params.category = categoryFilter;
    listExpenses(params)
      .then((rows) => {
        if (!cancelled) setExpenses(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('expenses.failedToLoad'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, categoryFilter, refreshKey, t]);

  async function handleCreate() {
    const major = Number(amountMajor);
    if (!Number.isFinite(major) || major <= 0) {
      toast.error(t('expenses.invalidAmount'));
      return;
    }
    const amount_cents = Math.round(major * 100);
    if (amount_cents <= 0) {
      toast.error(t('expenses.invalidAmount'));
      return;
    }
    setSaving(true);
    try {
      await createExpense({
        amount_cents,
        category,
        description: description.trim(),
        notes: notes.trim() ? notes.trim() : null,
        expense_date: expenseDate,
      });
      toast.success(t('expenses.created'));
      setShowForm(false);
      setAmountMajor('');
      setDescription('');
      setNotes('');
      setExpenseDate(todayIsoDate());
      setCategory('supplies');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('expenses.createFailed');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) {
      toast.error(t('expenses.voidReasonRequired'));
      return;
    }
    setSaving(true);
    try {
      await voidExpense(voidTarget.id, voidReason.trim());
      toast.success(t('expenses.voided'));
      setVoidTarget(null);
      setVoidReason('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t('expenses.voidFailed');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('expenses.title')}
        description={t('expenses.subtitle')}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('expenses.add')}
          </Button>
        }
      />

      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'posted' | 'voided' | 'all')}
          >
            <option value="posted">{t('expenses.statusPosted')}</option>
            <option value="voided">{t('expenses.statusVoided')}</option>
            <option value="all">{t('expenses.statusAll')}</option>
          </select>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">{t('expenses.allCategories')}</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`expenses.category.${c}`)}
              </option>
            ))}
          </select>
        </div>

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('expenses.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">{t('expenses.colDate')}</th>
                  <th className="py-2 pr-3">{t('expenses.colCategory')}</th>
                  <th className="py-2 pr-3">{t('expenses.colDescription')}</th>
                  <th className="py-2 pr-3">{t('expenses.colAmount')}</th>
                  <th className="py-2 pr-3">{t('expenses.colStatus')}</th>
                  <th className="py-2">{t('expenses.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{expense.expense_date}</td>
                    <td className="py-2 pr-3">{t(`expenses.category.${expense.category}`)}</td>
                    <td className="py-2 pr-3">{expense.description || '—'}</td>
                    <td className="py-2 pr-3 font-medium">
                      {formatExpenseAmount(expense.amount_cents)}
                    </td>
                    <td className="py-2 pr-3">{expense.status}</td>
                    <td className="py-2">
                      {expense.status === 'posted' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setVoidTarget(expense);
                            setVoidReason('');
                          }}
                        >
                          {t('expenses.void')}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('expenses.amount')}</Label>
              <Input
                inputMode="decimal"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>{t('expenses.category')}</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`expenses.category.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{t('expenses.date')}</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
            <div>
              <Label>{t('expenses.description')}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>{t('expenses.notes')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={saving} onClick={handleCreate}>
              {t('expenses.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.voidTitle')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('expenses.voidReason')}</Label>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={saving} onClick={handleVoid}>
              {t('expenses.voidConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
