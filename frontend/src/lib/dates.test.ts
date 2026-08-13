import { describe, expect, it } from 'vitest';
import { businessDayRange, formatClientDate, monthRange } from './dates';
import { STATE_OWNERSHIP } from './state-ownership';

describe('frontend date helpers', () => {
  it('formats client dates', () => {
    expect(formatClientDate('2026-08-13')).toBe('2026-08-13');
  });

  it('builds reporting ranges', () => {
    const day = businessDayRange('2026-08-13T18:00:00');
    expect(day.start.getHours()).toBe(0);
    const month = monthRange('2026-08-13');
    expect(formatClientDate(month.start)).toBe('2026-08-01');
  });
});

describe('state ownership rule', () => {
  it('keeps query/zustand/sqlite responsibilities distinct', () => {
    expect(STATE_OWNERSHIP.serverApi).toBe('tanstack-query');
    expect(STATE_OWNERSHIP.clientUi).toBe('zustand');
    expect(STATE_OWNERSHIP.persistentDomain).toBe('sqlite');
  });
});
