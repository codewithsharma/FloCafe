import { describe, expect, it } from 'vitest';
import {
  addOrderItemsBodySchema,
  createOrderBodySchema,
} from '../../main/validation/orders';

describe('order zod schemas', () => {
  it('accepts a valid create-order body', () => {
    const parsed = createOrderBodySchema.parse({
      type: 'dine_in',
      items: [{ product_id: 1, quantity: 2 }],
      guest_count: 2,
      packaging_charge: 0,
      delivery_charge: '1.50',
      extra_client_field: true,
    });
    expect(parsed.type).toBe('dine_in');
    expect(parsed.items).toHaveLength(1);
    expect((parsed as { extra_client_field?: boolean }).extra_client_field).toBe(true);
  });

  it('rejects create-order without items', () => {
    const result = createOrderBodySchema.safeParse({
      type: 'takeaway',
      items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid order type', () => {
    const result = createOrderBodySchema.safeParse({
      type: 'buffet',
      items: [{ product_id: 'p1', quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects guest_count outside 1–99', () => {
    const result = createOrderBodySchema.safeParse({
      type: 'dine_in',
      items: [{ product_id: 1, quantity: 1 }],
      guest_count: 100,
    });
    expect(result.success).toBe(false);
  });

  it('accepts add-items body with passthrough', () => {
    const parsed = addOrderItemsBodySchema.parse({
      items: [{ product_id: 9, quantity: 1, addons: [{ id: 1, quantity: 1 }] }],
      special_instructions: 'extra hot',
      client_nonce: 'abc',
    });
    expect(parsed.items[0].product_id).toBe(9);
    expect((parsed as { client_nonce?: string }).client_nonce).toBe('abc');
  });

  it('rejects add-items without items', () => {
    const result = addOrderItemsBodySchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });
});
