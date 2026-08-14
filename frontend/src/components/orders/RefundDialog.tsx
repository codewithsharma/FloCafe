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

export interface RefundRestockLineOption {
  orderItemId: string;
  productName: string;
  maxQuantity: number;
}

export interface RefundDialogState {
  billId: number;
  orderNumber?: string;
  paidAmount: number;
  overridePin: string;
  reason: string;
  amount: string;
  /** Retail-only: offer optional restock after money refund. */
  restockEnabled?: boolean;
  restockLines?: RefundRestockLineOption[];
  restockChecked?: boolean;
  restockOrderItemId?: string;
  restockQuantity?: string;
}

export interface RefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: RefundDialogState | null;
  onChange: (state: RefundDialogState) => void;
  onConfirm: () => void;
  refunding: boolean;
}

function selectedLine(state: RefundDialogState): RefundRestockLineOption | undefined {
  const lines = state.restockLines ?? [];
  return lines.find((line) => line.orderItemId === state.restockOrderItemId) ?? lines[0];
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

  const showRestock = Boolean(state.restockEnabled && (state.restockLines?.length ?? 0) > 0);
  const line = showRestock ? selectedLine(state) : undefined;
  const restockQty = Number(state.restockQuantity);
  const restockQtyOk =
    !state.restockChecked ||
    (line != null &&
      Number.isFinite(restockQty) &&
      restockQty > 0 &&
      restockQty <= line.maxQuantity &&
      Boolean(state.restockOrderItemId));

  const canConfirm = Boolean(state.reason.trim() && state.overridePin && restockQtyOk);

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
            <label
              htmlFor="refundReason"
              className="block text-small font-medium text-flo-text mb-1"
            >
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
            <label
              htmlFor="refundAmount"
              className="block text-small font-medium text-flo-text mb-1"
            >
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

          {showRestock && line ? (
            <div className="space-y-3 rounded-flo-md border border-flo-border p-3">
              <label className="flex items-start gap-2 text-small text-flo-text">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(state.restockChecked)}
                  onChange={(e) =>
                    onChange({
                      ...state,
                      restockChecked: e.target.checked,
                      restockOrderItemId: state.restockOrderItemId || line.orderItemId,
                      restockQuantity:
                        state.restockQuantity || String(Math.min(1, line.maxQuantity)),
                    })
                  }
                />
                <span>{t('orders.restockReturnedItem')}</span>
              </label>

              {state.restockChecked ? (
                <>
                  <div>
                    <label
                      htmlFor="refundRestockItem"
                      className="block text-small font-medium text-flo-text mb-1"
                    >
                      {t('orders.restockItem')}
                    </label>
                    <select
                      id="refundRestockItem"
                      value={state.restockOrderItemId || line.orderItemId}
                      onChange={(e) => {
                        const next = (state.restockLines ?? []).find(
                          (l) => l.orderItemId === e.target.value,
                        );
                        onChange({
                          ...state,
                          restockOrderItemId: e.target.value,
                          restockQuantity: next
                            ? String(Math.min(Number(state.restockQuantity) || 1, next.maxQuantity))
                            : state.restockQuantity,
                        });
                      }}
                      className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
                    >
                      {(state.restockLines ?? []).map((opt) => (
                        <option key={opt.orderItemId} value={opt.orderItemId}>
                          {opt.productName} (max {opt.maxQuantity})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="refundRestockQty"
                      className="block text-small font-medium text-flo-text mb-1"
                    >
                      {t('orders.restockQuantity')}
                    </label>
                    <input
                      id="refundRestockQty"
                      type="number"
                      min={1}
                      max={line.maxQuantity}
                      step={1}
                      value={state.restockQuantity ?? '1'}
                      onChange={(e) => onChange({ ...state, restockQuantity: e.target.value })}
                      className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
                    />
                    <p className="mt-1 text-xs text-flo-text-secondary">
                      {t('orders.restockQuantityHint', { max: String(line.maxQuantity) })}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="refundOverridePin"
              className="block text-small font-medium text-flo-text mb-1"
            >
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
