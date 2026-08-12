'use client';

/**
 * UpdateBadge — subtle in-app indicator for silent background updates (#58).
 * Hidden entirely unless there's a download in progress or a restart pending;
 * never shows a native OS dialog.
 */

import { Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';
import { useI18n } from '@/hooks/useI18n';

export default function UpdateBadge() {
  const { updateStatus, appVersion, restartAndInstall } = useUpdateStatus();
  const { t } = useI18n();

  const status = updateStatus?.status;
  if (!status || (status !== 'downloading' && status !== 'ready-to-install')) {
    return null;
  }

  const isReady = status === 'ready-to-install';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex h-7 items-center gap-1.5 px-2 ${isReady ? 'border-flo-brand-600/30 text-flo-brand-600' : 'border-current/30 text-flo-text-secondary'}`}
        >
          {isReady ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-flo-brand-600 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-flo-brand-600" />
            </span>
          ) : (
            <Download size={12} />
          )}
          <span className="text-xs font-medium">
            {isReady ? t('update.readyBadge') : t('update.downloadingBadge', { percent: Math.round(updateStatus?.percent || 0) })}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 border-flo-border bg-flo-surface">
        <DropdownMenuLabel className="text-xs text-flo-text-secondary">
          {t('update.sectionLabel')}
        </DropdownMenuLabel>

        <div className="px-2 py-1.5 text-xs text-flo-text-secondary">
          {isReady ? (
            <p className="flex items-center gap-1.5 text-flo-text">
              <Sparkles size={13} className="text-flo-brand-600" />
              {t('update.versionReady', { version: updateStatus?.version || '' })}
            </p>
          ) : (
            <div>
              <p className="text-flo-text">{t('update.downloadingDetail', { version: updateStatus?.version || '' })}</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-flo-border">
                <div
                  className="h-1.5 rounded-full bg-flo-brand-600 transition-all"
                  style={{ width: `${updateStatus?.percent || 0}%` }}
                />
              </div>
            </div>
          )}
          <p className="mt-1.5 text-flo-text-muted">{t('update.currentVersion', { version: appVersion })}</p>
        </div>

        {isReady && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={restartAndInstall} className="cursor-pointer text-sm">
              {t('update.restartNow')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
