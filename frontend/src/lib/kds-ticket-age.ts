import { parseDbTimestamp } from '@/lib/utils';
import type { KdsOrder, KdsOrderItem } from '@/hooks/useKdsConnection';

const WARN_MS = 5 * 60 * 1000;
const DANGER_MS = 10 * 60 * 1000;

export type TicketAgeTier = 'default' | 'warning' | 'danger';

/** Prefer oldest preparing_started_at among items; else order.created_at. */
export function resolveTicketAgeAnchor(order: KdsOrder, items?: KdsOrderItem[] | null): string {
  const pool = items ?? order.items ?? [];
  const started = pool
    .map((item) => item.preparing_started_at)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (started.length === 0) return order.created_at;
  return started.reduce((oldest, candidate) => {
    const a = parseDbTimestamp(oldest).getTime();
    const b = parseDbTimestamp(candidate).getTime();
    if (!Number.isFinite(b)) return oldest;
    if (!Number.isFinite(a)) return candidate;
    return b < a ? candidate : oldest;
  });
}

export function ticketAgeMs(anchorIso: string, nowMs: number = Date.now()): number {
  const timestamp = parseDbTimestamp(anchorIso).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, nowMs - timestamp);
}

export function ticketAgeTier(anchorIso: string, nowMs: number = Date.now()): TicketAgeTier {
  const age = ticketAgeMs(anchorIso, nowMs);
  if (age > DANGER_MS) return 'danger';
  if (age >= WARN_MS) return 'warning';
  return 'default';
}

/** Card surface tint — keeps status border visible when default. */
export function ticketAgeCardClass(tier: TicketAgeTier, statusBorder: string): string {
  if (tier === 'danger') {
    return 'border-flo-danger bg-flo-danger-subtle/50';
  }
  if (tier === 'warning') {
    return 'border-flo-warning bg-flo-warning-subtle/50';
  }
  return statusBorder;
}

export function ticketAgeClockClass(tier: TicketAgeTier): string {
  if (tier === 'danger') return 'text-flo-danger';
  if (tier === 'warning') return 'text-flo-warning';
  return 'text-flo-text-muted';
}
