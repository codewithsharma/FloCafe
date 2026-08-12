/**
 * Centralized Flo POS navigation configuration.
 * Single source of truth for AppShell sidebar items.
 */
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardList,
  Grid3X3,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
  UserCog,
  ChefHat,
  BarChart3,
  Wrench,
  MessageCircle,
  LifeBuoy,
} from 'lucide-react';

export type FloNavRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef';

export type FloNavSection = 'primary' | 'secondary' | 'footer';

export type FloNavStatus = 'live' | 'placeholder';

export interface FloNavItem {
  id: string;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  roles: FloNavRole[];
  /** null = all business types */
  businessTypes: string[] | null;
  section: FloNavSection;
  status: FloNavStatus;
  /** Feature flag gates (all must pass when set) */
  requiresTables?: boolean;
  requiresKds?: boolean;
  requiresWhatsapp?: boolean;
}

export interface NavFilterContext {
  role: string;
  businessType: string;
  tablesRequired: boolean;
  kdsEnabled: boolean;
  whatsappEnabled: boolean;
}

/** Primary operational navigation — workflow IA. */
export const FLO_NAV_ITEMS: FloNavItem[] = [
  {
    id: 'home',
    href: '/dashboard',
    labelKey: 'flo.nav.home',
    icon: LayoutDashboard,
    roles: ['owner'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'pos',
    href: '/pos',
    labelKey: 'flo.nav.pos',
    icon: ShoppingCart,
    roles: ['owner', 'manager', 'cashier'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'tables',
    href: '/tables',
    labelKey: 'flo.nav.tables',
    icon: Grid3X3,
    roles: ['owner', 'manager'],
    businessTypes: ['restaurant'],
    section: 'primary',
    status: 'live',
    requiresTables: true,
  },
  {
    id: 'orders',
    href: '/orders',
    labelKey: 'flo.nav.orders',
    icon: ClipboardList,
    roles: ['owner', 'manager', 'cashier'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'kitchen',
    href: '/kds',
    labelKey: 'flo.nav.kitchen',
    icon: ChefHat,
    roles: ['owner', 'manager'],
    businessTypes: ['restaurant'],
    section: 'primary',
    status: 'live',
    requiresKds: true,
  },
  {
    id: 'customers',
    href: '/customers',
    labelKey: 'flo.nav.customers',
    icon: Users,
    roles: ['owner', 'manager'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'inventory',
    href: '/products',
    labelKey: 'flo.nav.inventory',
    icon: Package,
    roles: ['owner', 'manager'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'reports',
    href: '/reports',
    labelKey: 'flo.nav.reports',
    icon: BarChart3,
    roles: ['owner', 'manager'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'operations',
    href: '/operations',
    labelKey: 'flo.nav.operations',
    icon: Wrench,
    roles: ['owner', 'manager'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'team',
    href: '/staff',
    labelKey: 'flo.nav.team',
    icon: UserCog,
    roles: ['owner', 'manager'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'settings',
    href: '/settings',
    labelKey: 'flo.nav.settings',
    icon: Settings,
    roles: ['owner', 'manager'],
    businessTypes: null,
    section: 'primary',
    status: 'live',
  },
  {
    id: 'whatsapp',
    href: '/whatsapp',
    labelKey: 'flo.nav.whatsapp',
    icon: MessageCircle,
    roles: ['owner', 'manager', 'cashier'],
    businessTypes: null,
    section: 'secondary',
    status: 'live',
    requiresWhatsapp: true,
  },
  {
    id: 'support',
    href: '/support',
    labelKey: 'flo.nav.support',
    icon: LifeBuoy,
    roles: ['owner', 'manager', 'cashier', 'waiter', 'chef'],
    businessTypes: null,
    section: 'footer',
    status: 'live',
  },
];

export function getNavItemById(id: string): FloNavItem | undefined {
  return FLO_NAV_ITEMS.find((item) => item.id === id);
}

export function filterNavItems(ctx: NavFilterContext): FloNavItem[] {
  const role = (ctx.role || 'cashier') as FloNavRole;
  const businessType = ctx.businessType || 'restaurant';

  return FLO_NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.businessTypes !== null && !item.businessTypes.includes(businessType)) return false;
    if (item.requiresTables && !ctx.tablesRequired) return false;
    if (item.requiresKds && !ctx.kdsEnabled) return false;
    if (item.requiresWhatsapp && !ctx.whatsappEnabled) return false;
    return true;
  });
}

/** Normalize path for active matching (strip trailing slash except root). */
export function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

export function isNavItemActive(pathname: string, item: FloNavItem): boolean {
  const path = normalizePathname(pathname);
  const hrefPath = normalizePathname(item.href.split('?')[0]);
  if (path === hrefPath) return true;
  // Prefix match for nested routes under the same hub (e.g. /settings/...)
  if (hrefPath !== '/' && path.startsWith(`${hrefPath}/`)) return true;
  return false;
}

/** Resolve ContextHeader title key from pathname. */
export function getRouteTitleKey(pathname: string): string {
  const path = normalizePathname(pathname);
  const match = FLO_NAV_ITEMS.find((item) => isNavItemActive(path, item));
  if (match) return match.labelKey;
  if (path === '/addon-groups') return 'flo.nav.inventory';
  return 'flo.nav.home';
}
