'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { taxCategoryOptionLabel } from './helpers';
import { useI18n } from '@/hooks/useI18n';

export interface BulkTaxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legacyProductCount: number;
  taxCategories: { id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[];
  bulkTaxCategoryId: string;
  onBulkTaxCategoryIdChange: (id: string) => void;
  onApply: () => void;
  applying: boolean;
}

export function BulkTaxDialog({
  open,
  onOpenChange,
  legacyProductCount,
  taxCategories,
  bulkTaxCategoryId,
  onBulkTaxCategoryIdChange,
  onApply,
  applying,
}: BulkTaxDialogProps) {
  const { t } = useI18n();

  const inputClass =
    'w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-flo-text">Assign tax category</DialogTitle>
        </DialogHeader>
        {legacyProductCount === 0 ? (
          <p className="text-small text-flo-text-secondary">
            Every active product already has a tax category assigned.
          </p>
        ) : (
          <>
            <p className="text-small text-flo-text-secondary">
              Apply one tax category to all{' '}
              <span className="font-medium text-flo-text">{legacyProductCount}</span> active product(s) still on a
              legacy manual rate. Products with their own category already set are left untouched.
            </p>
            <label className="block text-small font-medium text-flo-text mb-1">Tax category</label>
            <select
              value={bulkTaxCategoryId}
              onChange={(e) => onBulkTaxCategoryIdChange(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('products.selectPlaceholder')}</option>
              {taxCategories.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {taxCategoryOptionLabel(tc)}
                </option>
              ))}
            </select>
            <DialogFooter className="gap-2 sm:justify-end">
              <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                className="min-h-11"
                onClick={onApply}
                disabled={!bulkTaxCategoryId || applying}
              >
                {applying ? t('products.csvImporting') : `Apply to ${legacyProductCount} product(s)`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
