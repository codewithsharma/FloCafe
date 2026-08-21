'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KdsOrder } from '@/hooks/useKdsConnection';
import {
  KDS_ALERT_HIGHLIGHT_MS,
  KDS_SOUND_CHANGE_EVENT,
  KDS_SOUND_STORAGE_KEY,
  KdsAlertTracker,
  collectBoardItems,
  playKdsAlertBeep,
  readKdsSoundEnabled,
  writeKdsSoundEnabled,
} from '@/lib/kds-alerts';

function subscribeReducedMotion(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useKdsSoundEnabled(): {
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
} {
  const soundEnabled = useSyncExternalStore(
    (cb) => {
      window.addEventListener(KDS_SOUND_CHANGE_EVENT, cb);
      window.addEventListener('storage', cb);
      return () => {
        window.removeEventListener(KDS_SOUND_CHANGE_EVENT, cb);
        window.removeEventListener('storage', cb);
      };
    },
    readKdsSoundEnabled,
    () => false,
  );

  const setSoundEnabled = useCallback((enabled: boolean) => {
    writeKdsSoundEnabled(enabled);
  }, []);

  return { soundEnabled, setSoundEnabled };
}

export type UseKdsAlertsResult = {
  highlightOrderIds: Set<string>;
  reducedMotion: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
};

/**
 * Alert detection layer over stable KDS board snapshots.
 * Does not subscribe to WebSocket directly — consumes `orders` from useKdsConnection.
 */
export function useKdsAlerts(
  orders: KdsOrder[],
  opts: { sessionKey: string | null },
): UseKdsAlertsResult {
  const { soundEnabled, setSoundEnabled } = useKdsSoundEnabled();
  const trackerRef = useRef(new KdsAlertTracker());
  const sessionRef = useRef<string | null>(null);
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [highlightOrderIds, setHighlightOrderIds] = useState<Set<string>>(() => new Set());
  const soundEnabledRef = useRef(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    () => false,
  );

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Reset tracker on logout / user change (new sessionKey)
  useEffect(() => {
    if (sessionRef.current === opts.sessionKey) return;
    sessionRef.current = opts.sessionKey;
    trackerRef.current.reset();
    const timers = highlightTimersRef.current;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    setHighlightOrderIds(new Set());
  }, [opts.sessionKey]);

  useEffect(() => {
    const timers = highlightTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!opts.sessionKey) return;
    const result = trackerRef.current.applySnapshot(collectBoardItems(orders));
    if (result.newOrderIds.length === 0) return;

    setHighlightOrderIds((prev) => {
      const next = new Set(prev);
      for (const orderId of result.newOrderIds) {
        const key = String(orderId);
        next.add(key);
        const existing = highlightTimersRef.current.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          highlightTimersRef.current.delete(key);
          setHighlightOrderIds((cur) => {
            const updated = new Set(cur);
            updated.delete(key);
            return updated;
          });
        }, KDS_ALERT_HIGHLIGHT_MS);
        highlightTimersRef.current.set(key, timer);
      }
      return next;
    });

    if (result.shouldSound && soundEnabledRef.current) {
      void playKdsAlertBeep();
    }
  }, [orders, opts.sessionKey]);

  return {
    highlightOrderIds,
    reducedMotion,
    soundEnabled,
    setSoundEnabled,
  };
}

/** Exported for tests / docs — storage key constant. */
export { KDS_SOUND_STORAGE_KEY };
