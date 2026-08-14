'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, PanelLeft, UserCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { getLandingPage } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useConfirm } from '@/hooks/use-confirm';
import { getClientTerminalId } from '@/lib/terminal-id';
import { useShift } from '@/hooks/useShift';
import { canManageShifts, canForceCloseShifts } from '@/lib/shifts';
import ShiftStatusSection from '@/components/shifts/ShiftStatusSection';
import UpdateBadge from '@/components/layout/UpdateBadge';
import { filterNavItems, isNavItemActive, type FloNavItem } from '@/config/navigation';
import { usePlatformComposition } from '@/hooks/usePlatformComposition';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { StatusBadge } from '@/components/flo/StatusBadge';
import { ThemeToggle } from '@/components/flo/ThemeToggle';

function truncateTerminalId(id: string | null): string {
  if (!id) return '—';
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export default function FloSidebar() {
  const pathname = usePathname();
  const { user, currentTenant, logout } = useAuthStore();
  const {
    tablesRequired,
    kdsEnabled,
    whatsappEnabled,
    setTablesRequired,
    setKdsEnabled,
    setWhatsappEnabled,
  } = usePosSettingsStore();
  const { isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const { t } = useI18n();
  const { confirm, ConfirmDialog } = useConfirm();
  const [emailNeedsAttention, setEmailNeedsAttention] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const terminalId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getClientTerminalId();
  }, []);

  const role = currentTenant?.role || 'cashier';
  const businessType = currentTenant?.business_type || 'restaurant';
  const { data: composition } = usePlatformComposition(!!currentTenant);
  const compositionVerticalId = composition?.verticalId;
  const canManage = canManageShifts(role);
  const canForceClose = canForceCloseShifts(role);
  const shiftState = useShift();
  const showShift = canManage && (shiftState.enabled || (shiftState.loading && !shiftState.error));

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const navItems = useMemo(
    () =>
      filterNavItems({
        role,
        businessType,
        tablesRequired,
        kdsEnabled,
        whatsappEnabled,
        verticalId: compositionVerticalId,
      }),
    [role, businessType, tablesRequired, kdsEnabled, whatsappEnabled, compositionVerticalId],
  );

  const primaryItems = navItems.filter((i) => i.section === 'primary');
  const secondaryItems = navItems.filter((i) => i.section === 'secondary');
  const footerItems = navItems.filter((i) => i.section === 'footer');
  const homeHref = getLandingPage();

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
    if (!currentTenant) return;
    api
      .get('/settings/business')
      .then((res) => {
        setTablesRequired(
          typeof res.data.tables_required === 'boolean' ? res.data.tables_required : true,
        );
      })
      .catch(() => {});
    api
      .get('/settings/kds_enabled')
      .then((res) => setKdsEnabled(res.data.setting?.value !== 'false'))
      .catch(() => {});
    api
      .get('/whatsapp/status')
      .then((res) => setWhatsappEnabled(!!res.data?.enabled))
      .catch(() => {});
  }, [currentTenant, setTablesRequired, setKdsEnabled, setWhatsappEnabled]);

  useEffect(() => {
    if (role !== 'owner') return;
    let active = true;
    const refreshCloudAttention = async () => {
      try {
        const [accountResponse, cloudResponse] = await Promise.all([
          api.get('/settings/cloud/account'),
          api.get('/settings/cloud'),
        ]);
        if (!active) return;
        const deletionStatus =
          accountResponse.data?.deletion_request?.status ||
          cloudResponse.data?.cloud_deletion_status;
        setEmailNeedsAttention(
          (accountResponse.data?.cloud_account_available !== false &&
            Boolean(accountResponse.data?.email) &&
            !accountResponse.data?.verified) ||
            ['pending', 'processing', 'failed'].includes(deletionStatus),
        );
      } catch {
        if (active) setEmailNeedsAttention(false);
      }
    };
    void refreshCloudAttention();
    window.addEventListener('flo:cloud-account-status-changed', refreshCloudAttention);
    return () => {
      active = false;
      window.removeEventListener('flo:cloud-account-status-changed', refreshCloudAttention);
    };
  }, [role]);

  const renderNavLink = (item: FloNavItem) => {
    const active = isNavItemActive(pathname || '/', item);
    return (
      <SidebarMenuItem key={item.id}>
        <SidebarMenuButton asChild isActive={active} tooltip={t(item.labelKey)}>
          <Link href={item.href} onClick={closeMobile} aria-current={active ? 'page' : undefined}>
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <item.icon className="size-4 shrink-0" aria-hidden />
              {item.id === 'settings' && emailNeedsAttention && (
                <span
                  aria-label={t('flo.nav.emailAttention')}
                  className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-flo-danger ring-2 ring-sidebar"
                />
              )}
            </span>
            <span>{t(item.labelKey)}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={t('common.brandName')}>
              <Link href={homeHref} onClick={closeMobile}>
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-flo-brand-600 text-white font-semibold">
                  O
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 leading-none">
                  <span className="font-semibold truncate">{t('common.brandName')}</span>
                  <span className="text-[11px] text-sidebar-foreground/70 truncate">
                    {currentTenant?.business_name || t('flo.shell.location')}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/70">
            <StatusBadge variant={online ? 'success' : 'danger'} dot>
              {online ? t('flo.shell.online') : t('flo.shell.offline')}
            </StatusBadge>
            <span className="truncate tabular-nums" title={terminalId || undefined}>
              {t('flo.shell.terminal')}: {truncateTerminalId(terminalId)}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{primaryItems.map(renderNavLink)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {secondaryItems.length > 0 ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{secondaryItems.map(renderNavLink)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {showShift ? (
          <div className="px-1 py-1 group-data-[collapsible=icon]:hidden">
            <ShiftStatusSection {...shiftState} canForceClose={canForceClose} />
          </div>
        ) : null}
        <div className="flex items-center justify-between px-1 group-data-[collapsible=icon]:justify-center">
          <UpdateBadge />
        </div>
        <SidebarMenu>
          {footerItems.map(renderNavLink)}
          <ThemeToggle />
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleSidebar} tooltip={t('nav.toggleSidebar')}>
              <PanelLeft />
              <span>{t('nav.collapse')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div
              title={user?.name || user?.email || t('nav.user')}
              className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm text-sidebar-foreground/70 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
            >
              <UserCircle aria-hidden />
              <span className="truncate">{user?.name || user?.email || t('nav.user')}</span>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => {
                if (await confirm(t('nav.confirmLogout'))) logout();
              }}
              tooltip={t('nav.logoutTooltip')}
            >
              <LogOut />
              <span>{t('nav.logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      {ConfirmDialog}
    </Sidebar>
  );
}
