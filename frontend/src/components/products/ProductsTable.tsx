'use client';

import { Pencil, Trash2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import TagBadge from '@/components/pos/DietaryBadge';
import { parseDbTimestamp } from '@/lib/utils';
import { nameToColor } from '@/lib/image-utils';
import { Panel, StatusBadge, EmptyState } from '@/components/flo';
import { activeStatusVariant } from '@/lib/flo-display';
import type { Product, Category } from '@/lib/types';
import { taxCategoryOptionLabel } from './helpers';

export interface ProductsTableProps {
  products: Product[];
  categories: Category[];
  taxCategories: { id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[];
  loyaltyEnabled: boolean;
  globalCashbackPercent: number;
  isOwnerOrManager: boolean;
  fmt: (amount: number) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onEdit: (product: Product) => void;
  onDelete: (id: number) => void;
}

export function ProductsTable({
  products,
  categories,
  taxCategories,
  loyaltyEnabled,
  globalCashbackPercent,
  isOwnerOrManager,
  fmt,
  t,
  onEdit,
  onDelete,
}: ProductsTableProps) {
  if (products.length === 0) {
    return (
      <Panel className="p-0">
        <EmptyState title={t('products.empty')} />
      </Panel>
    );
  }

  return (
    <Panel className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-flo-bg border-b border-flo-border">
            <tr>
              <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnProduct')}</th>
              <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnCategory')}</th>
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">Add-ons</th>
              <th className="text-right p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnPrice')}</th>
              <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnTax')}</th>
              {loyaltyEnabled && (
                <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnCashback')}</th>
              )}
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnStock')}</th>
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnStatus')}</th>
              <th className="text-right p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-flo-border">
            {products.map((product) => {
              const parentCat = categories.find((c) => String(c.id) === String(product.category_id || product.category?.id));
              const isCategoryInactive = Boolean(parentCat && !parentCat.is_active);
              const matchedTaxCategory = taxCategories.find((tc) => tc.id === product.tax_category_id);
              const taxLabel = product.tax_category_id
                ? (matchedTaxCategory ? taxCategoryOptionLabel(matchedTaxCategory) : product.tax_category_id)
                : '—';

              return (
                <tr key={product.id} className="hover:bg-flo-bg/60">
                  <td className="p-4 max-w-[220px]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-flo-md overflow-hidden shrink-0 relative flex items-center justify-center">
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ backgroundColor: nameToColor(product.name) }}
                        >
                          <span className="text-sm font-bold text-white/80">
                            {product.name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        {product.has_image && (
                          <img
                            src={`${api.defaults.baseURL}/products/${product.id}/image?t=${product.updated_at ? parseDbTimestamp(product.updated_at).getTime() : 0}`}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-flo-text">{product.name}</p>
                        {product.sku && <p className="text-caption text-flo-text-muted mt-0.5">{t('products.skuLabel', { sku: product.sku })}</p>}
                        {product.barcode && <p className="text-caption text-flo-text-muted mt-0.5 font-mono">{t('products.barcodeLabel', { barcode: product.barcode })}</p>}
                        {product.tags && product.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {product.tags.map((tag: string) => <TagBadge key={tag} tag={tag} />)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-small text-flo-text-secondary">
                    <div className="flex flex-col gap-0.5">
                      <span>{product.category?.name || '—'}</span>
                      {isCategoryInactive && (
                        <StatusBadge variant="warning" className="w-fit text-[11px] h-auto py-0.5" title="Parent category is inactive; product is hidden on POS">
                          <AlertTriangle size={11} className="shrink-0" aria-hidden />
                          Category Inactive
                        </StatusBadge>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    {product.addon_groups && product.addon_groups.length > 0 ? (
                      <StatusBadge variant="info">
                        {t('products.addonGroupCount', { count: product.addon_groups.length })}
                      </StatusBadge>
                    ) : (
                      <span className="text-flo-text-muted text-small">—</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <p className="font-medium text-flo-text">{fmt(Number(product.price))}</p>
                    {product.cost_price != null && product.cost_price > 0 && (
                      <p className="text-caption text-flo-text-muted">Cost: {fmt(Number(product.cost_price))}</p>
                    )}
                  </td>
                  <td className="p-4 text-small text-flo-text-secondary">
                    <div className="flex flex-col gap-0.5">
                      <span>{taxLabel}</span>
                      {!product.tax_category_id && taxCategories.length > 0 && (
                        <StatusBadge variant="warning" className="w-fit text-[11px] h-auto py-0.5" title={t('products.notTaxedTooltip')}>
                          <AlertTriangle size={11} className="shrink-0" aria-hidden />
                          {t('products.notTaxedBadge')}
                        </StatusBadge>
                      )}
                    </div>
                  </td>
                  {loyaltyEnabled && (
                    <td className="p-4 text-small text-flo-text-secondary">
                      {product.cb_percent === null || product.cb_percent === undefined ? (
                        <span>{globalCashbackPercent}% <span className="text-flo-text-muted text-caption">({t('products.cashbackGlobalBadge')})</span></span>
                      ) : product.cb_percent === 0 ? (
                        <span className="text-flo-text-muted">0%</span>
                      ) : (
                        <span>{product.cb_percent}%</span>
                      )}
                    </td>
                  )}
                  <td className="p-4 text-center">
                    {product.track_inventory ? (
                      <span className={`text-small font-medium ${product.stock_quantity <= (product.low_stock_threshold || 0) ? 'text-flo-danger' : 'text-flo-text'}`}>
                        {product.stock_quantity <= 0 ? t('pos.outOfStock') : product.stock_quantity}
                      </span>
                    ) : (
                      <span className="text-flo-text-muted text-small">—</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge variant={activeStatusVariant(product.is_active)} dot>
                      {product.is_active ? t('common.active') : t('common.inactive')}
                    </StatusBadge>
                    {product.is_active && isCategoryInactive && (
                      <span className="text-[10px] text-flo-warning font-medium block mt-1">(Hidden on POS)</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {isOwnerOrManager && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(product)}
                            className="p-1.5 text-flo-text-muted hover:text-flo-brand-600 min-h-11 min-w-11 inline-flex items-center justify-center"
                            aria-label={t('common.edit')}
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(product.id)}
                            className="p-1.5 text-flo-text-muted hover:text-flo-danger min-h-11 min-w-11 inline-flex items-center justify-center"
                            aria-label={t('common.delete')}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
