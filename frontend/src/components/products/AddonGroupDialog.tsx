'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';

export interface AddonFormState {
  name: string;
  description: string;
  is_required: boolean;
  allow_multiple_quantities: boolean;
  min_selection: number;
  max_selection: number;
}

export interface AddonListItem {
  id?: number | string;
  name: string;
  price: number;
  is_active?: boolean;
}

export interface AddonGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: AddonFormState;
  onFormChange: (form: AddonFormState) => void;
  addonList: AddonListItem[];
  onAddAddonItem: () => void;
  onUpdateAddonItem: (idx: number, field: string, value: string | number) => void;
  onRemoveAddonItem: (idx: number) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const inputClass =
  'w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text';

export function AddonGroupDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  addonList,
  onAddAddonItem,
  onUpdateAddonItem,
  onRemoveAddonItem,
  onSubmit,
}: AddonGroupDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {editing ? t('products.editAddonGroupTitle') : t('products.addAddonGroupTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
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
              <input
                type="text"
                value={form.description}
                onChange={(e) => onFormChange({ ...form, description: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">{t('products.addonMin')}</label>
                <input
                  type="number"
                  min="0"
                  value={form.min_selection}
                  onChange={(e) => onFormChange({ ...form, min_selection: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">{t('products.addonMax')}</label>
                <input
                  type="number"
                  min="0"
                  value={form.max_selection}
                  onChange={(e) => onFormChange({ ...form, max_selection: Number(e.target.value) })}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => onFormChange({ ...form, is_required: e.target.checked })}
                className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
              />
              <span className="text-small text-flo-text-secondary">{t('products.addonRequired')}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.allow_multiple_quantities}
                onChange={(e) => onFormChange({ ...form, allow_multiple_quantities: e.target.checked })}
                className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
              />
              <span className="text-small text-flo-text-secondary">Allow multiple quantities per add-on</span>
            </label>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-small font-medium text-flo-text">{t('products.addonAddons')}</label>
                <button type="button" onClick={onAddAddonItem} className="text-xs text-flo-brand-600 hover:underline min-h-11">
                  {t('products.addAddonInline')}
                </button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1fr)_6rem_1.5rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-flo-text-muted">
                  <span>{t('products.nameLabel')}</span>
                  <span>{t('products.columnPrice')}</span>
                  <span aria-hidden="true" />
                </div>
                {addonList.map((addon, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(0,1fr)_6rem_1.5rem] gap-2 items-center">
                    <input
                      type="text"
                      value={addon.name}
                      onChange={(e) => onUpdateAddonItem(idx, 'name', e.target.value)}
                      placeholder={t('common.namePlaceholder')}
                      className="flex-1 px-3 py-2 min-h-11 text-small border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={addon.price}
                      onChange={(e) => onUpdateAddonItem(idx, 'price', Number(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder={t('common.pricePlaceholder')}
                      aria-label={t('products.columnPrice')}
                      className="w-24 px-3 py-2 min-h-11 text-small border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveAddonItem(idx)}
                      className="text-flo-text-muted hover:text-red-500 min-h-11 min-w-11 flex items-center justify-center"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full min-h-11">
              {editing ? t('common.update') : t('common.create')}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
