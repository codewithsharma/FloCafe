'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import FloSidebar from '@/components/flo/Sidebar';
import { ContextHeader } from '@/components/flo/ContextHeader';
import { PageFrame } from '@/components/flo/PageFrame';
import GlobalNotifications from '@/components/layout/GlobalNotifications';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useI18n } from '@/hooks/useI18n';
import { getClientTerminalId } from '@/lib/terminal-id';
import { normalizePathname } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { applyTheme, getStoredTheme } from '@/lib/theme';

export interface AppShellProps {
  children: ReactNode;
}

const FULL_BLEED_PATHS = new Set(['/pos', '/kds']);

function isFullBleedPath(pathname: string | null): boolean {
  const path = normalizePathname(pathname || '/');
  if (FULL_BLEED_PATHS.has(path)) return true;
  // Nested paths under operational surfaces (defensive)
  return path.startsWith('/pos/') || path.startsWith('/kds/');
}

/**
 * Flo POS application shell.
 * Contract:
 * - Full-bleed: /pos, /kds (no ContextHeader, no page pad, no content max)
 * - Standard pages: tokenized pad + wide content frame + ContextHeader chrome
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const terminalShort = useMemo(() => {
    if (typeof window === 'undefined') return '—';
    const id = getClientTerminalId();
    if (!id) return '—';
    return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
  }, []);

  const isFullBleed = isFullBleedPath(pathname);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const preference = getStoredTheme();
    applyTheme(preference);
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <SidebarProvider
      defaultOpen
      style={
        {
          '--sidebar-width': '15rem',
          '--sidebar-width-icon': '3.5rem',
        } as CSSProperties
      }
    >
      <FloSidebar />
      <SidebarInset className="h-screen overflow-hidden flex flex-col bg-flo-bg">
        {!isFullBleed && (
          <ContextHeader
            context={`${online ? t('flo.shell.online') : t('flo.shell.offline')} · ${t('flo.shell.terminal')} ${terminalShort}`}
          />
        )}
        {!isFullBleed && <GlobalNotifications />}
        <div
          className={cn(
            'flex-1 min-h-0 min-w-0',
            isFullBleed
              ? 'flex flex-col overflow-hidden p-0'
              : 'overflow-auto px-[length:var(--flo-page-pad-x)] py-[length:var(--flo-page-pad-y)]',
          )}
        >
          {isFullBleed ? children : <PageFrame variant="wide">{children}</PageFrame>}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
