'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Category } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';

export interface CategoryDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  productCount: number;
  categories: Category[];
  categoryId: number | null;
  reassignTo: string;
  onReassignToChange: (value: string) => void;
  onReassignDelete: () => void;
  onForceDelete: () => void;
}

export function CategoryDeleteDialog({
  open,
  onOpenChange,
  categoryName,
  productCount,
  categories,
  categoryId,
  reassignTo,
  onReassignToChange,
  onReassignDelete,
  onForceDelete,
}: CategoryDeleteDialogProps) {
  const { t } = useI18n();

  const inputClass =
    'w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('products.deleteCategoryTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-small text-flo-text-secondary">
          {t('products.deleteCategoryBody', { name: categoryName, count: productCount })}
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              {t('products.moveProductsTo')}
            </label>
            <select value={reassignTo} onChange={(e) => onReassignToChange(e.target.value)} className={inputClass}>
              <option value="">{t('products.selectCategoryPlaceholder')}</option>
              {categories
                .filter((c) => c.name.toLowerCase() === 'uncategorized' && c.id !== categoryId)
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {t('products.defaultCategoryTag', { name: c.name })}
                  </option>
                ))}
              {categories
                .filter((c) => c.name.toLowerCase() !== 'uncategorized' && c.id !== categoryId)
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <Button onClick={onReassignDelete} disabled={!reassignTo} className="w-full min-h-11">
            {t('products.moveAndDelete')}
          </Button>
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-flo-border" />
            <span className="mx-3 text-xs text-flo-text-muted">{t('common.or')}</span>
            <div className="flex-grow border-t border-flo-border" />
          </div>
          <Button
            type="button"
            onClick={onForceDelete}
            className="w-full min-h-11 bg-red-600 hover:bg-red-700 text-white"
          >
            {t('products.deleteCategoryAndProducts')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
