/**
 * Pure Flo display helpers — safe to unit-test without React.
 */

export type VarianceTone = 'balanced' | 'over' | 'short' | 'unknown';

/** Map variance cents to semantic tone (null/undefined → unknown). */
export function varianceTone(varianceCents: number | null | undefined): VarianceTone {
  if (varianceCents === null || varianceCents === undefined) return 'unknown';
  if (varianceCents > 0) return 'over';
  if (varianceCents < 0) return 'short';
  return 'balanced';
}

export const STATUS_BADGE_VARIANTS = [
  'default',
  'success',
  'warning',
  'danger',
  'info',
  'secondary',
] as const;

export type StatusBadgeVariant = (typeof STATUS_BADGE_VARIANTS)[number];

export type MoneyDisplaySize = 'sm' | 'md' | 'lg' | 'xl';

export function moneySizeClass(size: MoneyDisplaySize): string {
  switch (size) {
    case 'sm':
      return 'text-small text-numeric';
    case 'lg':
      return 'text-numeric-lg';
    case 'xl':
      return 'text-numeric-xl';
    case 'md':
    default:
      return 'text-numeric';
  }
}

/** Table floor status → StatusBadge variant. */
export function tableStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'available':
      return 'success';
    case 'occupied':
      return 'danger';
    case 'reserved':
      return 'warning';
    case 'held':
      return 'info';
    case 'cleaning':
    default:
      return 'secondary';
  }
}

/** Left border + subtle tint for table cards. */
export function tableStatusAccentClass(status: string): string {
  switch (status) {
    case 'available':
      return 'border-l-flo-success bg-flo-success-subtle/40';
    case 'occupied':
      return 'border-l-flo-danger bg-flo-danger-subtle/40';
    case 'reserved':
      return 'border-l-flo-warning bg-flo-warning-subtle/40';
    case 'held':
      return 'border-l-flo-info bg-flo-info-subtle/40';
    case 'cleaning':
    default:
      return 'border-l-flo-text-muted bg-flo-bg';
  }
}

/** Order workflow status → StatusBadge variant. */
export function orderStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'preparing':
      return 'info';
    case 'ready':
      return 'success';
    case 'served':
      return 'default';
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** Active/inactive entity → StatusBadge variant. */
export function activeStatusVariant(isActive: boolean): StatusBadgeVariant {
  return isActive ? 'success' : 'secondary';
}

/** Kitchen line item status → StatusBadge variant. */
export function itemStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'preparing':
      return 'info';
    case 'ready':
      return 'success';
    case 'served':
      return 'default';
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** Staff role → StatusBadge variant. */
export function staffRoleVariant(role: string): StatusBadgeVariant {
  switch (role) {
    case 'owner':
      return 'danger';
    case 'manager':
      return 'default';
    case 'cashier':
      return 'info';
    case 'waiter':
      return 'success';
    case 'chef':
      return 'warning';
    default:
      return 'secondary';
  }
}
