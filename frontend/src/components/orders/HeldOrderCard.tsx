'use client';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/flo/Panel';
import { StatusBadge } from '@/components/flo/StatusBadge';
import type { HeldOrder } from '@/store/held-orders';
import { useI18n } from '@/hooks/useI18n';

export interface HeldOrderCardProps {
  heldOrder: HeldOrder;
  tableName: string;
  heldAtLabel: string;
  onResume: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

export function HeldOrderCard({
  heldOrder,
  tableName,
  heldAtLabel,
  onResume,
  onDelete,
}: HeldOrderCardProps) {
  const { t } = useI18n();

  return (
    <Panel className="border-l-4 border-l-flo-info p-0 overflow-hidden flex flex-col">
      <div className="p-4 border-b border-flo-border bg-flo-info-subtle/40 flex justify-between items-center">
        <div>
          <p className="font-bold text-flo-text">{tableName}</p>
          <p className="text-caption text-flo-text-muted">{heldAtLabel}</p>
        </div>
        <StatusBadge variant="info">{t('orders.held')}</StatusBadge>
      </div>
      <div className="p-4 flex-1">
        {heldOrder.items.map((item, idx) => (
          <div key={idx} className="flex justify-between text-small py-1 text-flo-text">
            <span>
              {item.quantity}x {item.product.name}
            </span>
          </div>
        ))}
        {heldOrder.orderNotes ? (
          <div className="mt-3 text-small italic text-flo-text-secondary bg-flo-bg p-2 rounded-flo-md">
            &quot;{heldOrder.orderNotes}&quot;
          </div>
        ) : null}
      </div>
      <div className="p-4 bg-flo-bg border-t border-flo-border flex gap-2">
        <Button onClick={() => void onResume()} variant="default" className="flex-1 min-h-11">
          {t('orders.resumeInPos')}
        </Button>
        <Button
          onClick={() => void onDelete()}
          variant="outline"
          className="flex-1 min-h-11 text-flo-danger hover:text-flo-danger hover:bg-flo-danger-subtle"
        >
          {t('orders.delete')}
        </Button>
      </div>
    </Panel>
  );
}
