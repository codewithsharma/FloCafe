'use client';

import { Package } from 'lucide-react';
import type { Product } from '@/lib/types';
import { getLowStockAttentionStatus } from '@/lib/low-stock';
import { Panel, StatusBadge } from '@/components/flo';
import { useI18n } from '@/hooks/useI18n';

export interface LowStockTableProps {
  products: Product[];
  isOwnerOrManager: boolean;
  onAdjustStock?: (product: Product) => void;
}

export function LowStockTable({ products, isOwnerOrManager, onAdjustStock }: LowStockTableProps) {
  const { t } = useI18n();

  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-flo-border bg-flo-surface-secondary/50">
              <th className="p-4 text-left text-caption font-semibold text-flo-text-secondary">
                {t('lowStock.columnProduct')}
              </th>
              <th className="p-4 text-left text-caption font-semibold text-flo-text-secondary">
                {t('lowStock.columnSku')}
              </th>
              <th className="p-4 text-center text-caption font-semibold text-flo-text-secondary">
                {t('lowStock.columnStock')}
              </th>
              <th className="p-4 text-center text-caption font-semibold text-flo-text-secondary">
                {t('lowStock.columnThreshold')}
              </th>
              <th className="p-4 text-center text-caption font-semibold text-flo-text-secondary">
                {t('lowStock.columnStatus')}
              </th>
              {isOwnerOrManager ? (
                <th className="p-4 text-right text-caption font-semibold text-flo-text-secondary">
                  {t('lowStock.columnActions')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const status = getLowStockAttentionStatus(product);
              const isOut = status === 'out_of_stock';
              return (
                <tr key={product.id} className="border-b border-flo-border last:border-0">
                  <td className="p-4">
                    <div className="text-small font-medium text-flo-text">{product.name}</div>
                    {product.barcode ? (
                      <div className="text-caption text-flo-text-muted mt-0.5">
                        {product.barcode}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-4 text-small text-flo-text-secondary">{product.sku || '—'}</td>
                  <td className="p-4 text-center">
                    <span
                      className={`text-small font-medium text-numeric ${isOut ? 'text-flo-danger' : 'text-flo-text'}`}
                    >
                      {isOut ? t('pos.outOfStock') : product.stock_quantity}
                    </span>
                  </td>
                  <td className="p-4 text-center text-small text-numeric text-flo-text-secondary">
                    {product.low_stock_threshold ?? 0}
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge variant={isOut ? 'danger' : 'warning'} dot>
                      {isOut ? t('lowStock.statusOutOfStock') : t('lowStock.statusLowStock')}
                    </StatusBadge>
                  </td>
                  {isOwnerOrManager ? (
                    <td className="p-4 text-right">
                      {onAdjustStock && product.track_inventory ? (
                        <button
                          type="button"
                          onClick={() => onAdjustStock(product)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-flo-md border border-flo-border px-3 py-2 text-small text-flo-text hover:border-flo-brand-500"
                        >
                          <Package size={16} aria-hidden />
                          {t('stockAdjust.title')}
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
