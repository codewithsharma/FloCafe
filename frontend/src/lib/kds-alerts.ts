/**
 * KDS-ALERTS — pure alert identity / deduplication (no React, no schema).
 *
 * Strategy:
 * - Identity key = order_item.id (stable PK on every KDS card)
 * - First successful board snapshot seeds `seen` and enters alert-ready (no alerts)
 * - Later snapshots: set-difference of item ids → new-ticket alerts once
 * - Reconnect/snapshot replay of known ids → no alert
 * - Tickets that appeared while disconnected → new ids in next snapshot → alert once
 * - Status-only updates keep the same ids → no new-ticket alert
 * - Station scope is server-side; this tracker only sees the scoped board
 */

export type KdsAlertableItem = {
  id: number;
  orderId: number | string;
  /** Kitchen status; non-actionable statuses are ignored for *new* alerts only. */
  status?: string | null;
};

export type KdsAlertApplyResult = {
  /** True after the first snapshot has seeded the seen set. */
  alertsReady: boolean;
  /** Item ids that are newly actionable on this apply (empty on hydrate). */
  newItemIds: number[];
  /** Order ids that contain at least one newItemId (for card highlight). */
  newOrderIds: Array<number | string>;
  /** Play at most one sound for this batch when true. */
  shouldSound: boolean;
};

const ACTIONABLE = new Set(['pending', 'preparing', 'ready']);

export function isActionableKitchenStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return ACTIONABLE.has(String(status).toLowerCase());
}

export function collectBoardItems(
  orders: Array<{
    id: number | string;
    items?: Array<{ id: number; status?: string | null }> | null;
  }>,
): KdsAlertableItem[] {
  const out: KdsAlertableItem[] = [];
  for (const order of orders) {
    for (const item of order.items || []) {
      out.push({ id: Number(item.id), orderId: order.id, status: item.status });
    }
  }
  return out;
}

/**
 * Session-scoped tracker. Survives reconnect while the KDS page stays mounted.
 * Call `reset()` on logout so the next session re-hydrates without storm.
 */
export class KdsAlertTracker {
  private alertsReady = false;
  private seen = new Set<number>();

  get ready(): boolean {
    return this.alertsReady;
  }

  get seenCount(): number {
    return this.seen.size;
  }

  hasSeen(itemId: number): boolean {
    return this.seen.has(itemId);
  }

  reset(): void {
    this.alertsReady = false;
    this.seen.clear();
  }

  applySnapshot(items: KdsAlertableItem[]): KdsAlertApplyResult {
    if (!this.alertsReady) {
      // Stay hydrating on empty boards so auth_success's empty `orders`
      // does not arm alerts before the real initial_data snapshot arrives.
      if (items.length === 0) {
        return {
          alertsReady: false,
          newItemIds: [],
          newOrderIds: [],
          shouldSound: false,
        };
      }
      for (const item of items) {
        this.seen.add(Number(item.id));
      }
      this.alertsReady = true;
      return {
        alertsReady: true,
        newItemIds: [],
        newOrderIds: [],
        shouldSound: false,
      };
    }

    const newItemIds: number[] = [];
    const orderIdSet = new Set<number | string>();
    for (const item of items) {
      const id = Number(item.id);
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      if (!isActionableKitchenStatus(item.status)) continue;
      newItemIds.push(id);
      orderIdSet.add(item.orderId);
    }

    return {
      alertsReady: true,
      newItemIds,
      newOrderIds: [...orderIdSet],
      shouldSound: newItemIds.length > 0,
    };
  }
}

export const KDS_SOUND_STORAGE_KEY = 'kds_sound_alerts';
export const KDS_SOUND_CHANGE_EVENT = 'kds_sound_alerts_changed';
export const KDS_ALERT_HIGHLIGHT_MS = 4000;

export function readKdsSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KDS_SOUND_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeKdsSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KDS_SOUND_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
  try {
    window.dispatchEvent(new Event(KDS_SOUND_CHANGE_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Short Web Audio beep. Never throws to callers — audio failure must not break KDS.
 * Returns false when playback could not start.
 */
export async function playKdsAlertBeep(audioContextFactory?: () => AudioContext): Promise<boolean> {
  try {
    let ctx: AudioContext;
    if (audioContextFactory) {
      ctx = audioContextFactory();
    } else {
      const AudioCtx =
        typeof window !== 'undefined'
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // autoplay blocked — degrade silently
      }
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
    osc.onended = () => {
      try {
        void ctx.close();
      } catch {
        // ignore
      }
    };
    return true;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function kdsNewTicketCardClass(highlighted: boolean, reducedMotion: boolean): string {
  if (!highlighted) return '';
  if (reducedMotion) {
    return 'ring-2 ring-flo-brand-500 ring-offset-1 ring-offset-flo-bg';
  }
  return 'ring-2 ring-flo-brand-500 ring-offset-1 ring-offset-flo-bg animate-pulse';
}
