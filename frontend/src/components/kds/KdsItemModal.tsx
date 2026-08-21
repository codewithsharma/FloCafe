'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import {
  STATUS_CONFIG,
  STATUS_ORDER,
  normalizeKitchenStatus,
  type KitchenStatus,
  type KdsOrderItem,
} from '@/hooks/useKdsConnection';
import { KDS_BOARD_STATUS } from '@/lib/kds-board-theme';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface KdsItemModalProps {
  item: KdsOrderItem;
  orderNumber: string;
  updating: boolean;
  onClose: () => void;
  onUpdateStatus: (itemId: number, status: KitchenStatus) => void;
}

export function KdsItemModal({
  item,
  orderNumber,
  updating,
  onClose,
  onUpdateStatus,
}: KdsItemModalProps) {
  const { t } = useI18n();
  const statusLabel = (s: KitchenStatus) => t(STATUS_CONFIG[normalizeKitchenStatus(s)].labelKey);
  const currentStatus = normalizeKitchenStatus(item.status);
  const board = KDS_BOARD_STATUS[currentStatus];
  // 'voided' is locked — it's outside STATUS_ORDER on purpose (issue #150),
  // so there's no next/prev to compute for it.
  const isVoided = currentStatus === 'voided';
  const currentIdx = isVoided
    ? -1
    : STATUS_ORDER.indexOf(currentStatus as Exclude<KitchenStatus, 'voided'>);
  const next = !isVoided ? (STATUS_ORDER[currentIdx + 1] ?? null) : null;
  const prev = !isVoided ? (STATUS_ORDER[currentIdx - 1] ?? null) : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-w-sm flex-col gap-5 border-flo-border bg-flo-surface text-flo-text sm:max-w-sm"
        aria-labelledby="kds-item-modal-title"
      >
        <DialogHeader className="space-y-0 text-left">
          <p className="mb-1 text-xs font-medium text-flo-text-muted">
            {t('kds.modalOrderNumber', { orderNumber })}
          </p>
          <DialogTitle
            id="kds-item-modal-title"
            className={cn(
              'text-2xl font-bold leading-tight',
              isVoided ? 'text-flo-text-muted line-through' : 'text-flo-text',
            )}
          >
            {item.product_name}
          </DialogTitle>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={cn('text-sm font-bold', board.text)}>{item.quantity}×</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                board.bg,
                board.text,
                board.border,
              )}
            >
              <div className={cn('h-1.5 w-1.5 rounded-full', board.color)} />
              {statusLabel(currentStatus)}
            </span>
          </div>
        </DialogHeader>

        {item.addons && item.addons.length > 0 && (
          <div className="rounded-flo-lg border border-flo-info/40 bg-flo-info-subtle/40 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-flo-info">
              {t('kds.addonsLabel')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {item.addons.map((addon, i) => (
                <span
                  key={`${addon.id ?? addon.name}-${i}`}
                  className="rounded-flo-md border border-flo-info/40 bg-flo-surface px-2.5 py-1 text-sm font-medium text-flo-info"
                >
                  + {addon.name}
                  {(addon.quantity || 1) > 1 ? ` ×${addon.quantity}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {item.special_instructions && (
          <div className="rounded-flo-lg border border-flo-danger/40 bg-flo-danger-subtle/40 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-flo-danger">
              {t('kds.specialInstructionsLabel')}
            </p>
            <p className="break-words text-sm font-medium italic text-flo-danger">
              {item.special_instructions}
            </p>
          </div>
        )}

        {!isVoided && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {STATUS_ORDER.map((s, i) => {
              const isCurrent = currentStatus === s;
              const isPast = currentIdx > i;
              const step = KDS_BOARD_STATUS[s];
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium',
                      isCurrent
                        ? cn(step.bg, step.text, step.border, 'ring-2 ring-flo-brand-500')
                        : isPast
                          ? 'border-flo-border bg-flo-surface-muted text-flo-text-muted line-through'
                          : 'border-flo-border bg-flo-surface-muted text-flo-text-muted',
                    )}
                  >
                    {statusLabel(s)}
                  </div>
                  {i < STATUS_ORDER.length - 1 && (
                    <ChevronRight size={12} className="shrink-0 text-flo-border-strong" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {isVoided ? (
            <div className="py-4 text-center text-base font-medium text-flo-danger">
              {t('kds.itemVoidedLocked')}
            </div>
          ) : (
            <>
              {next && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(item.id, next)}
                  disabled={updating}
                  className={cn(
                    'min-h-11 w-full rounded-flo-xl py-5 text-xl font-bold text-white transition-all active:scale-95 disabled:opacity-50',
                    KDS_BOARD_STATUS[next].bump,
                  )}
                >
                  {updating
                    ? t('kds.updating')
                    : `${t('kds.bump')} · ${t('kds.markAs', { status: statusLabel(next) })}`}
                </button>
              )}
              {prev && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(item.id, prev)}
                  disabled={updating}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-flo-xl border border-flo-border bg-flo-surface-muted py-4 text-base font-semibold text-flo-text-secondary transition-all hover:bg-flo-surface active:scale-95 disabled:opacity-50"
                >
                  <ChevronLeft size={18} />
                  {t('kds.backTo', { status: statusLabel(prev) })}
                </button>
              )}
              {!next && (
                <div className="py-4 text-center text-base font-medium text-flo-text-muted">
                  {t('kds.deliveredDone')}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
