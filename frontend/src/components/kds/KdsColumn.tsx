'use client';

import { useDroppable } from '@dnd-kit/react';
import { ReactNode } from 'react';
import { STATUS_CONFIG, type KitchenStatus } from '@/hooks/useKdsConnection';
import { useI18n } from '@/hooks/useI18n';

export interface KdsColumnProps {
  status: KitchenStatus;
  count: number;
  children: ReactNode;
}

export function KdsColumn({ status, count, children }: KdsColumnProps) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[status];
  const statusLabel = t(config.labelKey);

  const { ref, isDropTarget } = useDroppable({
    id: `column-${status}`,
    data: { status },
  });

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      <div
        className={`flex items-center gap-2 rounded-t-lg border-2 border-b-0 px-3 py-2 ${config.bg} ${config.border}`}
      >
        <div className={`h-2 w-2 rounded-full ${config.color}`} />
        <span className={`text-base font-semibold ${config.text}`}>{statusLabel}</span>
        <span className="ml-auto rounded-full bg-flo-surface/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-flo-text">
          {count}
        </span>
      </div>
      <div
        ref={ref}
        className={`flex-1 space-y-2 overflow-y-auto rounded-b-lg border-2 border-t-0 p-2 transition-colors ${config.border} bg-flo-bg/40 ${
          isDropTarget ? 'bg-flo-info-subtle ring-2 ring-inset ring-flo-info/40' : ''
        }`}
        style={{ minHeight: '60vh', maxHeight: 'calc(100vh - 220px)' }}
      >
        {children}
        {count === 0 && (
          <div className="flex flex-col items-center justify-center py-6 text-xs text-flo-text-muted">
            <span>{t('kds.emptyColumn')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
