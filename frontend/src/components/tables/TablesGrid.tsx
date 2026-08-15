'use client';

import type { Order, Table } from '@/lib/types';
import { TableDetailCard } from './TableDetailCard';
import { TableCompactCard } from './TableCompactCard';

export interface TablesGridProps {
  tables: Table[];
  ordersByTable: Map<string, Order[]>;
  showDetails: boolean;
  onMarkAvailable: (id: string) => void;
  onReserve: (table: Table) => void;
  onToggleActive: (table: Table) => void;
  onTransfer?: (table: Table) => void;
  onMerge?: (table: Table) => void;
  onAssignWaiter?: (table: Table) => void;
}

export function TablesGrid({
  tables,
  ordersByTable,
  showDetails,
  onMarkAvailable,
  onReserve,
  onToggleActive,
  onTransfer,
  onMerge,
  onAssignWaiter,
}: TablesGridProps) {
  if (showDetails) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {tables.map((table) => (
          <TableDetailCard
            key={table.id}
            table={table}
            orders={ordersByTable.get(table.id) || []}
            onMarkAvailable={onMarkAvailable}
            onReserve={onReserve}
            onToggleActive={onToggleActive}
            onTransfer={onTransfer}
            onMerge={onMerge}
            onAssignWaiter={onAssignWaiter}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
      {tables.map((table) => (
        <TableCompactCard
          key={table.id}
          table={table}
          onMarkAvailable={onMarkAvailable}
          onReserve={onReserve}
          onToggleActive={onToggleActive}
        />
      ))}
    </div>
  );
}
