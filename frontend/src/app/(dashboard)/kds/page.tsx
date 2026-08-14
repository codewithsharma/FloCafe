'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import api from '@/lib/api';
import { EmptyState, LoadingState } from '@/components/flo';
import { KdsLoginForm } from '@/components/kds/KdsLoginForm';
import { KdsWorkspace } from '@/components/kds/KdsWorkspace';
import { useKdsConnection } from '@/hooks/useKdsConnection';
import { useSyncServerLanguage } from '@/lib/i18n';
import type { KdsViewMode } from '@/hooks/useKdsView';
import { isFeatureAvailable } from '@/lib/modules';
import { useAuthStore } from '@/store/auth';
import { usePlatformComposition } from '@/hooks/usePlatformComposition';

// Reads the kds_enabled setting directly (not the cached posSettings copy) so
// this route reflects the current state even if the sidebar hasn't refreshed
// its own copy yet. `null` = still loading. Fail-closed on composition: Retail
// must not treat KDS as available. Settings fetch failure still uses the flag
// default (on) *after* the module gate, so a hiccup does not hide Restaurant KDS.
function useKdsEnabledCheck(): boolean | null {
  const { currentTenant } = useAuthStore();
  const { data: composition, isLoading: compositionLoading } =
    usePlatformComposition(!!currentTenant);
  const [flagOn, setFlagOn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings/kds_enabled')
      .then((res) => {
        if (cancelled) return;
        setFlagOn(res.data?.setting?.value !== 'false');
      })
      .catch(() => {
        if (!cancelled) setFlagOn(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!currentTenant) return null;
  if (compositionLoading || flagOn === null) return null;
  return isFeatureAvailable('kds', flagOn, composition?.verticalId);
}

// Dashboard `/kds` runs on the main API origin (port 3001), which has
// `/api/settings/kds` but not `/api/kds/info` (that one lives on the
// standalone KDS server). Fetch the default view from the main API instead
// of `useServerKdsInfo` so chef toggles reflect admin-set defaults here.
function useDashboardKdsDefault(): KdsViewMode | null {
  const [view, setView] = useState<KdsViewMode | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings/kds')
      .then(({ data }) => {
        if (cancelled) return;
        setView(data?.kds_default_view === 'kanban' ? 'kanban' : 'tabs');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return view;
}

function KdsPageWorkspace() {
  const conn = useKdsConnection({ api });
  const kdsDefaultView = useDashboardKdsDefault();

  if (conn.loading) {
    return <LoadingState className="min-h-[60vh]" />;
  }
  if (!conn.user) {
    return (
      <div className="min-h-[60vh] rounded-flo-lg border border-flo-border bg-flo-surface">
        <KdsLoginForm conn={conn} />
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 flex flex-col bg-flo-bg -mx-4 md:-mx-6">
      <KdsWorkspace conn={conn} serverDefault={kdsDefaultView} />
    </div>
  );
}

export default function KdsPage() {
  useSyncServerLanguage();
  const kdsEnabled = useKdsEnabledCheck();

  if (kdsEnabled === null) {
    return <LoadingState className="min-h-[60vh]" />;
  }
  if (kdsEnabled === false) {
    return (
      <EmptyState
        className="min-h-[60vh]"
        icon={<ChefHat size={40} strokeWidth={1.5} />}
        title="Kitchen Display is disabled"
        description="This business has turned off the Kitchen Display System. An owner or manager can turn it back on from Settings."
        action={
          <Link
            href="/settings?tab=kds"
            className="text-sm text-flo-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flo-brand-500 rounded"
          >
            Go to Settings
          </Link>
        }
      />
    );
  }

  return <KdsPageWorkspace />;
}
