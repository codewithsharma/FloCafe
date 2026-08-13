import { describe, expect, it } from 'vitest';
import {
  batchPaymentBodySchema,
  singlePaymentBodySchema,
  stockAdjustBodySchema,
} from '../../main/validation/payments';

describe('payment zod schemas', () => {
  it('accepts a single payment with omitted amount', () => {
    const parsed = singlePaymentBodySchema.parse({
      method: 'cash',
      notes: 'exact',
    });
    expect(parsed.method).toBe('cash');
    expect(parsed.amount).toBeUndefined();
  });

  it('accepts string money amounts', () => {
    const parsed = singlePaymentBodySchema.parse({
      method: 'card',
      amount: '12.50',
      transaction_id: 'txn-1',
      unused: true,
    });
    expect(parsed.amount).toBe('12.50');
    expect((parsed as { unused?: boolean }).unused).toBe(true);
  });

  it('rejects missing payment method', () => {
    const result = singlePaymentBodySchema.safeParse({ amount: 10 });
    expect(result.success).toBe(false);
  });

  it('accepts a batch payment body', () => {
    const parsed = batchPaymentBodySchema.parse({
      payments: [
        { method: 'cash', amount: 5 },
        { method: 'card', amount: '5.00' },
      ],
      customer_id: 3,
    });
    expect(parsed.payments).toHaveLength(2);
  });

  it('rejects empty payments array', () => {
    const result = batchPaymentBodySchema.safeParse({ payments: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 payment lines', () => {
    const payments = Array.from({ length: 101 }, () => ({ method: 'cash', amount: 1 }));
    const result = batchPaymentBodySchema.safeParse({ payments });
    expect(result.success).toBe(false);
  });
});

describe('stock adjust zod schema', () => {
  it('accepts set/increase/decrease with non-negative quantity', () => {
    const parsed = stockAdjustBodySchema.parse({ action: 'increase', quantity: 4 });
    expect(parsed.action).toBe('increase');
  });

  it('rejects invalid action', () => {
    const result = stockAdjustBodySchema.safeParse({ action: 'wipe', quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects negative quantity', () => {
    const result = stockAdjustBodySchema.safeParse({ action: 'set', quantity: -1 });
    expect(result.success).toBe(false);
  });
});
