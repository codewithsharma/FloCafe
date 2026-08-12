'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Panel, StatusBadge, EmptyState } from '@/components/flo';
import { activeStatusVariant } from '@/lib/flo-display';
import type { Category } from '@/lib/types';
import { CATEGORY_COLORS } from './types';

export interface CategoriesTableProps {
  categories: Category[];
  isOwnerOrManager: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onEdit: (category: Category) => void;
  onDelete: (id: number, name: string) => void;
}

export function CategoriesTable({
  categories,
  isOwnerOrManager,
  t,
  onEdit,
  onDelete,
}: CategoriesTableProps) {
  if (categories.length === 0) {
    return (
      <Panel className="p-0">
        <EmptyState title={t('products.categoryEmpty')} />
      </Panel>
    );
  }

  return (
    <Panel className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-flo-bg border-b border-flo-border">
            <tr>
              <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.categoryName')}</th>
              <th className="text-left p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.categoryColor')}</th>
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnStatus')}</th>
              <th className="text-right p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-flo-border">
            {categories.map((cat) => {
              const colorObj = CATEGORY_COLORS.find((c) => c.key === cat.color);
              return (
                <tr key={cat.id} className="hover:bg-flo-bg/60">
                  <td className="p-4 font-medium text-flo-text">{cat.name}</td>
                  <td className="p-4">
                    {colorObj ? (
                      <span className={`inline-flex px-2 py-1 rounded-flo-md text-caption font-medium ${colorObj.bg} ${colorObj.text}`}>
                        {t(colorObj.labelKey)}
                      </span>
                    ) : (
                      <span className="text-flo-text-muted text-small">—</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge variant={activeStatusVariant(cat.is_active)} dot>
                      {cat.is_active ? t('common.active') : t('common.inactive')}
                    </StatusBadge>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end">
                      {isOwnerOrManager && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(cat)}
                            className="p-1.5 text-flo-text-muted hover:text-flo-brand-600 min-h-11 min-w-11 inline-flex items-center justify-center"
                            aria-label={t('common.edit')}
                          >
                            <Pencil size={16} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(cat.id, cat.name)}
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
