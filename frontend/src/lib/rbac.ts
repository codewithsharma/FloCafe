/**
 * Shared Restaurant role helpers for UX + client route gates.
 * Server requireRole remains authoritative for APIs — these prevent
 * rendering unauthorized screens (GUI-0005: sidebar hide ≠ authorization).
 */

import { getRolesForAppPath, type FloNavRole } from '../config/navigation';

export type StaffRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef' | string;

export function canApplyOrderDiscount(role?: string | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canAccessSettings(role?: string | null): boolean {
  return canAccessAppPath(role, '/settings');
}

/** Desktop POS (/pos) — owner/manager/cashier only. Waiter uses Server App; chef uses KDS. */
export function canAccessPos(role?: string | null): boolean {
  return canAccessAppPath(role, '/pos');
}

/**
 * Whether `role` may open `pathname` in the desktop app.
 * Policy = FLO_NAV_ITEMS roles (same as sidebar). Ungated paths return true.
 */
export function canAccessAppPath(role?: string | null, pathname?: string | null): boolean {
  if (!pathname) return true;
  const allowed = getRolesForAppPath(pathname);
  if (!allowed) return true;
  if (!role) return false;
  return allowed.includes(role as FloNavRole);
}

/** Post-login / unauthorized-redirect landing by role (never send waiter/chef to /pos). */
export function getLandingPageForRole(role?: string | null): string {
  if (role === 'owner') return '/dashboard';
  if (role === 'manager' || role === 'cashier') return '/pos';
  if (role === 'waiter' || role === 'chef') return '/support';
  return '/auth/login';
}
