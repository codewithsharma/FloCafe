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
    <div data-testid="kds-workspace" className="h-full flex flex-col">
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
      <div className="flex-1 min-h-0 flex flex-col">
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
      {conn.ConfirmDialog}
    </div>
  );
}
