'use client';

import { useDroppable } from '@dnd-kit/react';
import { ReactNode } from 'react';
import { STATUS_CONFIG, type KitchenStatus } from '@/hooks/useKdsConnection';
import { KDS_BOARD_STATUS } from '@/lib/kds-board-theme';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';

export interface KdsColumnProps {
  status: KitchenStatus;
  count: number;
  children: ReactNode;
}

export function KdsColumn({ status, count, children }: KdsColumnProps) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[status];
  const board = KDS_BOARD_STATUS[status];
  const statusLabel = t(config.labelKey);

  const { ref, isDropTarget } = useDroppable({
    id: `column-${status}`,
    data: { status },
  });

  return (
    <div className="flex min-w-[260px] flex-1 flex-col">
      <div
        className={cn(
          'flex items-center gap-2 rounded-t-flo-lg border border-b-0 px-3 py-2.5',
          board.bg,
          board.border,
        )}
      >
        <div className={cn('h-2.5 w-2.5 rounded-full', board.color)} />
        <span className={cn('text-base font-semibold', board.text)}>{statusLabel}</span>
        <span className="ml-auto rounded-full bg-flo-surface/50 px-1.5 py-0.5 text-xs font-medium tabular-nums text-flo-text">
          {count}
        </span>
      </div>
      <div
        ref={ref}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto rounded-b-flo-lg border border-t-0 bg-flo-bg/60 p-2 transition-colors',
          board.border,
          isDropTarget ? 'bg-flo-info-subtle/40 ring-2 ring-inset ring-flo-info/50' : '',
        )}
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
