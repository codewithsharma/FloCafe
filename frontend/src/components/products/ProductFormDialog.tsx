'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { tagLabel } from '@/components/pos/DietaryBadge';
import ImageUploader from '@/components/products/ImageUploader';
import type { AddonGroup, Category, Product } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { PRESET_TAGS } from './types';
import { taxCategoryOptionLabel } from './helpers';

export interface ProductFormState {
  name: string;
  category_id: string;
  price: string;
  cost_price: string;
  cb_percent: string;
  sku: string;
  barcode: string;
  tax_category_id: string;
  tax_behavior: string;
  description: string;
  track_inventory: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  is_active: boolean;
  tags: string[];
  customTag: string;
  addon_group_ids: (number | string)[];
  image_url: string | null;
}

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  form: ProductFormState;
  onFormChange: (form: ProductFormState) => void;
  onImageTouched: () => void;
  onSubmit: (e: React.FormEvent) => void;
  categories: Category[];
  addonGroups: AddonGroup[];
  taxCategories: { id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[];
  loyaltyEnabled: boolean;
  globalCashbackPercent: number;
  /** Show addon-group picker when Opervia `addons` module is enabled. */
  addonsEnabled: boolean;
  currency: string;
}

const inputClass =
  'w-full px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text';

export function ProductFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onImageTouched,
  onSubmit,
  categories,
  addonGroups,
  taxCategories,
  loyaltyEnabled,
  globalCashbackPercent,
  addonsEnabled,
  currency,
}: ProductFormDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-flo-text">
            {editing ? t('products.editProductTitle') : t('products.addProductTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          <form onSubmit={onSubmit} className="space-y-4 pb-2">
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
              <label htmlFor="product-description" className="block text-small font-medium text-flo-text mb-1">
                {t('products.categoryDescription')}
              </label>
              <textarea
                id="product-description"
                value={form.description}
                onChange={(e) => onFormChange({ ...form, description: e.target.value })}
                className={inputClass}
                rows={2}
              />
            </div>
            <div>
              <label className="block text-small font-medium text-flo-text mb-1">{t('products.fieldImage')}</label>
              <ImageUploader
                value={form.image_url}
                onChange={(val) => {
                  onFormChange({ ...form, image_url: val });
                  onImageTouched();
                }}
                productId={editing?.id ? String(editing.id) : undefined}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">
                  {t('products.fieldCategory')}
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => onFormChange({ ...form, category_id: e.target.value })}
                  className={inputClass}
                  required
                >
                  <option value="">{t('products.selectPlaceholder')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">{t('products.fieldSku')}</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => onFormChange({ ...form, sku: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-small font-medium text-flo-text mb-1">{t('products.fieldBarcode')}</label>
              <input
                type="text"
                value={form.barcode}
                onChange={(e) => onFormChange({ ...form, barcode: e.target.value })}
                placeholder={t('products.fieldBarcodePlaceholder')}
                className={`${inputClass} font-mono`}
              />
              <p className="text-xs text-flo-text-muted mt-1">{t('products.fieldBarcodeHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">
                  {t('products.priceLabel', { currency })}
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => onFormChange({ ...form, price: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">{t('products.fieldCostPrice')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) => onFormChange({ ...form, cost_price: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={inputClass}
                />
              </div>
            </div>
            {loyaltyEnabled && (
              <div className="bg-flo-surface-muted p-4 rounded-flo-md space-y-2">
                <label className="block text-small font-medium text-flo-text">{t('products.cashbackLabel')}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.cb_percent}
                    onChange={(e) => onFormChange({ ...form, cb_percent: e.target.value })}
                    placeholder={String(globalCashbackPercent)}
                    className="w-24 px-3 py-2 min-h-11 border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
                  />
                  <span className="text-flo-text-secondary font-medium">%</span>
                </div>
                <p className="text-xs text-flo-text-muted">
                  {form.cb_percent === ''
                    ? t('products.cashbackUsingGlobal', { rate: globalCashbackPercent })
                    : t('products.cashbackOverrideHint')}
                </p>
              </div>
            )}
            <div>
              <label className="block text-small font-medium text-flo-text mb-1">Tax rate group</label>
              <select
                value={form.tax_category_id}
                onChange={(e) => onFormChange({ ...form, tax_category_id: e.target.value })}
                className={inputClass}
              >
                <option value="">— No tax / exempt —</option>
                {taxCategories.map((tc) => (
                  <option key={tc.id} value={tc.id}>
                    {taxCategoryOptionLabel(tc)}
                  </option>
                ))}
              </select>
              {taxCategories.length === 0 && (
                <p className="text-xs text-flo-text-muted mt-1">
                  No tax groups are available until country taxes are enabled in Settings.
                </p>
              )}
              {taxCategories.length > 0 && (
                <p className="text-xs text-flo-text-muted mt-1">
                  The store default is selected automatically. Change this only when a product legally uses a different
                  rate or is exempt.
                </p>
              )}
            </div>
            {form.tax_category_id ? (
              <div>
                <label className="block text-small font-medium text-flo-text mb-1">Tax behavior</label>
                <select
                  value={form.tax_behavior}
                  onChange={(e) => onFormChange({ ...form, tax_behavior: e.target.value })}
                  className={inputClass}
                >
                  <option value="country_default">Country default</option>
                  <option value="inclusive">{t('products.taxInclusive')}</option>
                  <option value="exclusive">{t('products.taxExclusive')}</option>
                  <option value="exempt">Exempt</option>
                </select>
                <p className="text-xs text-flo-text-muted mt-1">
                  The rate is resolved from the active tax profile for this category, not entered manually.
                </p>
              </div>
            ) : (
              <p className="text-xs text-flo-text-muted -mt-2">
                No tax will be calculated or printed until a tax category is selected.
              </p>
            )}
            <div>
              <label className="block text-small font-medium text-flo-text mb-2">{t('products.fieldTags')}</label>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-flo-brand-50 text-flo-brand-600 rounded-flo-md text-xs font-medium"
                    >
                      {t(tagLabel(tag))}
                      <button
                        type="button"
                        onClick={() =>
                          onFormChange({ ...form, tags: form.tags.filter((tg) => tg !== tag) })
                        }
                        className="hover:text-red-500 min-h-11 min-w-11 flex items-center justify-center -m-2"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESET_TAGS.filter((pt) => !form.tags.includes(pt.key)).map((pt) => (
                  <button
                    key={pt.key}
                    type="button"
                    onClick={() => onFormChange({ ...form, tags: [...form.tags, pt.key] })}
                    className="px-2 py-1 min-h-11 text-xs border border-flo-border rounded-flo-md text-flo-text-secondary hover:border-flo-brand-500 hover:text-flo-brand-600 transition-colors"
                  >
                    + {t(pt.labelKey)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.customTag}
                  onChange={(e) => onFormChange({ ...form, customTag: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      const val = form.customTag.trim().toLowerCase().replace(/\s+/g, '_');
                      if (val && !form.tags.includes(val)) {
                        onFormChange({ ...form, tags: [...form.tags, val], customTag: '' });
                      }
                    }
                  }}
                  placeholder={t('products.tagPlaceholder')}
                  className="flex-1 px-3 py-1.5 min-h-11 text-small border border-flo-border rounded-flo-md outline-none focus:ring-2 focus:ring-flo-brand-500 text-flo-text"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = form.customTag.trim().toLowerCase().replace(/\s+/g, '_');
                    if (val && !form.tags.includes(val)) {
                      onFormChange({ ...form, tags: [...form.tags, val], customTag: '' });
                    }
                  }}
                  className="px-3 py-1.5 min-h-11 text-small bg-flo-surface-muted rounded-flo-md hover:bg-flo-border text-flo-text-secondary"
                >
                  {t('common.add')}
                </button>
              </div>
            </div>
            {addonsEnabled && addonGroups.length > 0 && (
              <div>
                <label className="block text-small font-medium text-flo-text mb-2">{t('products.fieldAddonGroups')}</label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-flo-border rounded-flo-md p-3">
                  {addonGroups.map((group) => {
                    const isChecked = form.addon_group_ids.includes(group.id);
                    return (
                      <div key={group.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`addon-group-${group.id}`}
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            onFormChange({
                              ...form,
                              addon_group_ids: checked
                                ? [...form.addon_group_ids, group.id]
                                : form.addon_group_ids.filter((id) => id !== group.id),
                            });
                          }}
                          className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
                        />
                        <label htmlFor={`addon-group-${group.id}`} className="flex items-center gap-2 cursor-pointer select-none">
                          <span className="text-small text-flo-text-secondary">{group.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${group.is_required ? 'bg-red-100 text-red-700' : 'bg-flo-surface-muted text-flo-text-muted'}`}
                          >
                            {group.is_required ? t('products.required') : t('products.optional')}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.track_inventory}
                  onChange={(e) => onFormChange({ ...form, track_inventory: e.target.checked })}
                  className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
                />
                <span className="text-small text-flo-text-secondary">{t('products.fieldTrackInventory')}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => onFormChange({ ...form, is_active: e.target.checked })}
                  className="rounded border-flo-border text-flo-brand-600 focus:ring-flo-brand-500"
                />
                <span className="text-small text-flo-text-secondary">{t('products.fieldActive')}</span>
              </label>
            </div>
            {!!form.track_inventory && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-small font-medium text-flo-text mb-1">
                    {t('products.fieldStock')}
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock_quantity}
                    onChange={(e) => onFormChange({ ...form, stock_quantity: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="block text-small font-medium text-flo-text mb-1">
                    {t('products.fieldLowStockThreshold')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.low_stock_threshold}
                    onChange={(e) => onFormChange({ ...form, low_stock_threshold: e.target.value })}
                    className={inputClass}
                    required
                  />
                </div>
              </div>
            )}
            <Button type="submit" className="w-full min-h-11">
              {editing ? t('products.updateProduct') : t('products.createProduct')}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
