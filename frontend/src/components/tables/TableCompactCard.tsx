'use client';

import { RotateCcw } from 'lucide-react';
import { StatusBadge } from '@/components/flo/StatusBadge';
import { tableStatusAccentClass, tableStatusVariant } from '@/lib/flo-display';
import type { Table } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

const TABLE_STATUS_LABEL: Record<string, string> = {
  available: 'tables.statusAvailable',
  occupied: 'tables.statusOccupied',
  reserved: 'tables.statusReserved',
  cleaning: 'tables.statusCleaning',
  held: 'tables.statusHeld',
};

export interface TableCompactCardProps {
  table: Table;
  onMarkAvailable: (id: string) => void;
  onReserve: (table: Table) => void;
  onToggleActive: (table: Table) => void;
}

export function TableCompactCard({
  table,
  onMarkAvailable,
  onReserve,
  onToggleActive,
}: TableCompactCardProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'bg-flo-surface rounded-flo-lg border border-flo-border border-l-4 p-4 text-center',
        'min-h-[100px] min-w-[100px] flex flex-col items-center justify-center gap-1',
        'transition-shadow hover:shadow-md',
        tableStatusAccentClass(table.status),
        !table.is_active && 'opacity-60',
      )}
    >
      <StatusBadge variant={tableStatusVariant(table.status)} dot>
        {t(TABLE_STATUS_LABEL[table.status] ?? table.status)}
      </StatusBadge>
      <h3 className="font-bold text-h3 text-flo-text">{table.name}</h3>
      <p className="text-small text-flo-text-secondary">
        {t('tables.capacitySeats', { count: table.capacity })}
      </p>
      {table.floor ? (
        <p className="text-caption text-flo-text-muted">{table.floor}</p>
      ) : null}
      {table.status === 'reserved' && table.reservation_customer_name ? (
        <p className="text-caption text-flo-warning font-medium mt-1 truncate max-w-full">
          {table.reservation_customer_name}
        </p>
      ) : null}
      {table.status === 'reserved' && table.reservation_customer_phone ? (
        <p className="text-caption text-flo-warning/80">{table.reservation_customer_phone}</p>
      ) : null}

      {(table.status === 'occupied' || table.status === 'reserved') && (
        <button
          type="button"
          onClick={() => onMarkAvailable(table.id)}
          className="mt-2 text-caption text-flo-brand-600 hover:text-flo-brand-700 font-medium min-h-11 px-2"
        >
          {t('tables.markAvailable')}
        </button>
      )}
      {table.status === 'available' && (
        <button
          type="button"
          onClick={() => onReserve(table)}
          className="mt-2 text-caption text-flo-warning font-medium min-h-11 px-2"
        >
          {t('tables.reserve')}
        </button>
      )}
      <button
        type="button"
        onClick={() => onToggleActive(table)}
        className={cn(
          'mt-1 text-caption font-medium min-h-11 px-2 flex items-center gap-1',
          !table.is_active ? 'text-flo-success' : 'text-flo-danger',
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
  );
}
