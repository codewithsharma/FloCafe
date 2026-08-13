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

  it('passes empty reason through for service-owned REFUND_REASON_REQUIRED', () => {
    const parsed = refundBodySchema.parse({ reason: '   ' });
    expect(parsed.reason).toBe('   ');
  });

  it('passes invalid amount strings through for service-owned REFUND_AMOUNT_INVALID', () => {
    const parsed = refundBodySchema.parse({ reason: 'x', amount: 'abc' });
    expect(parsed.amount).toBe('abc');
  });

  it('rejects non-object bodies', () => {
    const result = refundBodySchema.safeParse('nope');
    expect(result.success).toBe(false);
  });
});
