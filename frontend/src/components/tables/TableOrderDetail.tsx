'use client';

import { StatusBadge } from '@/components/flo/StatusBadge';
import { Panel } from '@/components/flo/Panel';
import { itemStatusVariant, orderStatusVariant } from '@/lib/flo-display';
import { ORDER_STATUS_LABEL_KEYS, ITEM_STATUS_LABEL_KEYS } from '@/lib/i18n-enums';
import type { Order } from '@/lib/types';
import { useI18n } from '@/hooks/useI18n';

export interface TableOrderDetailProps {
  order: Order;
}

export function TableOrderDetail({ order }: TableOrderDetailProps) {
  const { t } = useI18n();

  return (
    <Panel variant="compact" className="bg-flo-bg/80">
      <div className="flex items-center justify-between mb-2">
        <span className="text-small font-semibold text-flo-text">#{order.order_number}</span>
        <StatusBadge variant={orderStatusVariant(order.status)}>
          {t(ORDER_STATUS_LABEL_KEYS[order.status] ?? order.status)}
        </StatusBadge>
      </div>
      {order.customer?.name ? (
        <p className="text-caption text-flo-text-secondary mb-1.5">{order.customer.name}</p>
      ) : null}
      <div className="space-y-1">
        {order.items?.filter((item) => item.status !== 'cancelled').map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-flo-md bg-flo-surface px-2 py-1 text-caption"
          >
            <StatusBadge variant={itemStatusVariant(item.status)} dot className="h-5 px-1.5">
              {t(ITEM_STATUS_LABEL_KEYS[item.status] ?? item.status)}
            </StatusBadge>
            <span className="flex-1 truncate text-flo-text">{item.product_name}</span>
            <span className="text-flo-text-muted tabular-nums">×{item.quantity}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
