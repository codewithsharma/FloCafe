'use client';

import { Loader2, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { lineReturnValue } from '@/lib/exchange/preview';
import type { ExchangeAttemptState } from '@/lib/exchange/types';
import type { Product } from '@/lib/types';

export interface ExchangeReturnLineDraft {
  orderItemId: string;
  productName: string;
  lineTotal: number;
  lineQuantity: number;
  returnQuantity: number;
  status?: string | null;
  selected: boolean;
  restockRequested: boolean;
}

export interface ExchangeReplacementDraft {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ExchangeDialogState {
  billId: number;
  orderId: number;
  orderNumber?: string;
  customerId?: string | number | null;
  reason: string;
  overridePin: string;
  paymentMethod: string;
  returnLines: ExchangeReturnLineDraft[];
  replacementLines: ExchangeReplacementDraft[];
}

export interface ExchangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ExchangeDialogState | null;
  onChange: (state: ExchangeDialogState) => void;
  products: Product[];
  productSearch: string;
  onProductSearchChange: (query: string) => void;
  onConfirm: () => void;
  onRetry: () => void;
  processing: boolean;
  attemptState: ExchangeAttemptState | null;
  fmt: (amount: number) => string;
}

function legLabel(state: ExchangeAttemptState | null, t: (k: string) => string): string {
  if (!state) return '';
  if (state.lastError) return t('orders.exchangeRecoveryRequired');
  if (state.refundLeg !== 'refund_complete') return t('orders.exchangeLegRefund');
  if (state.replacementLeg !== 'replacement_complete') return t('orders.exchangeLegReplacement');
  if (state.restockLeg === 'restock_pending') return t('orders.exchangeLegRestock');
  if (state.restockLeg === 'restock_complete' || state.restockLeg === 'restock_skipped') {
    return t('orders.exchangeComplete');
  }
  return t('orders.exchangeInProgress');
}

export function ExchangeDialog({
  open,
  onOpenChange,
  state,
  onChange,
  products,
  productSearch,
  onProductSearchChange,
  onConfirm,
  onRetry,
  processing,
  attemptState,
  fmt,
}: ExchangeDialogProps) {
  const { t } = useI18n();
  if (!state) return null;

  const selectedReturns = state.returnLines.filter((l) => l.selected && l.returnQuantity > 0);
  const returnTotal = selectedReturns.reduce((sum, line) => {
    try {
      return (
        sum +
        lineReturnValue({
          orderItemId: line.orderItemId,
          lineTotal: line.lineTotal,
          lineQuantity: line.lineQuantity,
          returnQuantity: line.returnQuantity,
          status: line.status,
        })
      );
    } catch {
      return sum;
    }
  }, 0);

  const replacementCatalogTotal = state.replacementLines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const difference = Number((replacementCatalogTotal - returnTotal).toFixed(2));

  const filteredProducts = products.filter(
    (p) =>
      p.is_active && (!productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())),
  );

  const canSubmit =
    selectedReturns.length > 0 &&
    state.replacementLines.length > 0 &&
    state.reason.trim().length > 0 &&
    state.overridePin.length > 0 &&
    selectedReturns.every((l) => l.returnQuantity > 0 && l.returnQuantity <= l.lineQuantity);

  const showRetry = Boolean(attemptState?.lastError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {t('orders.exchange')}
            {state.orderNumber ? ` #${state.orderNumber}` : ''}
          </DialogTitle>
        </DialogHeader>

        {attemptState ? (
          <p className="text-small text-flo-text-secondary" role="status">
            {legLabel(attemptState, t)}
            {attemptState.lastError ? `: ${attemptState.lastError}` : ''}
          </p>
        ) : null}

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <section>
            <h3 className="text-small font-medium text-flo-text mb-2">
              {t('orders.exchangeReturnItems')}
            </h3>
            <div className="space-y-2">
              {state.returnLines.map((line, idx) => (
                <div
                  key={line.orderItemId}
                  className="rounded-flo-md border border-flo-border p-3 space-y-2"
                >
                  <label className="flex items-start gap-2 text-small text-flo-text">
                    <input
                      type="checkbox"
                      checked={line.selected}
                      onChange={(e) => {
                        const next = [...state.returnLines];
                        next[idx] = { ...line, selected: e.target.checked };
                        onChange({ ...state, returnLines: next });
                      }}
                    />
                    <span>{line.productName}</span>
                  </label>
                  {line.selected ? (
                    <>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`ex-ret-qty-${line.orderItemId}`}
                          className="text-xs text-flo-text-secondary"
                        >
                          {t('orders.exchangeReturnQty')}
                        </label>
                        <input
                          id={`ex-ret-qty-${line.orderItemId}`}
                          type="number"
                          min={1}
                          max={line.lineQuantity}
                          value={line.returnQuantity}
                          onChange={(e) => {
                            const next = [...state.returnLines];
                            next[idx] = { ...line, returnQuantity: Number(e.target.value) || 0 };
                            onChange({ ...state, returnLines: next });
                          }}
                          className="w-20 px-2 py-1 border border-flo-border rounded-flo-md text-small"
                        />
                        <span className="text-xs text-flo-text-secondary">
                          / {line.lineQuantity}
                        </span>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-flo-text">
                        <input
                          type="checkbox"
                          checked={line.restockRequested}
                          onChange={(e) => {
                            const next = [...state.returnLines];
                            next[idx] = { ...line, restockRequested: e.target.checked };
                            onChange({ ...state, returnLines: next });
                          }}
                        />
                        {t('orders.restockReturnedItem')}
                      </label>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-small font-medium text-flo-text mb-2">
              {t('orders.exchangeReplacementItems')}
            </h3>
            <div className="relative mb-2">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted"
              />
              <input
                type="text"
                placeholder={t('orders.searchMenu')}
                value={productSearch}
                onChange={(e) => onProductSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small"
              />
            </div>
            <div className="border border-flo-border rounded-flo-md max-h-32 overflow-y-auto mb-2">
              {filteredProducts.slice(0, 20).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    const pid = String(product.id);
                    const existing = state.replacementLines.find((l) => l.productId === pid);
                    if (existing) {
                      onChange({
                        ...state,
                        replacementLines: state.replacementLines.map((l) =>
                          l.productId === pid ? { ...l, quantity: l.quantity + 1 } : l,
                        ),
                      });
                    } else {
                      onChange({
                        ...state,
                        replacementLines: [
                          ...state.replacementLines,
                          {
                            productId: pid,
                            productName: product.name,
                            quantity: 1,
                            unitPrice: Number(product.price),
                          },
                        ],
                      });
                    }
                  }}
                  className="w-full flex justify-between px-3 py-2 text-left text-small hover:bg-flo-surface-muted border-b border-flo-border last:border-0"
                >
                  <span>{product.name}</span>
                  <span className="text-flo-text-secondary">{fmt(Number(product.price))}</span>
                </button>
              ))}
            </div>
            {state.replacementLines.map((line, idx) => (
              <div key={line.productId} className="flex items-center gap-2 py-1 text-small">
                <span className="flex-1">{line.productName}</span>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...state.replacementLines];
                    next[idx] = { ...line, quantity: Number(e.target.value) || 1 };
                    onChange({ ...state, replacementLines: next });
                  }}
                  className="w-16 px-2 py-1 border border-flo-border rounded-flo-md"
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...state,
                      replacementLines: state.replacementLines.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-red-600 p-1"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>

          <section className="rounded-flo-md bg-flo-surface-muted p-3 text-small space-y-1">
            <div className="flex justify-between">
              <span>{t('orders.exchangeRefundAmount')}</span>
              <span>{fmt(returnTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('orders.exchangeReplacementEstimate')}</span>
              <span>{fmt(replacementCatalogTotal)}</span>
            </div>
            <div className="flex justify-between font-medium text-flo-text">
              <span>{t('orders.exchangeDifference')}</span>
              <span>{fmt(difference)}</span>
            </div>
            <p className="text-xs text-flo-text-secondary pt-1">{t('orders.exchangeTaxNote')}</p>
          </section>

          <div>
            <label htmlFor="exchangeReason" className="block text-small font-medium mb-1">
              {t('orders.refundReason')}
            </label>
            <input
              id="exchangeReason"
              type="text"
              value={state.reason}
              onChange={(e) => onChange({ ...state, reason: e.target.value })}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small"
            />
          </div>

          <div>
            <label htmlFor="exchangePaymentMethod" className="block text-small font-medium mb-1">
              {t('orders.exchangePaymentMethod')}
            </label>
            <select
              id="exchangePaymentMethod"
              value={state.paymentMethod}
              onChange={(e) => onChange({ ...state, paymentMethod: e.target.value })}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small"
            >
              <option value="cash">{t('orders.exchangePaymentCash')}</option>
              <option value="card">{t('orders.exchangePaymentCard')}</option>
              <option value="upi">{t('orders.exchangePaymentUpi')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="exchangePin" className="block text-small font-medium mb-1">
              {t('orders.overridePinLabel')}
            </label>
            <input
              id="exchangePin"
              type="password"
              value={state.overridePin}
              onChange={(e) => onChange({ ...state, overridePin: e.target.value })}
              className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {showRetry ? (
            <Button className="min-h-11" onClick={onRetry} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t('orders.exchangeRetrying')}
                </>
              ) : (
                t('orders.exchangeRetry')
              )}
            </Button>
          ) : (
            <Button className="min-h-11" onClick={onConfirm} disabled={processing || !canSubmit}>
              {processing ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {t('orders.exchangeProcessing')}
                </>
              ) : (
                t('orders.confirmExchange')
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
