'use client';

import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { KdsItemModal } from '@/components/kds/KdsItemModal';
import { KdsTicketCard } from '@/components/kds/KdsTicketCard';
import {
  STATUS_CONFIG,
  STATUS_ORDER,
  normalizeKitchenStatus,
  type KitchenStatus,
  type KdsOrder,
  type KdsOrderItem,
} from '@/hooks/useKdsConnection';
import { KDS_BOARD_STATUS } from '@/lib/kds-board-theme';
import { useI18n } from '@/hooks/useI18n';
import { cn, parseDbTimestamp } from '@/lib/utils';

export interface KdsTabsViewProps {
  orders: KdsOrder[];
  updating: number | null;
  updateItemStatus: (
    itemId: number,
    status: KitchenStatus,
    opts?: { expectedStatus?: KitchenStatus },
  ) => Promise<boolean>;
  highlightOrderIds?: Set<string>;
  reducedMotion?: boolean;
}

interface ModalItem {
  item: KdsOrderItem;
  orderNumber: string;
}

function nextStatus(current: KitchenStatus): KitchenStatus | null {
  if (current === 'voided') return null;
  const idx = STATUS_ORDER.indexOf(current as Exclude<KitchenStatus, 'voided'>);
  if (idx < 0) return null;
  return STATUS_ORDER[idx + 1] ?? null;
}

export function KdsTabsView({
  orders,
  updating,
  updateItemStatus,
  highlightOrderIds,
  reducedMotion = false,
}: KdsTabsViewProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<KitchenStatus>('pending');
  const [modalItem, setModalItem] = useState<ModalItem | null>(null);
  const resolvedModalItem = modalItem
    ? {
        ...modalItem,
        item:
          orders
            .flatMap((order) => order.items || [])
            .find((item) => item.id === modalItem.item.id) || modalItem.item,
      }
    : null;

  const statusLabel = (s: KitchenStatus) => t(STATUS_CONFIG[s].labelKey);

  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const timeSince = useCallback((dateStr: string) => {
    const timestamp = parseDbTimestamp(dateStr).getTime();
    if (!Number.isFinite(timestamp)) return '—';
    const totalSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }, []);

  const filteredOrders = orders
    .map((order) => ({
      ...order,
      items: (order.items || []).filter(
        (item) => normalizeKitchenStatus(item.status) === activeTab,
      ),
    }))
    .filter((order) => order.items.length > 0);

  const orderCounts = (status: KitchenStatus): number =>
    orders.reduce(
      (sum, order) =>
        sum +
        (order.items || []).filter((item) => normalizeKitchenStatus(item.status) === status).length,
      0,
    );

  return (
    <>
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        {(Object.keys(STATUS_CONFIG) as KitchenStatus[]).map((status) => {
          const board = KDS_BOARD_STATUS[status];
          const count = orderCounts(status);
          const isActive = activeTab === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setActiveTab(status)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-flo-md border px-3 py-1.5 text-sm font-semibold transition-all',
                board.bg,
                board.text,
                board.border,
                isActive
                  ? 'ring-2 ring-flo-brand-500 ring-offset-2 ring-offset-flo-bg'
                  : 'opacity-70 hover:opacity-100',
              )}
            >
              <div className={cn('h-2.5 w-2.5 rounded-full', board.color)} />
              {statusLabel(status)}
              <span className="rounded-full bg-flo-surface/40 px-1.5 py-0.5 text-xs tabular-nums">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredOrders.map((order) => {
            const highlighted = Boolean(highlightOrderIds?.has(String(order.id)));
            return (
              <KdsTicketCard
                key={order.id}
                order={order}
                items={order.items || []}
                status={activeTab}
                timeSince={timeSince}
                highlighted={highlighted}
                reducedMotion={reducedMotion}
              >
                {(order.items || []).map((item) => {
                  const itemStatus = normalizeKitchenStatus(item.status);
                  const board = KDS_BOARD_STATUS[itemStatus];
                  const isVoided = itemStatus === 'voided';
                  const bumpTo = nextStatus(itemStatus);
                  const busy = updating === item.id;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'overflow-hidden rounded-flo-md border',
                        board.border,
                        board.bg,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setModalItem({ item, orderNumber: order.order_number })}
                        className="w-full px-3 py-2.5 text-left transition hover:brightness-110 active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2.5 w-2.5 shrink-0 rounded-full', board.color)} />
                          <span className={cn('w-7 shrink-0 text-base font-bold', board.text)}>
                            {item.quantity}×
                          </span>
                          <span
                            className={cn(
                              'flex-1 truncate text-lg font-semibold',
                              isVoided ? 'text-flo-text-muted line-through' : 'text-flo-text',
                            )}
                          >
                            {item.product_name}
                          </span>
                          <ChevronRight size={14} className="shrink-0 text-flo-text-muted" />
                        </div>
                        {item.addons && item.addons.length > 0 && (
                          <div className="ml-7 mt-1 flex flex-wrap gap-1">
                            {item.addons.map((addon, i) => (
                              <span
                                key={`${addon.id ?? addon.name}-${i}`}
                                className="rounded border border-flo-info/40 bg-flo-surface/50 px-1.5 py-0.5 text-[10px] text-flo-info"
                              >
                                + {addon.name}
                                {(addon.quantity || 1) > 1 ? ` ×${addon.quantity}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.special_instructions && (
                          <p className="ml-7 mt-0.5 break-words text-sm font-medium italic text-flo-danger">
                            {`"${item.special_instructions}"`}
                          </p>
                        )}
                      </button>
                      {bumpTo && !isVoided && (
                        <div className="border-t border-flo-border/50 px-2 pb-2 pt-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void updateItemStatus(item.id, bumpTo, {
                                expectedStatus: itemStatus,
                              })
                            }
                            className={cn(
                              'min-h-11 w-full rounded-flo-md px-3 py-2 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50',
                              KDS_BOARD_STATUS[bumpTo].bump,
                            )}
                            aria-label={t('kds.markAs', { status: statusLabel(bumpTo) })}
                          >
                            {busy
                              ? t('kds.updating')
                              : `${t('kds.bump')} · ${t('kds.markAs', { status: statusLabel(bumpTo) })}`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </KdsTicketCard>
            );
          })}
        </div>

        {filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-flo-text-muted">
            <p className="text-lg">
              {t('kds.emptyItems', { status: statusLabel(activeTab).toLowerCase() })}
            </p>
            <p className="text-sm">{t('kds.emptyHint')}</p>
          </div>
        )}
      </div>

      {resolvedModalItem && (
        <KdsItemModal
          item={resolvedModalItem.item}
          orderNumber={resolvedModalItem.orderNumber}
          updating={updating === resolvedModalItem.item.id}
          onClose={() => setModalItem(null)}
          onUpdateStatus={async (itemId, status) => {
            const updated = await updateItemStatus(itemId, status, {
              expectedStatus: normalizeKitchenStatus(resolvedModalItem.item.status),
            });
            if (updated) setModalItem(null);
          }}
        />
      )}
    </>
  );
}
