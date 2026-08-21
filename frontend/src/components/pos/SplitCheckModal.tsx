'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import type { Bill, Order, OrderItem } from '@/lib/types';

export function SplitCheckModal({
  bill,
  order,
  onClose,
  onSplit,
}: {
  bill: Bill;
  order: Order;
  onClose: () => void;
  onSplit: (bills: Bill[]) => void;
}) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const items = (order.items || []).filter(
    (item) => !['cancelled', 'voided'].includes(item.status),
  );
  const initialCount = Math.min(8, Math.max(2, order.guest_count || 2));
  const [count, setCount] = useState(initialCount);
  const [labels, setLabels] = useState(() =>
    Array.from({ length: initialCount }, (_, i) => `Guest ${i + 1}`),
  );
  const [allocations, setAllocations] = useState<Record<number, number[]>>(() =>
    Object.fromEntries(
      items.map((item) => {
        const slots = Array(initialCount).fill(0);
        for (let unit = 0; unit < item.quantity; unit++) slots[unit % initialCount]++;
        return [item.id, slots];
      }),
    ),
  );
  const [saving, setSaving] = useState(false);

  const resize = (next: number) => {
    next = Math.min(20, Math.max(2, next));
    setLabels((old) => Array.from({ length: next }, (_, i) => old[i] || `Guest ${i + 1}`));
    setAllocations((old) =>
      Object.fromEntries(
        items.map((item) => {
          const slots = Array.from({ length: next }, (_, i) => old[item.id]?.[i] || 0);
          const assigned = slots.reduce((sum, value) => sum + value, 0);
          if (assigned < item.quantity) slots[0] += item.quantity - assigned;
          if (assigned > item.quantity)
            slots[0] = Math.max(0, slots[0] - (assigned - item.quantity));
          return [item.id, slots];
        }),
      ),
    );
    setCount(next);
  };

  const totals = useMemo(
    () =>
      Array.from({ length: count }, (_, checkIndex) =>
        items.reduce(
          (sum, item) =>
            sum + (Number(item.total) * (allocations[item.id]?.[checkIndex] || 0)) / item.quantity,
          0,
        ),
      ),
    [allocations, count, items],
  );

  const submit = async () => {
    const invalid =
      items.some(
        (item) =>
          (allocations[item.id] || []).reduce((sum, value) => sum + value, 0) !== item.quantity,
      ) ||
      Array.from({ length: count }, (_, check) =>
        items.every((item) => !(allocations[item.id]?.[check] > 0)),
      ).some(Boolean);
    if (invalid)
      return toast.error(
        t('pos.allocateAllItems', {
          defaultValue: 'Allocate every item and leave no guest check empty',
        }),
      );
    setSaving(true);
    try {
      const checks = Array.from({ length: count }, (_, checkIndex) => ({
        label: labels[checkIndex],
        items: items.flatMap((item) => {
          const quantity = allocations[item.id]?.[checkIndex] || 0;
          return quantity > 0 ? [{ order_item_id: item.id, quantity }] : [];
        }),
      }));
      const { data } = await api.post(`/bills/${bill.id}/split-check`, { checks });
      onSplit(data.bills);
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(message || t('pos.splitCheckFailed', { defaultValue: 'Unable to split check' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="p-5 border-b border-flo-border">
          <DialogTitle className="text-flo-text">
            {t('pos.splitCheck', { defaultValue: 'Split check' })}
          </DialogTitle>
          <DialogDescription className="text-flo-text-secondary">
            {t('pos.splitCheckHint', {
              defaultValue: 'Assign whole item quantities to each guest check.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="p-5 border-b border-flo-border flex items-center gap-3">
          <span className="text-sm text-flo-text-secondary">
            {t('pos.numberOfChecks', { defaultValue: 'Number of checks' })}
          </span>
          <button
            type="button"
            onClick={() => resize(count - 1)}
            aria-label={t('pos.decreaseQuantity', { defaultValue: 'Decrease quantity' })}
            className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded-full bg-flo-bg flex items-center justify-center text-flo-text hover:bg-flo-border"
          >
            <Minus size={13} aria-hidden />
          </button>
          <strong className="text-flo-text tabular-nums w-6 text-center">{count}</strong>
          <button
            type="button"
            onClick={() => resize(count + 1)}
            aria-label={t('pos.increaseQuantity', { defaultValue: 'Increase quantity' })}
            className="min-h-[var(--flo-touch-min)] min-w-[var(--flo-touch-min)] rounded-full bg-flo-bg flex items-center justify-center text-flo-text hover:bg-flo-border"
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
        <div className="overflow-auto p-5 flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2 sticky left-0 bg-flo-surface text-flo-text">
                  {t('pos.items')}
                </th>
                {Array.from({ length: count }, (_, i) => (
                  <th key={i} className="p-2 min-w-28">
                    <input
                      value={labels[i]}
                      onChange={(e) =>
                        setLabels((old) =>
                          old.map((label, n) => (n === i ? e.target.value.slice(0, 40) : label)),
                        )
                      }
                      className="w-full text-center border border-flo-border rounded-flo-md px-2 py-1 min-h-11 bg-flo-surface text-flo-text focus:ring-2 focus:ring-flo-brand-500 outline-none"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item: OrderItem) => (
                <tr key={item.id} className="border-t border-flo-border">
                  <td className="p-2 sticky left-0 bg-flo-surface">
                    <div className="font-medium text-flo-text">{item.product_name}</div>
                    <div className="text-xs text-flo-text-muted">
                      {item.quantity} × {fmt(Number(item.total) / item.quantity)}
                    </div>
                  </td>
                  {Array.from({ length: count }, (_, i) => (
                    <td key={i} className="p-2">
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={allocations[item.id]?.[i] || 0}
                        onChange={(e) => {
                          const value = Math.min(
                            item.quantity,
                            Math.max(0, Number(e.target.value) || 0),
                          );
                          setAllocations((old) => ({
                            ...old,
                            [item.id]: old[item.id].map((qty, n) => (n === i ? value : qty)),
                          }));
                        }}
                        className="w-full text-center border border-flo-border rounded-flo-md px-2 py-1 min-h-11 bg-flo-surface text-flo-text focus:ring-2 focus:ring-flo-brand-500 outline-none"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-flo-border font-semibold">
                <td className="p-2 text-flo-text">
                  {t('pos.estimatedItemsTotal', { defaultValue: 'Items total' })}
                </td>
                {totals.map((total, i) => (
                  <td key={i} className="p-2 text-center text-flo-brand-600">
                    {fmt(total)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <DialogFooter className="p-5 border-t border-flo-border gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose} className="min-h-11">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700 text-white"
          >
            {saving ? t('common.saving') : t('pos.createChecks', { defaultValue: 'Create checks' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
