/**
 * Shared Restaurant role helpers for UX gates.
 * Server requireRole remains authoritative — these only hide unavailable actions.
 */

export type StaffRole = 'owner' | 'manager' | 'cashier' | 'waiter' | 'chef' | string;

export function canApplyOrderDiscount(role?: string | null): boolean {
  return role === 'owner' || role === 'manager';
}

export function canAccessSettings(role?: string | null): boolean {
  return role === 'owner' || role === 'manager';
}
