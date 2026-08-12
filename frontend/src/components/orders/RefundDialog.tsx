'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export interface RefundDialogState {
  billId: number;
  orderNumber?: string;
  paidAmount: number;
  overridePin: string;
  reason: string;
  amount: string;
}

export interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: RefundDialogState | null;
  onChange: (state: RefundDialogState) => void;
  onConfirm: () => void;
  refunding: boolean;
}

export function RefundDialog({
  open,
  onOpenChange,
  state,
  onChange,
  onConfirm,
  refunding,
}: RefundDialogProps) {
  const { t } = useI18n();

  if (!state) return null;

  const canConfirm = Boolean(state.reason.trim() && state.overridePin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('orders.refund')}
            {state.orderNumber ? ` #${state.orderNumber}` : ''}
          </DialogTitle>
        </DialogHeader>
        <p className="text-small text-flo-text-secondary">{t('orders.refundConfirm')}</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="refundReason" className="block text-small font-medium text-flo-text mb-1">
              {t('orders.refundReason')}
            </label>
            <input
              id="refundReason"
              type="text"
              autoFocus
              value={state.reason}
              onChange={(e) => onChange({ ...state, reason: e.target.value })}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
          </div>

          <div>
            <label htmlFor="refundAmount" className="block text-small font-medium text-flo-text mb-1">
              {t('orders.refundAmount')}
            </label>
            <input
              id="refundAmount"
              type="text"
              inputMode="decimal"
              value={state.amount}
              onChange={(e) => onChange({ ...state, amount: e.target.value })}
              placeholder={t('orders.refundAmountHint')}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
          </div>

          <div>
            <label htmlFor="refundOverridePin" className="block text-small font-medium text-flo-text mb-1">
              {t('orders.overridePinLabel')}
            </label>
            <input
              id="refundOverridePin"
              type="password"
              value={state.overridePin}
              onChange={(e) => onChange({ ...state, overridePin: e.target.value })}
              placeholder={t('orders.managerPin')}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="min-h-11 bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={refunding || !canConfirm}
          >
            {refunding ? t('orders.refunding') : t('orders.confirmRefund')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
