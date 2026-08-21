'use client';

import PrinterStatus from './PrinterStatus';
import CustomerSearch from './CustomerSearch';
import { useCartStore } from '@/store/cart';
import { usePosSettingsStore } from '@/store/pos-settings';
import { LayoutGrid } from 'lucide-react';
import type { Table } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { isModuleEnabled } from '@/lib/modules';
import { usePlatformComposition } from '@/hooks/usePlatformComposition';
import { useAuthStore } from '@/store/auth';

interface Props {
  tables: Table[];
  onShowTablePicker: () => void;
}

export default function PosTopbar({ tables, onShowTablePicker }: Props) {
  const cart = useCartStore();
  const tablesRequired = usePosSettingsStore((s) => s.tablesRequired);
  const { t } = useI18n();
  const { currentTenant } = useAuthStore();
  const { data: composition } = usePlatformComposition(!!currentTenant);
  const showTableBtn =
    isModuleEnabled('tables', composition?.verticalId) &&
    cart.orderType === 'dine_in' &&
    tablesRequired;

  return (
    <header className="flex shrink-0 items-center gap-2 md:gap-3 border-b border-flo-border bg-flo-surface px-3 md:px-4 py-2 min-h-[52px]">
      <div className="flex-1 min-w-0">
        <CustomerSearch variant="topbar" />
      </div>

      {showTableBtn && (
        <button
          type="button"
          onClick={onShowTablePicker}
          className={cn(
            'min-h-11 shrink-0 max-w-[40vw] flex items-center gap-1.5 px-3 text-sm rounded-flo-md border font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 focus-visible:ring-offset-2',
            cart.tableId
              ? 'bg-flo-brand-600 text-white border-flo-brand-600 hover:bg-flo-brand-700'
              : 'bg-flo-warning-subtle border-flo-warning/40 text-flo-warning hover:border-flo-warning',
          )}
        >
          <LayoutGrid className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {cart.tableId
              ? t('pos.tableLabel', {
                  name: tables.find((tbl) => tbl.id === cart.tableId)?.name || cart.tableId,
                })
              : t('pos.selectTable')}
          </span>
        </button>
      )}

      <div className="shrink-0">
        <PrinterStatus />
      </div>
    </header>
  );
}
