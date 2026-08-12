'use client';

import type { Table } from '@/lib/types';
import { useHeldOrdersStore } from '@/store/held-orders';
import { useI18n } from '@/hooks/useI18n';
import { StatusBadge } from '@/components/flo/StatusBadge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  tables: Table[];
  selectedTableId: string | null;
  onSelectAvailable: (tableId: string, customer?: { id: number; name: string; phone: string } | null) => void;
  onSelectOccupied: (table: Table) => void;
  onSelectHeld: (tableId: string) => void;
  onPlaceOrder: () => void;
  onHoldTable: (tableId: string) => void;
  onClose: () => void;
}

const statusStyles: Record<string, { border: string; badgeVariant: 'warning' | 'info' | 'secondary' | 'default'; badgeKey: string | null }> = {
  available: { border: 'border-flo-border hover:border-flo-brand-400', badgeVariant: 'default', badgeKey: null },
  occupied: { border: 'border-orange-300 bg-orange-50', badgeVariant: 'warning', badgeKey: 'pos.tableOccupied' },
  reserved: { border: 'border-flo-warning bg-flo-warning-subtle', badgeVariant: 'warning', badgeKey: 'pos.tableReserved' },
  cleaning: { border: 'border-flo-border bg-flo-bg', badgeVariant: 'secondary', badgeKey: 'pos.tableCleaning' },
  held: { border: 'border-flo-info bg-flo-info-subtle', badgeVariant: 'info', badgeKey: 'pos.tableHeld' },
};

export default function TablePickerModal({
  tables, selectedTableId, onSelectAvailable, onSelectOccupied, onSelectHeld, onPlaceOrder, onHoldTable, onClose,
}: Props) {
  const heldOrders = useHeldOrdersStore();
  const { t } = useI18n();

  const handleClick = (table: Table) => {
    if (heldOrders.hasHeldOrder(table.id)) {
      onSelectHeld(table.id);
      return;
    }
    if (table.status === 'occupied') {
      onSelectOccupied(table);
      return;
    }
    if (table.status === 'available' || table.status === 'reserved') {
      const customer = table.status === 'reserved' && table.reservation_customer_id
        ? { id: table.reservation_customer_id, name: table.reservation_customer_name ?? '', phone: table.reservation_customer_phone ?? '' }
        : null;
      onSelectAvailable(table.id, customer);
      return;
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-flo-border bg-flo-surface sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-flo-text">{t('pos.selectTable')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          {tables.map((table) => {
            const isHeld = heldOrders.hasHeldOrder(table.id);
            const isSelected = selectedTableId === table.id;
            const style = statusStyles[table.status] || statusStyles.available;
            const isDisabled = table.status === 'cleaning';

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => !isDisabled && handleClick(table)}
                disabled={isDisabled}
                className={`p-4 min-h-11 rounded-flo-lg border-2 text-center transition-colors relative ${
                  isSelected
                    ? 'border-flo-brand-600 bg-flo-brand-50'
                    : isHeld
                      ? 'border-flo-info bg-flo-info-subtle'
                      : style.border
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isHeld && (
                  <StatusBadge variant="info" className="absolute -top-2 -right-2 h-5 text-[10px]">
                    {t('pos.tableHeld')}
                  </StatusBadge>
                )}
                {!isHeld && style.badgeKey && (
                  <StatusBadge variant={style.badgeVariant} className="absolute -top-2 -right-2 h-5 text-[10px]">
                    {t(style.badgeKey)}
                  </StatusBadge>
                )}
                <p className="font-bold text-flo-text">{table.name}</p>
                <p className="text-xs text-flo-text-secondary">{t('pos.tableSeats', { count: table.capacity })}</p>
                {table.status === 'occupied' && (table.current_order || table.activeOrder) && (
                  <p className="text-xs text-flo-warning font-medium mt-1">
                    #{(table.current_order || table.activeOrder)?.order_number}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {tables.length === 0 && (
          <p className="text-center text-flo-text-secondary py-8">{t('pos.noTablesFound')}</p>
        )}

        {selectedTableId && (
          <div className="flex gap-3 mt-2 pt-4 border-t border-flo-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onHoldTable(selectedTableId)}
              className="flex-1 min-h-11"
            >
              {t('pos.holdTable')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                onPlaceOrder();
                onClose();
              }}
              className="flex-1 min-h-11 bg-flo-brand-600 hover:bg-flo-brand-700 text-white"
            >
              {t('pos.placeOrderButton')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
