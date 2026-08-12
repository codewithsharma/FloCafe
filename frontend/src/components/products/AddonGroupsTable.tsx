'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Panel, StatusBadge, EmptyState } from '@/components/flo';
import type { AddonGroup } from '@/lib/types';

export interface AddonGroupsTableProps {
  addonGroups: AddonGroup[];
  isOwnerOrManager: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onEdit: (group: AddonGroup) => void;
  onDelete: (id: number | string) => void;
}

export function AddonGroupsTable({
  addonGroups,
  isOwnerOrManager,
  t,
  onEdit,
  onDelete,
}: AddonGroupsTableProps) {
  if (addonGroups.length === 0) {
    return (
      <Panel className="p-0">
        <EmptyState title={t('products.addonEmpty')} />
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
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnRequired')}</th>
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnSelection')}</th>
              <th className="text-center p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnAddons')}</th>
              <th className="text-right p-4 text-caption font-medium text-flo-text-muted uppercase">{t('products.columnActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-flo-border">
            {addonGroups.map((group) => (
              <tr key={group.id} className="hover:bg-flo-bg/60">
                <td className="p-4 font-medium text-flo-text">{group.name}</td>
                <td className="p-4 text-center">
                  <StatusBadge variant={group.is_required ? 'danger' : 'secondary'}>
                    {group.is_required ? t('common.yes') : t('common.no')}
                  </StatusBadge>
                </td>
                <td className="p-4 text-center text-small text-flo-text-secondary">
                  {t('products.addonSelectionRange', { min: group.min_selection, max: group.max_selection })}
                </td>
                <td className="p-4 text-center text-small text-flo-text-secondary">{group.addons?.length || 0}</td>
                <td className="p-4 text-right">
                  <div className="flex gap-2 justify-end">
                    {isOwnerOrManager && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(group)}
                          className="p-1.5 text-flo-text-muted hover:text-flo-brand-600 min-h-11 min-w-11 inline-flex items-center justify-center"
                          aria-label={t('common.edit')}
                        >
                          <Pencil size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(group.id)}
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
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
