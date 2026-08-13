'use client';

import { Search } from 'lucide-react';
import type { Table } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface OrdersFilters {
  search: string;
  table: string;
  type: string;
  status: string;
}

export interface OrdersFilterBarProps {
  filters: OrdersFilters;
  onChange: (next: OrdersFilters) => void;
  tables: Table[];
  className?: string;
}

const selectClass =
  'min-h-11 px-3 py-2 border border-flo-border rounded-flo-md text-small bg-flo-surface text-flo-text focus:outline-none focus:ring-2 focus:ring-flo-brand-500/30 focus:border-flo-brand-500';

export function OrdersFilterBar({ filters, onChange, tables, className }: OrdersFilterBarProps) {
  const { t } = useI18n();
  const { t: tOrders } = useTranslation('orders');

  const patch = (partial: Partial<OrdersFilters>) => {
    onChange({ ...filters, ...partial });
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-3 mb-4', className)}>
      <div className="relative flex-1 min-w-[200px]">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-flo-text-muted"
          aria-hidden
        />
        <input
          type="text"
          placeholder={t('orders.search')}
          aria-label={t('orders.search')}
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
          className="w-full min-h-11 pl-9 pr-3 py-2 border border-flo-border rounded-flo-md text-small focus:outline-none focus:ring-2 focus:ring-flo-brand-500/30 focus:border-flo-brand-500 bg-flo-surface text-flo-text"
        />
      </div>

      <select
        value={filters.table}
        onChange={(e) => patch({ table: e.target.value })}
        className={selectClass}
      >
        <option value="">{t('orders.allTables')}</option>
        {tables.map((table) => (
          <option key={table.id} value={String(table.id)}>
            {table.name}
          </option>
        ))}
      </select>

      <select
        value={filters.type}
        onChange={(e) => patch({ type: e.target.value })}
        className={selectClass}
      >
        <option value="">{t('orders.allTypes')}</option>
        <option value="dine_in">{t('orders.dineIn')}</option>
        <option value="takeaway">{t('orders.takeaway')}</option>
        <option value="delivery">{t('orders.delivery')}</option>
        <option value="online">{t('orders.online')}</option>
      </select>

      <select
        value={filters.status}
        onChange={(e) => patch({ status: e.target.value })}
        className={selectClass}
      >
        <option value="">{t('orders.allStatuses')}</option>
        <option value="active">{t('orders.active')}</option>
        <option value="completed">{tOrders('completed')}</option>
        <option value="cancelled">{t('orders.cancelled')}</option>
      </select>
    </div>
  );
}
