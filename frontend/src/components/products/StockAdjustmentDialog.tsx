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
import { canSubmitStockAdjust, type StockAdjustAction } from '@/lib/stock-adjust';
import type { Product } from '@/lib/types';

export interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  action: StockAdjustAction;
  onActionChange: (action: StockAdjustAction) => void;
  quantity: string;
  onQuantityChange: (quantity: string) => void;
  onConfirm: () => void;
  submitting: boolean;
}

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  product,
  action,
  onActionChange,
  quantity,
  onQuantityChange,
  onConfirm,
  submitting,
}: StockAdjustmentDialogProps) {
  const { t } = useI18n();

  if (!product) return null;

  const currentStock = Number(product.stock_quantity ?? 0);
  const canConfirm = canSubmitStockAdjust(action, quantity) && !submitting;

  const inputClass =
    'w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text bg-flo-surface';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('stockAdjust.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-small font-medium text-flo-text">{product.name}</p>
            <p className="text-caption text-flo-text-muted mt-1">
              {t('stockAdjust.currentStock')}:{' '}
              <span className="text-numeric text-flo-text font-medium">{currentStock}</span>
            </p>
          </div>

          <div>
            <label
              htmlFor="stockAdjustAction"
              className="block text-small font-medium text-flo-text mb-1"
            >
              {t('stockAdjust.action')}
            </label>
            <select
              id="stockAdjustAction"
              value={action}
              onChange={(e) => onActionChange(e.target.value as StockAdjustAction)}
              disabled={submitting}
              className={inputClass}
            >
              <option value="increase">{t('stockAdjust.actionIncrease')}</option>
              <option value="decrease">{t('stockAdjust.actionDecrease')}</option>
              <option value="wastage">{t('stockAdjust.actionWastage')}</option>
              <option value="set">{t('stockAdjust.actionSet')}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="stockAdjustQuantity"
              className="block text-small font-medium text-flo-text mb-1"
            >
              {action === 'set' ? t('stockAdjust.newQuantity') : t('stockAdjust.quantity')}
            </label>
            <input
              id="stockAdjustQuantity"
              type="text"
              inputMode="decimal"
              autoFocus
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              disabled={submitting}
              className={inputClass}
              aria-describedby="stockAdjustHint"
            />
            <p id="stockAdjustHint" className="text-caption text-flo-text-muted mt-1">
              {t('stockAdjust.ledgerHint')}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
            {submitting ? t('stockAdjust.submitting') : t('stockAdjust.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
