/**
 * Theme-aware board visual tokens for in-app KDS.
 * Follows document `.dark` (Flo theme toggle / system) — never force dark.
 * STATUS_CONFIG.labelKey remains the i18n SoT; these classes are board chrome only.
 */
import type { KitchenStatus } from '@/hooks/useKdsConnection';
import type { TicketAgeTier } from '@/lib/kds-ticket-age';

export const KDS_BOARD_STATUS: Record<
  KitchenStatus,
  { color: string; border: string; text: string; bg: string; bump: string }
> = {
  pending: {
    color: 'bg-amber-500',
    border: 'border-amber-300 dark:border-amber-500/40',
    text: 'text-amber-800 dark:text-amber-200',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    bump: 'bg-amber-500 hover:bg-amber-400',
  },
  preparing: {
    color: 'bg-sky-500',
    border: 'border-sky-300 dark:border-sky-500/40',
    text: 'text-sky-800 dark:text-sky-200',
    bg: 'bg-sky-50 dark:bg-sky-500/15',
    bump: 'bg-sky-500 hover:bg-sky-400',
  },
  ready: {
    color: 'bg-emerald-500',
    border: 'border-emerald-300 dark:border-emerald-500/40',
    text: 'text-emerald-800 dark:text-emerald-200',
    bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    bump: 'bg-emerald-500 hover:bg-emerald-400',
  },
  served: {
    color: 'bg-violet-500',
    border: 'border-violet-300 dark:border-violet-500/40',
    text: 'text-violet-800 dark:text-violet-200',
    bg: 'bg-violet-50 dark:bg-violet-500/15',
    bump: 'bg-violet-500 hover:bg-violet-400',
  },
  voided: {
    color: 'bg-red-500',
    border: 'border-red-300 dark:border-red-500/40',
    text: 'text-red-800 dark:text-red-200',
    bg: 'bg-red-50 dark:bg-red-500/15',
    bump: 'bg-red-500 hover:bg-red-400',
  },
};

export const KDS_BOARD_ORDER_TYPE_BADGE: Record<string, string> = {
  dine_in:
    'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-100',
  takeaway:
    'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100',
  delivery:
    'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-500/15 dark:text-teal-100',
  online:
    'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-400/40 dark:bg-cyan-500/15 dark:text-cyan-100',
};

export const KDS_BOARD_ORDER_TYPE_FALLBACK =
  'border-flo-border bg-flo-surface-muted text-flo-text-secondary';

/** Age accent — left rail; Flo tokens already flip with theme. */
export function kdsBoardTicketAgeClass(tier: TicketAgeTier, statusBorder: string): string {
  if (tier === 'danger') {
    return 'border-flo-danger/70 border-l-4 border-l-flo-danger bg-flo-danger-subtle/35';
  }
  if (tier === 'warning') {
    return 'border-flo-warning/60 border-l-4 border-l-flo-warning bg-flo-warning-subtle/25';
  }
  return statusBorder;
}

export function kdsBoardClockClass(tier: TicketAgeTier): string {
  if (tier === 'danger') return 'text-flo-danger';
  if (tier === 'warning') return 'text-flo-warning';
  return 'text-flo-text-muted';
}
