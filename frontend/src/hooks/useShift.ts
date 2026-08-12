'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyShiftFetchOutcome,
  fetchActiveShift,
  type ActiveShiftState,
  type Shift,
  type ShiftClientError,
} from '@/lib/shifts';

export interface UseShiftResult {
  /** False when backend reports shifts_enabled=false (503). */
  enabled: boolean;
  shift: Shift | null;
  loading: boolean;
  error: ShiftClientError | null;
  /** Re-fetch active shift for the current terminal. No automatic polling. */
  refresh: () => Promise<void>;
}

const INITIAL: ActiveShiftState = {
  enabled: true,
  shift: null,
  loading: true,
  error: null,
};

/**
 * M4-E1 — reusable active-shift state for POS clients.
 *
 * - Initial fetch on mount
 * - Explicit refresh() only (no interval polling)
 * - 503 → shifts disabled, no error banner
 * - 200 shift:null → no active shift, not an error
 * - Never calls GET /api/shifts/terminal-id
 */
export function useShift(): UseShiftResult {
  const [state, setState] = useState<ActiveShiftState>(INITIAL);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const outcome = await fetchActiveShift();
      setState(applyShiftFetchOutcome(outcome, false));
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    enabled: state.enabled,
    shift: state.shift,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
