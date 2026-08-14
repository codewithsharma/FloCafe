'use client';

/**
 * PrinterStatus — toolbar button that shows printer connection state and
 * exposes connect / disconnect actions.
 *
 * Place it in the POS page header or sidebar header alongside other toolbar
 * icons.  Example:
 *
 *   <PrinterStatus currency={currency} />
 *
 * The `navigator.usb.requestDevice` picker is only opened on an explicit user
 * click, satisfying the browser's "transient user activation" requirement.
 */

import {
  Printer,
  PrinterCheck,
  PrinterX,
  Loader2,
  Unplug,
  ChevronDown,
  Settings,
  Banknote,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePrinterStore, usePrinterStatusSync } from '@/hooks/usePrinter';
import type { PrinterStatus } from '@/lib/printer/PrinterService';
import toast from 'react-hot-toast';
import { useI18n } from '@/hooks/useI18n';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const STATUS_CONFIG: Record<
  PrinterStatus,
  { labelKey: string; color: string; Icon: React.ElementType }
> = {
  disconnected: {
    labelKey: 'pos.printerNoPrinter',
    color: 'text-flo-text-muted',
    Icon: Printer,
  },
  connecting: {
    labelKey: 'pos.printerConnecting',
    color: 'text-amber-500',
    Icon: Loader2,
  },
  connected: {
    labelKey: 'pos.printerReady',
    color: 'text-green-600',
    Icon: PrinterCheck,
  },
  error: {
    labelKey: 'pos.printerError',
    color: 'text-red-500',
    Icon: PrinterX,
  },
};

export default function PrinterStatus() {
  usePrinterStatusSync();

  const {
    status,
    deviceInfo,
    lastError,
    connect,
    disconnect,
    clearError,
    printMethod,
    hardwarePrinter,
  } = usePrinterStore();
  const { t } = useI18n();
  const router = useRouter();
  const role = useAuthStore((s) => s.currentTenant?.role);
  const canKickDrawer = role === 'owner' || role === 'manager' || role === 'cashier';
  const [kicking, setKicking] = useState(false);

  const effectiveStatus: PrinterStatus = hardwarePrinter ? 'connected' : status;
  const cfg = STATUS_CONFIG[effectiveStatus];
  const Icon = cfg.Icon;

  const handleConnect = async () => {
    clearError();
    try {
      await connect();
      if (usePrinterStore.getState().status === 'connected') {
        toast.success(t('pos.printerConnected'));
      } else if (usePrinterStore.getState().lastError) {
        toast.error(usePrinterStore.getState().lastError!);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('pos.printerError'));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      toast(t('pos.printerDisconnected'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('pos.printerError'));
    }
  };

  const handleKickDrawer = async () => {
    if (kicking) return;
    setKicking(true);
    try {
      await api.post('/printers/kick-drawer');
      toast.success(t('pos.cashDrawerOpened'));
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; detail?: string } } };
      toast.error(
        error.response?.data?.error || error.response?.data?.detail || t('pos.cashDrawerFailed'),
      );
    } finally {
      setKicking(false);
    }
  };

  const isConnected = !hardwarePrinter && status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-10 min-h-11 flex items-center gap-1.5 ${cfg.color} border-flo-border`}
        >
          <Icon size={16} className={isConnecting ? 'animate-spin' : undefined} />
          <span className="hidden sm:inline text-xs font-medium truncate max-w-[140px]">
            {hardwarePrinter ? hardwarePrinter.name : t(cfg.labelKey)}
          </span>
          <ChevronDown size={12} className="text-flo-text-muted" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52 border-flo-border bg-flo-surface">
        <DropdownMenuLabel className="text-xs text-flo-text-secondary">
          {t('pos.printerSectionLabel')}
        </DropdownMenuLabel>

        {hardwarePrinter && (
          <div className="px-2 py-1.5 text-xs text-flo-text-secondary border-b border-flo-border">
            <p className="font-medium text-flo-text truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {hardwarePrinter.name}
            </p>
            <p className="capitalize">
              {hardwarePrinter.connection_type}
              {hardwarePrinter.connection_type === 'network' && hardwarePrinter.ip_address
                ? ` · ${hardwarePrinter.ip_address}${hardwarePrinter.port ? ':' + hardwarePrinter.port : ''}`
                : ''}
              {hardwarePrinter.paper_width ? ` · ${hardwarePrinter.paper_width}` : ''}
            </p>
          </div>
        )}

        {isConnected && deviceInfo && (
          <div className="px-2 py-1.5 text-xs text-flo-text-secondary border-b border-flo-border">
            <p className="font-medium text-flo-text truncate">
              {deviceInfo.productName ?? t('pos.printerUnknownDevice')}
            </p>
            <p>
              {deviceInfo.manufacturerName ??
                `VID:${deviceInfo.vendorId.toString(16).toUpperCase()}`}
            </p>
          </div>
        )}

        {lastError && (
          <div className="px-2 py-1.5 text-xs text-red-600 bg-red-50 rounded mx-1 my-1">
            {lastError}
          </div>
        )}

        <DropdownMenuSeparator />

        {printMethod === 'escpos' && !hardwarePrinter && (
          <>
            {!isConnected && !isConnecting && (
              <DropdownMenuItem
                onClick={handleConnect}
                disabled={isConnecting}
                className="text-sm cursor-pointer"
              >
                <Printer size={14} className="mr-2" />
                {isConnecting ? t('pos.printerConnecting') : t('pos.printerConnectUsb')}
              </DropdownMenuItem>
            )}

            {isConnected && (
              <DropdownMenuItem
                onClick={handleDisconnect}
                className="text-sm cursor-pointer text-red-600 focus:text-red-600"
              >
                <Unplug size={14} className="mr-2" />
                {t('pos.printerDisconnect')}
              </DropdownMenuItem>
            )}
          </>
        )}

        {printMethod === 'browser' && (
          <div className="px-2 py-1.5 text-xs text-flo-text-secondary">
            {t('pos.printerBrowserMode')}
          </div>
        )}

        {canKickDrawer ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleKickDrawer}
              disabled={kicking}
              className="text-sm cursor-pointer"
            >
              <Banknote size={14} className="mr-2" />
              {kicking ? t('pos.cashDrawerOpening') : t('pos.openCashDrawer')}
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => router.push('/settings?tab=receipts-printers')}
          className="text-sm cursor-pointer"
        >
          <Settings size={14} className="mr-2" />
          {t('pos.printerSettings')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
