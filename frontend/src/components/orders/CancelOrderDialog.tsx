'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Order } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';

export interface CancelOrderState {
  order: Order;
  reason: string;
  freeTable: boolean;
  overridePin: string;
}

export interface CancelOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: CancelOrderState | null;
  onChange: (updates: Partial<Omit<CancelOrderState, 'order'>>) => void;
  onConfirm: () => void;
  cancelling: boolean;
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  state,
  onChange,
  onConfirm,
  cancelling,
}: CancelOrderDialogProps) {
  const { t } = useI18n();

  if (!state) return null;

  const needsPin =
    state.order.status !== 'pending' ||
    state.order.items?.some((i) =>
      ['preparing', 'ready', 'served', 'completed'].includes(i.status),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('orders.cancel')} #{state.order.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="cancelReason" className="block text-small font-medium text-flo-text mb-1">
              {t('common.reasonOptional')}
            </label>
            <input
              id="cancelReason"
              type="text"
              value={state.reason}
              onChange={(e) => onChange({ reason: e.target.value })}
              placeholder={t('orders.cancelReason')}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
            />
          </div>

          {state.order.type === 'dine_in' && state.order.table && (
            <div className="flex items-center gap-2">
              <input
                id="freeTable"
                type="checkbox"
                checked={state.freeTable}
                onChange={(e) => onChange({ freeTable: e.target.checked })}
                className="h-4 w-4 rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
              />
              <label htmlFor="freeTable" className="text-small text-flo-text-secondary">
                {t('orders.freeTable', { name: state.order.table.name })}
              </label>
            </div>
          )}

          {needsPin && (
            <div>
              <label htmlFor="overridePin" className="block text-small font-medium text-flo-text mb-1">
                {t('orders.overridePinLabel')}
              </label>
              <input
                id="overridePin"
                type="password"
                value={state.overridePin}
                onChange={(e) => onChange({ overridePin: e.target.value })}
                placeholder={t('orders.managerPin')}
                className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="min-h-11 bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={cancelling}
          >
            {cancelling ? t('orders.cancelling') : t('orders.confirmCancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
