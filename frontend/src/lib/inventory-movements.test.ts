import { describe, expect, it } from 'vitest';
import {
  buildMovementsQuery,
  formatMovementReference,
  formatQuantityDelta,
} from './inventory-movements';

describe('formatQuantityDelta', () => {
  it('prefixes positive deltas with +', () => {
    expect(formatQuantityDelta(2)).toBe('+2');
  });

  it('keeps negative sign from backend truth', () => {
    expect(formatQuantityDelta(-2)).toBe('-2');
  });

  it('renders zero without a plus', () => {
    expect(formatQuantityDelta(0)).toBe('0');
  });
});

describe('formatMovementReference', () => {
  it('joins type and id when both present', () => {
    expect(formatMovementReference('order', 'ord-1')).toBe('order:ord-1');
  });

  it('shows em dash when both missing', () => {
    expect(formatMovementReference(null, null)).toBe('—');
  });
});

describe('buildMovementsQuery', () => {
  it('requires product_id', () => {
    expect(() => buildMovementsQuery({ productId: '  ' })).toThrow(/product_id/);
  });

  it('maps cursor to before_id for the API contract', () => {
    expect(buildMovementsQuery({ productId: 'prod-1', limit: 50, beforeId: 12 })).toEqual({
      product_id: 'prod-1',
      limit: 50,
      before_id: 12,
    });
  });
});
