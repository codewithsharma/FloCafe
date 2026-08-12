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

export interface VoidItemState {
  orderId: number;
  itemId: number;
  productName: string;
  overridePin: string;
}

export interface VoidItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: VoidItemState | null;
  onChange: (state: VoidItemState) => void;
  onConfirm: () => void;
  voiding: boolean;
}

export function VoidItemDialog({
  open,
  onOpenChange,
  state,
  onChange,
  onConfirm,
  voiding,
}: VoidItemDialogProps) {
  const { t } = useI18n();

  if (!state) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('orders.voidItem')}</DialogTitle>
        </DialogHeader>
        <p className="text-small text-flo-text-secondary">
          {t('orders.voidItemConfirm', { name: state.productName })}
        </p>

        <div>
          <label htmlFor="voidOverridePin" className="block text-small font-medium text-flo-text mb-1">
            {t('orders.overridePinLabel')}
          </label>
          <input
            id="voidOverridePin"
            type="password"
            autoFocus
            value={state.overridePin}
            onChange={(e) => onChange({ ...state, overridePin: e.target.value })}
            placeholder={t('orders.managerPin')}
            className="w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md text-small text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            className="min-h-11 bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={voiding || !state.overridePin}
          >
            {voiding ? t('orders.voidingItem') : t('orders.confirmVoidItem')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
