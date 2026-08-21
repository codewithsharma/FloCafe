import { describe, expect, it } from 'vitest';
import {
  computeKdsOutboxBackoffMs,
  KDS_OUTBOX_BASE_DELAY_MS,
  KDS_OUTBOX_MAX_DELAY_MS,
} from '../../main/services/kds-delivery-outbox';

/** Mirror of frontend computeKdsReconnectDelayMs without importing React hooks. */
function computeKdsReconnectDelayMs(attempt: number, jitter = 0): number {
  const exp = Math.max(0, attempt);
  const base = Math.min(30_000, 3000 * 2 ** exp);
  return base + Math.max(0, Math.min(jitter, 400));
}

describe('KDS-H-OUTBOX backoff', () => {
  it('grows exponentially and caps', () => {
    expect(computeKdsOutboxBackoffMs(0, 0)).toBe(KDS_OUTBOX_BASE_DELAY_MS);
    expect(computeKdsOutboxBackoffMs(1, 0)).toBe(KDS_OUTBOX_BASE_DELAY_MS * 2);
    expect(computeKdsOutboxBackoffMs(2, 0)).toBe(KDS_OUTBOX_BASE_DELAY_MS * 4);
    expect(computeKdsOutboxBackoffMs(20, 0)).toBe(KDS_OUTBOX_MAX_DELAY_MS);
  });

  it('adds bounded jitter', () => {
    expect(computeKdsOutboxBackoffMs(0, 200)).toBe(KDS_OUTBOX_BASE_DELAY_MS + 200);
    expect(computeKdsOutboxBackoffMs(0, 9999)).toBe(KDS_OUTBOX_BASE_DELAY_MS + 500);
  });

  it('reconnect delay starts at 3s and caps at 30s', () => {
    expect(computeKdsReconnectDelayMs(0, 0)).toBe(3000);
    expect(computeKdsReconnectDelayMs(1, 0)).toBe(6000);
    expect(computeKdsReconnectDelayMs(5, 0)).toBe(30_000);
  });
});
