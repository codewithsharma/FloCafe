/**
 * Centralized Operavia navigation configuration.
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
import {
  isFeatureAvailable,
  isModuleEnabled,
  verticalIdForBusinessType,
  type ModuleId,
} from '../lib/modules';

export type FloNavRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef';

export type FloNavSection = 'primary' | 'secondary' | 'footer';

export type FloNavStatus = 'live' | 'placeholder';

export interface FloNavItem {
  id: string;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  roles: FloNavRole[];
  /**
   * Legacy business_type gate (Phase 1). Prefer `requiresModule` for vertical
   * composition. When both are set, both must pass.
   * null = no business-type restriction.
   */
  businessTypes: string[] | null;
  section: FloNavSection;
  status: FloNavStatus;
  /** Operavia module that must be enabled for the active vertical (Phase 2.1). */
  requiresModule?: ModuleId;
  /** Feature flag gates (all must pass when set) — still required on top of module enablement */
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
  /** When set (from GET /platform/composition), overrides business_type mapping. */
  verticalId?: string;
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
    requiresModule: 'pos',
  },
  {
    id: 'tables',
    href: '/tables',
    labelKey: 'flo.nav.tables',
    icon: Grid3X3,
    roles: ['owner', 'manager'],
    // Capability gate is requiresModule=tables (+ tables_required flag); not business_type.
    businessTypes: null,
    section: 'primary',
    status: 'live',
    requiresModule: 'tables',
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
    requiresModule: 'order',
  },
  {
    id: 'kitchen',
    href: '/kds',
    labelKey: 'flo.nav.kitchen',
    icon: ChefHat,
    roles: ['owner', 'manager'],
    // Capability gate is requiresModule=kds (+ kds_enabled flag); not business_type.
    businessTypes: null,
    section: 'primary',
    status: 'live',
    requiresModule: 'kds',
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
    requiresModule: 'customer',
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
    requiresModule: 'product',
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
    requiresModule: 'reporting',
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
    requiresModule: 'core',
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
    requiresModule: 'staff',
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
    requiresModule: 'core',
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
    requiresModule: 'notification',
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
  const verticalId = ctx.verticalId || verticalIdForBusinessType(businessType);

  return FLO_NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.businessTypes !== null && !item.businessTypes.includes(businessType)) return false;
    if (item.requiresModule && !isModuleEnabled(item.requiresModule, verticalId)) return false;
    // Feature flags still gate availability on top of module enablement:
    // isFeatureAvailable(module, flag) ≡ moduleEnabled ∧ flagEnabled (Phase 1 semantics).
    if (item.requiresTables && !isFeatureAvailable('tables', ctx.tablesRequired, verticalId)) {
      return false;
    }
    if (item.requiresKds && !isFeatureAvailable('kds', ctx.kdsEnabled, verticalId)) {
      return false;
    }
    if (
      item.requiresWhatsapp &&
      !isFeatureAvailable('notification', ctx.whatsappEnabled, verticalId)
    ) {
      return false;
    }
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
  if (path === '/products/movements') return 'inventoryMovements.title';
  if (path === '/products/low-stock') return 'lowStock.title';
  if (path === '/products/valuation') return 'inventoryValuation.title';
  if (path === '/products/counts') return 'inventoryCounts.title';
  if (path === '/products/recipes') return 'recipes.title';
  if (path === '/products/purchasing') return 'purchasing.title';
  if (path.startsWith('/customers/detail')) return 'flo.nav.customers';
  return 'flo.nav.home';
}
