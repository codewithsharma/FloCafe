'use client';

import { Bell, BellOff, ChefHat, LogOut, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionMode } from '@/hooks/useKdsConnection';
import { useI18n } from '@/hooks/useI18n';
import type { KdsViewMode } from '@/hooks/useKdsView';

export interface KdsHeaderProps {
  userName: string;
  userRole: string;
  connected: boolean;
  dataStale?: boolean;
  connectionMode: ConnectionMode;
  viewMode: KdsViewMode;
  onChangeView: (mode: KdsViewMode) => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onLogout: () => void;
}

export function KdsHeader({
  userName,
  userRole,
  connected,
  dataStale = false,
  connectionMode,
  viewMode,
  onChangeView,
  soundEnabled = false,
  onToggleSound,
  onLogout,
}: KdsHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-flo-lg bg-flo-brand-50 text-flo-brand-600">
          <ChefHat size={22} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-flo-text md:text-xl">{t('kds.title')}</h1>
          <p className="truncate text-xs text-flo-text-secondary">
            {userName} ({userRole})
          </p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {connectionMode === 'websocket' ? (
          <span title={t('kds.wsConnected')}>
            <Wifi size={16} className="text-flo-success" aria-hidden />
          </span>
        ) : connectionMode === 'rest' ? (
          <span title={t('kds.restPolling')}>
            <WifiOff size={16} className="text-flo-warning" aria-hidden />
          </span>
        ) : null}
        <span
          className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-flo-success' : 'bg-flo-danger'}`}
          aria-hidden
        />
        <span className="text-xs text-flo-text-muted">
          {connected
            ? connectionMode === 'websocket'
              ? t('kds.connectionLive')
              : t('kds.connectionPolling')
            : dataStale
              ? t('kds.connectionStale')
              : t('kds.connectionConnecting')}
        </span>

        <div
          className="flex items-center rounded-flo-md border border-flo-border bg-flo-bg p-0.5"
          role="tablist"
        >
          <button
            type="button"
            onClick={() => onChangeView('tabs')}
            aria-pressed={viewMode === 'tabs'}
            className={`min-h-11 min-w-11 rounded-flo-sm px-2.5 py-1 text-xs font-medium transition ${
              viewMode === 'tabs'
                ? 'bg-flo-surface text-flo-text shadow-sm'
                : 'text-flo-text-secondary hover:text-flo-text'
            }`}
          >
            {t('kds.viewTabs')}
          </button>
          <button
            type="button"
            onClick={() => onChangeView('kanban')}
            aria-pressed={viewMode === 'kanban'}
            className={`min-h-11 min-w-11 rounded-flo-sm px-2.5 py-1 text-xs font-medium transition ${
              viewMode === 'kanban'
                ? 'bg-flo-surface text-flo-text shadow-sm'
                : 'text-flo-text-secondary hover:text-flo-text'
            }`}
          >
            {t('kds.viewKanban')}
          </button>
        </div>

        {onToggleSound ? (
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? t('kds.soundOn') : t('kds.soundOff')}
            title={soundEnabled ? t('kds.soundOn') : t('kds.soundOff')}
            data-testid="kds-sound-toggle"
            className={`min-h-11 min-w-11 rounded-flo-md border border-flo-border p-2 ${
              soundEnabled
                ? 'bg-flo-brand-50 text-flo-brand-600'
                : 'text-flo-text-secondary hover:bg-flo-bg'
            }`}
          >
            {soundEnabled ? <Bell size={20} /> : <BellOff size={20} />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onLogout}
          className="min-h-11 min-w-11 rounded-flo-md border border-flo-border p-2 text-flo-text-secondary hover:bg-flo-bg"
          title={t('nav.logout')}
          aria-label={t('nav.logout')}
        >
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
}
