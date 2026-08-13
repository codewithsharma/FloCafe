import { describe, expect, it } from 'vitest';
import { refundBodySchema } from '../../main/validation/refunds';

describe('refund zod schema', () => {
  it('accepts a minimal refund reason', () => {
    const parsed = refundBodySchema.parse({ reason: 'Customer changed mind' });
    expect(parsed.reason).toBe('Customer changed mind');
  });

  it('accepts amount as string or number with extras', () => {
    const parsed = refundBodySchema.parse({
      reason: 'Wrong item',
      amount: '3.25',
      method: 'cash',
      override_pin: '1234',
      manager_id: 2,
      client_trace: 'x',
    });
    expect(parsed.amount).toBe('3.25');
    expect((parsed as { client_trace?: string }).client_trace).toBe('x');
  });

  it('rejects empty reason', () => {
    const result = refundBodySchema.safeParse({ reason: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', () => {
    const result = refundBodySchema.safeParse({ amount: 5 });
    expect(result.success).toBe(false);
  });
});
