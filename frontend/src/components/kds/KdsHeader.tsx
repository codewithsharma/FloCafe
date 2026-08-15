'use client';

import { ChefHat, LogOut, Wifi, WifiOff } from 'lucide-react';
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
  onLogout,
}: KdsHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="mb-4 shrink-0">
      <div className="mb-3 flex items-center gap-3">
        <ChefHat size={24} className="text-flo-brand-600" />
        <div>
          <h1 className="text-xl font-bold text-flo-text">{t('kds.title')}</h1>
          <p className="text-xs text-flo-text-secondary">
            {userName} ({userRole})
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {connectionMode === 'websocket' ? (
            <span title={t('kds.wsConnected')}>
              <Wifi size={16} className="text-flo-success" />
            </span>
          ) : connectionMode === 'rest' ? (
            <span title={t('kds.restPolling')}>
              <WifiOff size={16} className="text-flo-warning" />
            </span>
          ) : null}
          <span
            className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-flo-success' : 'bg-flo-danger'}`}
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

          <div className="ml-2 flex items-center rounded-flo-md bg-flo-bg p-0.5" role="tablist">
            <button
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

          <button
            onClick={onLogout}
            className="ml-2 min-h-11 min-w-11 rounded-flo-md p-2 text-flo-text-secondary hover:bg-flo-bg"
            title={t('nav.logout')}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
