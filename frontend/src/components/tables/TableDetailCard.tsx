'use client';

import { RotateCcw } from 'lucide-react';
import { Panel } from '@/components/flo/Panel';
import { StatusBadge } from '@/components/flo/StatusBadge';
import { tableStatusAccentClass, tableStatusVariant } from '@/lib/flo-display';
import type { Order, Table } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { TableOrderDetail } from './TableOrderDetail';

const TABLE_STATUS_LABEL: Record<string, string> = {
  available: 'tables.statusAvailable',
  occupied: 'tables.statusOccupied',
  reserved: 'tables.statusReserved',
  cleaning: 'tables.statusCleaning',
  held: 'tables.statusHeld',
};

export interface TableDetailCardProps {
  table: Table;
  orders: Order[];
  onMarkAvailable: (id: string) => void;
  onReserve: (table: Table) => void;
  onToggleActive: (table: Table) => void;
  onTransfer?: (table: Table) => void;
  onMerge?: (table: Table) => void;
  onAssignWaiter?: (table: Table) => void;
}

export function TableDetailCard({
  table,
  orders,
  onMarkAvailable,
  onReserve,
  onToggleActive,
  onTransfer,
  onMerge,
  onAssignWaiter,
}: TableDetailCardProps) {
  const { t } = useI18n();
  const hasOrders = orders.length > 0;
  const isOccupied = table.status === 'occupied';

  return (
    <Panel
      className={cn(
        'border-l-4 p-0 overflow-hidden',
        tableStatusAccentClass(table.status),
        hasOrders && 'border-l-flo-brand-500',
        !table.is_active && 'opacity-60',
      )}
    >
      <div className="px-4 py-3 border-b border-flo-border flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge variant={tableStatusVariant(table.status)} dot>
            {t(TABLE_STATUS_LABEL[table.status] ?? table.status)}
          </StatusBadge>
          <h3 className="font-bold text-flo-text truncate">{table.name}</h3>
          <span className="text-caption text-flo-text-muted shrink-0">
            · {t('tables.capacitySeats', { count: table.capacity })}
          </span>
        </div>
      </div>

      {hasOrders ? (
        <div className="px-4 py-3 space-y-3">
          {orders.map((order) => (
            <TableOrderDetail key={order.id} order={order} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-4 text-center text-caption text-flo-text-muted">
          {t('tables.noActiveOrders')}
        </p>
      )}

      {isOccupied && table.assigned_waiter_id && (
        <p className="px-4 pb-2 text-caption text-flo-text-secondary">
          {t('tables.assignedWaiter')}: {table.assigned_waiter_id}
        </p>
      )}

      <div className="px-4 py-2 border-t border-flo-border flex justify-end gap-2 flex-wrap">
        {isOccupied && onTransfer && (
          <button
            type="button"
            onClick={() => onTransfer(table)}
            className="text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium min-h-11 px-2"
          >
            {t('tables.transfer')}
          </button>
        )}
        {isOccupied && onMerge && (
          <button
            type="button"
            onClick={() => onMerge(table)}
            className="text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium min-h-11 px-2"
          >
            {t('tables.merge')}
          </button>
        )}
        {isOccupied && onAssignWaiter && (
          <button
            type="button"
            onClick={() => onAssignWaiter(table)}
            className="text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium min-h-11 px-2"
          >
            {t('tables.assignWaiter')}
          </button>
        )}
        {(table.status === 'occupied' || table.status === 'reserved') && (
          <button
            type="button"
            onClick={() => onMarkAvailable(table.id)}
            className="text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium min-h-11 px-2"
          >
            {t('tables.markAvailable')}
          </button>
        )}
        {table.status === 'available' && (
          <button
            type="button"
            onClick={() => onReserve(table)}
            className="text-caption text-flo-warning hover:opacity-90 font-medium min-h-11 px-2"
          >
            {t('tables.reserve')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggleActive(table)}
          className={cn(
            'text-caption font-medium flex items-center gap-1 min-h-11 px-2',
            !table.is_active
              ? 'text-flo-success hover:opacity-90'
              : 'text-flo-danger hover:opacity-90',
          )}
        >
          {!table.is_active ? (
            <>
              <RotateCcw size={12} aria-hidden />
              {t('tables.reactivate')}
            </>
          ) : (
            t('tables.deactivate')
          )}
        </button>
      </div>
    </Panel>
  );
}
