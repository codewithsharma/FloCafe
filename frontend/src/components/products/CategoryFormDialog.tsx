'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { CATEGORY_COLORS } from './types';
import { cn } from '@/lib/utils';

export interface CategoryFormState {
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: CategoryFormState;
  onFormChange: (form: CategoryFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const inputClass =
  'w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text';

export function CategoryFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSubmit,
}: CategoryFormDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {editing ? t('products.editCategoryTitle') : t('products.addCategoryTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              {t('products.fieldName')}
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-small font-medium text-flo-text mb-1">
              {t('products.categoryDescription')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              className={inputClass}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-small font-medium text-flo-text mb-2">{t('products.colorLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.key}
                  onClick={() => onFormChange({ ...form, color: c.key })}
                  className={cn(
                    'px-3 py-1.5 min-h-11 rounded-flo-md text-xs font-medium border-2',
                    c.key === form.color ? 'border-flo-brand-600' : 'border-transparent',
                    c.bg,
                    c.text,
                  )}
                >
                  {t(c.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => onFormChange({ ...form, is_active: e.target.checked })}
              className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
            />
            <span className="text-small text-flo-text-secondary">{t('products.fieldActive')}</span>
          </label>
          <Button type="submit" className="w-full min-h-11">
            {editing ? t('common.update') : t('common.create')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
