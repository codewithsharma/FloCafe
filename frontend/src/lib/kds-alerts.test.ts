import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KdsAlertTracker,
  collectBoardItems,
  isActionableKitchenStatus,
  kdsNewTicketCardClass,
  playKdsAlertBeep,
  prefersReducedMotion,
} from './kds-alerts';

function items(
  rows: Array<{ id: number; orderId: number; status?: string }>,
): Array<{ id: number; orderId: number; status?: string }> {
  return rows;
}

describe('KDS-ALERTS identity / dedupe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initial hydration seeds seen and produces zero alerts', () => {
    const tracker = new KdsAlertTracker();
    const result = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 10, status: 'preparing' },
      ]),
    );
    expect(result.alertsReady).toBe(true);
    expect(result.newItemIds).toEqual([]);
    expect(result.newOrderIds).toEqual([]);
    expect(result.shouldSound).toBe(false);
    expect(tracker.seenCount).toBe(2);
  });

  it('empty snapshots during hydration do not arm alerts (auth_success empty board)', () => {
    const tracker = new KdsAlertTracker();
    const empty = tracker.applySnapshot([]);
    expect(empty.alertsReady).toBe(false);
    expect(tracker.ready).toBe(false);
    const seeded = tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    expect(seeded.alertsReady).toBe(true);
    expect(seeded.shouldSound).toBe(false);
    const next = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 11, status: 'pending' },
      ]),
    );
    expect(next.shouldSound).toBe(true);
    expect(next.newItemIds).toEqual([2]);
  });

  it('new ticket after hydration alerts once with sound flag', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    const result = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 11, status: 'pending' },
      ]),
    );
    expect(result.newItemIds).toEqual([2]);
    expect(result.newOrderIds).toEqual([11]);
    expect(result.shouldSound).toBe(true);
  });

  it('duplicate snapshot does not re-alert', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 11, status: 'pending' },
      ]),
    );
    const replay = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'preparing' },
        { id: 2, orderId: 11, status: 'pending' },
      ]),
    );
    expect(replay.newItemIds).toEqual([]);
    expect(replay.shouldSound).toBe(false);
  });

  it('reconnect with same tickets does not replay alerts', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 11, status: 'ready' },
      ]),
    );
    // Simulate disconnect gap then full snapshot redelivery
    const afterReconnect = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'preparing' },
        { id: 2, orderId: 11, status: 'ready' },
      ]),
    );
    expect(afterReconnect.shouldSound).toBe(false);
    expect(afterReconnect.newItemIds).toEqual([]);
  });

  it('ticket that appeared while disconnected alerts once on recover', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    // While "disconnected", ticket 99 was created; next snapshot includes it
    const recovered = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 99, orderId: 50, status: 'pending' },
      ]),
    );
    expect(recovered.newItemIds).toEqual([99]);
    expect(recovered.newOrderIds).toEqual([50]);
    expect(recovered.shouldSound).toBe(true);
  });

  it('status update alone does not create new-ticket sound', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    const bumped = tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'ready' }]));
    expect(bumped.shouldSound).toBe(false);
    expect(bumped.newItemIds).toEqual([]);
  });

  it('multiple new tickets each alert once in a batch', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    const batch = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 20, status: 'pending' },
        { id: 3, orderId: 30, status: 'pending' },
      ]),
    );
    expect(batch.newItemIds.sort()).toEqual([2, 3]);
    expect(batch.newOrderIds.sort()).toEqual([20, 30]);
    expect(batch.shouldSound).toBe(true);
    const again = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 2, orderId: 20, status: 'pending' },
        { id: 3, orderId: 30, status: 'pending' },
      ]),
    );
    expect(again.shouldSound).toBe(false);
  });

  it('station filtering is by board contents (irrelevant station never present)', () => {
    // Station B board never receives station A items — empty new set
    const stationB = new KdsAlertTracker();
    stationB.applySnapshot(items([{ id: 100, orderId: 1, status: 'pending' }]));
    const next = stationB.applySnapshot(items([{ id: 100, orderId: 1, status: 'preparing' }]));
    expect(next.shouldSound).toBe(false);
    // Station A sees a new routed ticket
    const stationA = new KdsAlertTracker();
    stationA.applySnapshot(items([{ id: 100, orderId: 1, status: 'pending' }]));
    const aNew = stationA.applySnapshot(
      items([
        { id: 100, orderId: 1, status: 'pending' },
        { id: 200, orderId: 2, status: 'pending' },
      ]),
    );
    expect(aNew.newItemIds).toEqual([200]);
  });

  it('priority / rush field is independent — tracker only cares about item ids', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    // Same ids with different order priority metadata still no alert
    const same = tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    expect(same.shouldSound).toBe(false);
  });

  it('non-actionable new ids are recorded but do not sound', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    const voided = tracker.applySnapshot(
      items([
        { id: 1, orderId: 10, status: 'pending' },
        { id: 9, orderId: 99, status: 'voided' },
      ]),
    );
    expect(voided.newItemIds).toEqual([]);
    expect(voided.shouldSound).toBe(false);
    expect(tracker.hasSeen(9)).toBe(true);
  });

  it('reset returns to hydrating behavior', () => {
    const tracker = new KdsAlertTracker();
    tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    tracker.reset();
    expect(tracker.ready).toBe(false);
    const again = tracker.applySnapshot(items([{ id: 1, orderId: 10, status: 'pending' }]));
    expect(again.shouldSound).toBe(false);
    expect(again.newItemIds).toEqual([]);
  });

  it('collectBoardItems flattens orders', () => {
    const flat = collectBoardItems([
      {
        id: 1,
        items: [
          { id: 10, status: 'pending' },
          { id: 11, status: 'ready' },
        ],
      },
      { id: 2, items: [{ id: 20, status: 'preparing' }] },
    ]);
    expect(flat.map((i) => i.id)).toEqual([10, 11, 20]);
  });

  it('isActionableKitchenStatus gates served/voided', () => {
    expect(isActionableKitchenStatus('pending')).toBe(true);
    expect(isActionableKitchenStatus('served')).toBe(false);
    expect(isActionableKitchenStatus('voided')).toBe(false);
  });

  it('highlight class respects reduced motion', () => {
    expect(kdsNewTicketCardClass(false, false)).toBe('');
    expect(kdsNewTicketCardClass(true, true)).toContain('ring-2');
    expect(kdsNewTicketCardClass(true, true)).not.toContain('animate-pulse');
    expect(kdsNewTicketCardClass(true, false)).toContain('animate-pulse');
  });

  it('playKdsAlertBeep degrades when audio fails without throwing', async () => {
    const ok = await playKdsAlertBeep(() => {
      throw new Error('no audio');
    });
    expect(ok).toBe(false);
  });

  it('playKdsAlertBeep succeeds with a mock AudioContext', async () => {
    const stop = vi.fn();
    const start = vi.fn();
    const close = vi.fn();
    const osc = {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start,
      stop,
      onended: null as null | (() => void),
    };
    const gain = {
      gain: {
        value: 0,
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    const ctx = {
      state: 'running',
      currentTime: 0,
      resume: vi.fn(),
      createOscillator: () => osc,
      createGain: () => gain,
      destination: {},
      close,
    };
    const ok = await playKdsAlertBeep(() => ctx as unknown as AudioContext);
    expect(ok).toBe(true);
    expect(start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it('prefersReducedMotion returns false without matchMedia', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
