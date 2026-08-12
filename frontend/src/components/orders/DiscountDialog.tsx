'use client';

import { Banknote, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Order } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

export interface DiscountState {
  order: Order;
  type: 'percentage' | 'amount';
  value: number;
  reason: string;
}

export interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: DiscountState | null;
  onChange: (updates: Partial<Omit<DiscountState, 'order'>>) => void;
  onConfirm: () => void;
  discountRequiresApproval: boolean;
  discountPin: string;
  onDiscountPinChange: (pin: string) => void;
  currency: string;
  fmt: (amount: number) => string;
}

export function DiscountDialog({
  open,
  onOpenChange,
  state,
  onChange,
  onConfirm,
  discountRequiresApproval,
  discountPin,
  onDiscountPinChange,
  currency,
  fmt,
}: DiscountDialogProps) {
  const { t } = useI18n();

  if (!state) return null;

  const discountAmount =
    state.type === 'percentage'
      ? Number(state.order.subtotal) * state.value / 100
      : Number(state.value);

  const newTotal =
    state.type === 'percentage'
      ? Number(state.order.subtotal) * (1 - state.value / 100) + Number(state.order.tax_amount || 0)
      : Number(state.order.subtotal) - Number(state.value) + Number(state.order.tax_amount || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('orders.applyDiscountTitle', { number: state.order.order_number })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex rounded-flo-md overflow-hidden border border-flo-border">
            <button
              type="button"
              onClick={() => onChange({ type: 'percentage', value: 0 })}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 min-h-11 text-small font-medium transition-colors',
                state.type === 'percentage'
                  ? 'bg-flo-brand-600 text-white'
                  : 'bg-flo-surface text-flo-text-secondary hover:bg-flo-surface-muted',
              )}
            >
              <Percent size={14} />
              {t('common.percentage')}
            </button>
            <button
              type="button"
              onClick={() => onChange({ type: 'amount', value: 0 })}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 min-h-11 text-small font-medium transition-colors',
                state.type === 'amount'
                  ? 'bg-flo-brand-600 text-white'
                  : 'bg-flo-surface text-flo-text-secondary hover:bg-flo-surface-muted',
              )}
            >
              <Banknote size={14} />
              {t('common.amount')}
            </button>
          </div>

          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              {state.type === 'percentage'
                ? t('orders.discountPercentageLabel')
                : t('orders.discountAmountLabel')}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted text-small">
                {state.type === 'percentage' ? '%' : currency}
              </span>
              <input
                type="number"
                min={0}
                max={state.type === 'percentage' ? 100 : Number(state.order.total)}
                step={state.type === 'percentage' ? 1 : 0.01}
                value={state.value || ''}
                onChange={(e) => onChange({ value: Number(e.target.value) })}
                placeholder={state.type === 'percentage' ? '0' : '0.00'}
                className="w-full pl-8 pr-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              Reason (optional)
            </label>
            <input
              type="text"
              value={state.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              placeholder={t('orders.discountReason')}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
          </div>

          <div className="bg-flo-surface-muted rounded-flo-md p-3 space-y-1.5">
            <div className="flex justify-between text-small">
              <span className="text-flo-text-secondary">{t('common.subtotal')}</span>
              <span className="text-flo-text">{fmt(Number(state.order.subtotal))}</span>
            </div>
            <div className="flex justify-between text-small">
              <span className="text-flo-text-secondary">{t('common.tax')}</span>
              <span className="text-flo-text">{fmt(Number(state.order.tax_amount || 0))}</span>
            </div>
            <div className="flex justify-between text-small">
              <span className="text-flo-brand-600">
                {t('common.discount')}
                {state.type === 'percentage' && state.value > 0 && (
                  <span className="text-flo-text-muted ml-1">
                    {t('orders.percentOnSubtotal', { value: state.value })}
                  </span>
                )}
              </span>
              <span className="text-flo-brand-600">-{fmt(discountAmount)}</span>
            </div>
            <div className="border-t border-flo-border pt-1.5 flex justify-between text-small font-bold">
              <span className="text-flo-text">{t('orders.newTotal')}</span>
              <span className="text-flo-text">{fmt(newTotal)}</span>
            </div>
          </div>
        </div>

        {discountRequiresApproval && state.value > 0 && (
          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              {t('orders.managerPinLabel')}
            </label>
            <input
              type="password"
              value={discountPin}
              onChange={(e) => onDiscountPinChange(e.target.value)}
              placeholder={t('orders.managerPin')}
              maxLength={6}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700 text-white"
            onClick={onConfirm}
            disabled={state.value <= 0}
          >
            <Percent size={14} className="mr-1.5" />
            {t('orders.applyDiscount')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
