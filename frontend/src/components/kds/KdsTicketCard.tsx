'use client';

import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import type { KdsOrder, KdsOrderItem, KitchenStatus } from '@/hooks/useKdsConnection';
import {
  KDS_BOARD_ORDER_TYPE_BADGE,
  KDS_BOARD_ORDER_TYPE_FALLBACK,
  KDS_BOARD_STATUS,
  kdsBoardClockClass,
  kdsBoardTicketAgeClass,
} from '@/lib/kds-board-theme';
import { kdsNewTicketCardClass } from '@/lib/kds-alerts';
import { resolveTicketAgeAnchor, ticketAgeTier } from '@/lib/kds-ticket-age';
import { ORDER_TYPE_LABEL_KEYS } from '@/lib/order-types';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

export interface KdsTicketCardProps {
  order: KdsOrder;
  items: KdsOrderItem[];
  status: KitchenStatus;
  timeSince: (dateStr: string) => string;
  highlighted?: boolean;
  reducedMotion?: boolean;
  className?: string;
  children: ReactNode;
}

export function KdsTicketCard({
  order,
  items,
  status,
  timeSince,
  highlighted = false,
  reducedMotion = false,
  className,
  children,
}: KdsTicketCardProps) {
  const { t } = useI18n();
  const board = KDS_BOARD_STATUS[status];
  const ageAnchor = resolveTicketAgeAnchor(order, items);
  const ageTier = ticketAgeTier(ageAnchor);
  const ageClass = kdsBoardTicketAgeClass(ageTier, board.border);
  const isRush = (order.kitchen_priority ?? 0) > 0;
  const newTicketClass = kdsNewTicketCardClass(highlighted, reducedMotion);

  return (
    <div
      data-testid="kds-ticket-card"
      data-kds-new-ticket={highlighted ? 'true' : undefined}
      aria-label={highlighted ? t('kds.newTicket') : undefined}
      className={cn(
        'flex flex-col rounded-flo-lg border bg-flo-surface p-3 shadow-md',
        ageClass,
        newTicketClass,
        className,
      )}
    >
      <div className="mb-2.5 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <span
            data-kds-ticket-meta-order
            className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-flo-text sm:text-lg"
            title={`#${order.order_number}`}
          >
            #{order.order_number}
          </span>
          <div data-kds-ticket-age className="flex shrink-0 flex-col items-end gap-0.5 self-start">
            {ageTier === 'danger' && (
              <Badge variant="outline" className="border-flo-danger/50 text-flo-danger">
                {t('kds.overdue')}
              </Badge>
            )}
            <div
              className={cn(
                'flex items-center gap-1 font-mono text-xs font-semibold tabular-nums sm:text-sm',
                kdsBoardClockClass(ageTier),
              )}
            >
              <Clock size={14} aria-hidden />
              {timeSince(ageAnchor)}
            </div>
          </div>
        </div>
        <div data-kds-ticket-meta className="flex min-w-0 flex-wrap items-center gap-1.5">
          {isRush && (
            <Badge className="border-flo-danger/50 bg-flo-danger-subtle text-flo-danger">
              {t('kds.rush')}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={KDS_BOARD_ORDER_TYPE_BADGE[order.type] || KDS_BOARD_ORDER_TYPE_FALLBACK}
          >
            {t(ORDER_TYPE_LABEL_KEYS[order.type] ?? order.type)}
          </Badge>
          {order.table?.name && (
            <Badge
              variant="outline"
              className="border-flo-border bg-flo-surface-muted text-flo-text-secondary"
            >
              {t('kds.tableLabel', { name: order.table.name })}
            </Badge>
          )}
          {order.station_name && (
            <Badge variant="outline" className="border-flo-border text-flo-text-secondary">
              {t('kds.stationLabel', { name: order.station_name })}
            </Badge>
          )}
        </div>
      </div>

      {order.special_instructions && (
        <div className="mb-2 rounded-flo-md border border-flo-warning/40 bg-flo-warning-subtle/40 px-2.5 py-1.5">
          <p className="break-words text-sm font-medium text-flo-warning">
            {order.special_instructions}
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
