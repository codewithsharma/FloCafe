'use client';

import { ChevronRight, Clock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { KdsItemModal } from '@/components/kds/KdsItemModal';
import { Badge } from '@/components/ui/badge';
import {
  STATUS_CONFIG,
  STATUS_ORDER,
  normalizeKitchenStatus,
  ORDER_TYPE_BADGE_STYLES,
  type KitchenStatus,
  type KdsOrder,
  type KdsOrderItem,
} from '@/hooks/useKdsConnection';
import {
  resolveTicketAgeAnchor,
  ticketAgeCardClass,
  ticketAgeClockClass,
  ticketAgeTier,
} from '@/lib/kds-ticket-age';
import { ORDER_TYPE_LABEL_KEYS } from '@/lib/order-types';
import { useI18n } from '@/hooks/useI18n';
import { parseDbTimestamp } from '@/lib/utils';

export interface KdsTabsViewProps {
  orders: KdsOrder[];
  updating: number | null;
  updateItemStatus: (
    itemId: number,
    status: KitchenStatus,
    opts?: { expectedStatus?: KitchenStatus },
  ) => Promise<boolean>;
}

interface ModalItem {
  item: KdsOrderItem;
  orderNumber: string;
}

const FALLBACK_ORDER_TYPE_BADGE = 'bg-flo-bg text-flo-text-secondary border-flo-border';

function nextStatus(current: KitchenStatus): KitchenStatus | null {
  if (current === 'voided') return null;
  const idx = STATUS_ORDER.indexOf(current as Exclude<KitchenStatus, 'voided'>);
  if (idx < 0) return null;
  return STATUS_ORDER[idx + 1] ?? null;
}

export function KdsTabsView({ orders, updating, updateItemStatus }: KdsTabsViewProps) {
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

  // Ticks once a second so the elapsed-time display below stays live.
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
          const config = STATUS_CONFIG[status];
          const count = orderCounts(status);
          const isActive = activeTab === status;
          return (
            <button
              key={status}
              onClick={() => setActiveTab(status)}
              className={`flex min-h-11 items-center gap-1.5 rounded-flo-md px-3 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? `${config.bg} ${config.text} ring-2 ring-current`
                  : `${config.bg} ${config.text} opacity-50 hover:opacity-80`
              }`}
            >
              <div className={`h-2 w-2 rounded-full ${config.color}`} />
              {statusLabel(status)}
              <span className="rounded-full bg-flo-surface/60 px-1.5 py-0.5 text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredOrders.map((order) => {
            const ageAnchor = resolveTicketAgeAnchor(order, order.items);
            const ageTier = ticketAgeTier(ageAnchor);
            const cardBorder = ticketAgeCardClass(ageTier, STATUS_CONFIG[activeTab].border);
            const isRush = (order.kitchen_priority ?? 0) > 0;

            return (
              <div
                key={order.id}
                className={`flex flex-col rounded-flo-lg border-2 bg-flo-surface p-4 ${cardBorder}`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="shrink-0 text-base font-bold text-flo-text">
                      #{order.order_number}
                    </span>
                    {isRush && (
                      <Badge className="border-flo-danger/40 bg-flo-danger-subtle text-flo-danger">
                        {t('kds.rush')}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={ORDER_TYPE_BADGE_STYLES[order.type] || FALLBACK_ORDER_TYPE_BADGE}
                    >
                      {t(ORDER_TYPE_LABEL_KEYS[order.type] ?? order.type)}
                    </Badge>
                    {order.table?.name && (
                      <Badge variant="secondary">
                        {t('kds.tableLabel', { name: order.table.name })}
                      </Badge>
                    )}
                    {order.station_name && (
                      <Badge
                        variant="outline"
                        className="border-flo-border text-flo-text-secondary"
                      >
                        {t('kds.stationLabel', { name: order.station_name })}
                      </Badge>
                    )}
                    {ageTier === 'danger' && (
                      <Badge variant="outline" className="border-flo-danger/40 text-flo-danger">
                        {t('kds.overdue')}
                      </Badge>
                    )}
                  </div>
                  <div
                    className={`flex shrink-0 items-center gap-1 font-mono text-sm ${ticketAgeClockClass(ageTier)}`}
                  >
                    <Clock size={12} />
                    {timeSince(ageAnchor)}
                  </div>
                </div>

                {order.special_instructions && (
                  <div className="mb-2 rounded-flo-md border border-flo-warning/30 bg-flo-warning-subtle px-2 py-1.5">
                    <p className="break-words text-sm font-medium text-flo-warning">
                      📝 {order.special_instructions}
                    </p>
                  </div>
                )}

                <div className="flex-1 space-y-2">
                  {order.items?.map((item) => {
                    const itemStatus = normalizeKitchenStatus(item.status);
                    const config = STATUS_CONFIG[itemStatus];
                    const isVoided = itemStatus === 'voided';
                    const bumpTo = nextStatus(itemStatus);
                    const busy = updating === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`rounded-flo-lg border-2 ${config.border} ${config.bg}`}
                      >
                        <button
                          type="button"
                          onClick={() => setModalItem({ item, orderNumber: order.order_number })}
                          className="w-full px-3 py-2.5 text-left transition-all hover:brightness-95 active:scale-[0.99]"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${config.color}`} />
                            <span className={`w-6 shrink-0 text-base font-bold ${config.text}`}>
                              {item.quantity}×
                            </span>
                            <span
                              className={`flex-1 truncate text-lg font-semibold ${isVoided ? 'text-flo-text-muted line-through' : 'text-flo-text'}`}
                            >
                              {item.product_name}
                            </span>
                            <ChevronRight size={14} className="shrink-0 text-flo-text-muted" />
                          </div>
                          {item.addons && item.addons.length > 0 && (
                            <div className="ml-[26px] mt-1 flex flex-wrap gap-1">
                              {item.addons.map((addon, i) => (
                                <span
                                  key={`${addon.id ?? addon.name}-${i}`}
                                  className="rounded border border-flo-info/30 bg-flo-surface/70 px-1.5 py-0.5 text-[10px] text-flo-info"
                                >
                                  + {addon.name}
                                  {(addon.quantity || 1) > 1 ? ` ×${addon.quantity}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.special_instructions && (
                            <p className="ml-[26px] mt-0.5 break-words text-sm font-medium italic text-flo-danger">
                              {`"${item.special_instructions}"`}
                            </p>
                          )}
                        </button>
                        {bumpTo && !isVoided && (
                          <div className="border-t border-flo-border/40 px-2 pb-2 pt-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updateItemStatus(item.id, bumpTo, {
                                  expectedStatus: itemStatus,
                                })
                              }
                              className={`min-h-11 w-full rounded-flo-md px-3 py-2 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 ${STATUS_CONFIG[bumpTo].color} hover:brightness-90`}
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
                </div>
              </div>
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
