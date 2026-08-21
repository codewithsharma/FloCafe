'use client';

import { KdsHeader } from '@/components/kds/KdsHeader';
import { KdsKanbanBoard } from '@/components/kds/KdsKanbanBoard';
import { KdsTabsView } from '@/components/kds/KdsTabsView';
import { useKdsAlerts } from '@/hooks/useKdsAlerts';
import { useKdsView } from '@/hooks/useKdsView';
import type { UseKdsConnectionResult } from '@/hooks/useKdsConnection';

export function KdsWorkspace({
  conn,
  serverDefault,
}: {
  conn: UseKdsConnectionResult;
  serverDefault: 'tabs' | 'kanban' | null;
}) {
  const { viewMode, setViewMode } = useKdsView(serverDefault);
  const sessionKey = conn.user ? String(conn.user.id) : null;
  const alerts = useKdsAlerts(conn.orders, { sessionKey });

  return (
    <div data-testid="kds-workspace" className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-flo-border bg-flo-surface px-3 py-3 md:px-4">
        <KdsHeader
          userName={conn.user!.name}
          userRole={conn.user!.role}
          connected={conn.connected}
          dataStale={conn.dataStale}
          connectionMode={conn.connectionMode}
          viewMode={viewMode}
          onChangeView={setViewMode}
          soundEnabled={alerts.soundEnabled}
          onToggleSound={() => alerts.setSoundEnabled(!alerts.soundEnabled)}
          onLogout={conn.handleLogout}
        />
      </div>
      <div
        data-testid="kds-board"
        className="kds-board flex min-h-0 flex-1 flex-col bg-flo-bg text-flo-text"
      >
        <div className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
          {viewMode === 'kanban' ? (
            <KdsKanbanBoard
              orders={conn.orders}
              updating={conn.updating}
              updateItemStatus={conn.updateItemStatus}
              highlightOrderIds={alerts.highlightOrderIds}
              reducedMotion={alerts.reducedMotion}
            />
          ) : (
            <KdsTabsView
              orders={conn.orders}
              updating={conn.updating}
              updateItemStatus={conn.updateItemStatus}
              highlightOrderIds={alerts.highlightOrderIds}
              reducedMotion={alerts.reducedMotion}
            />
          )}
        </div>
      </div>
      {conn.ConfirmDialog}
    </div>
  );
}
