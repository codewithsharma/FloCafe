import { describe, expect, it } from 'vitest';
import { httpLogRedactPaths } from '../../main/lib/logger';
import { currentTraceId, getTracer, withSpan, withSpanSync } from '../../main/lib/tracing';

describe('observability foundations', () => {
  it('redacts auth and payment-sensitive paths', () => {
    expect(httpLogRedactPaths).toContain('req.headers.authorization');
    expect(httpLogRedactPaths).toContain('password');
    expect(httpLogRedactPaths).toContain('access_token');
    expect(httpLogRedactPaths).toContain('cvv');
  });

  it('provides tracers for core domains without a collector', () => {
    expect(getTracer('authentication')).toBeTruthy();
    expect(getTracer('order')).toBeTruthy();
    expect(getTracer('payment')).toBeTruthy();
    expect(getTracer('inventory')).toBeTruthy();
    expect(getTracer('tax')).toBeTruthy();
    expect(getTracer('pos')).toBeTruthy();
  });

  it('runs withSpan with the no-op provider', async () => {
    const value = await withSpan('authentication', 'unit.test', async () => 42, {
      'test.case': true,
    });
    expect(value).toBe(42);
    // No registered provider → no active remote trace id required.
    expect(currentTraceId() === null || typeof currentTraceId() === 'string').toBe(true);
  });

  it('runs withSpanSync with the no-op provider', () => {
    const value = withSpanSync('payment', 'unit.test.sync', () => 7);
    expect(value).toBe(7);
  });
});
