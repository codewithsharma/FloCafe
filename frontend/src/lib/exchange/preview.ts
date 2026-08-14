/**
 * Phase 4.5 — Exchange UI preview helpers (catalog estimate only).
 *
 * Replacement tax/total is authoritative from server bill generate (leg 2).
 */

import {
  lineReturnValue,
  totalReturnValue,
  type ExchangeReturnLineInput,
} from '@exchange/return-value';
import type { Product } from '@/lib/types';

export function previewReturnTotal(lines: ExchangeReturnLineInput[]): number {
  return totalReturnValue(lines);
}

export function previewReplacementCatalogSubtotal(
  items: Array<{ productId: string; quantity: number }>,
  products: Product[],
): number {
  let sum = 0;
  for (const item of items) {
    const product = products.find((p) => String(p.id) === String(item.productId));
    if (!product) continue;
    sum += Number(product.price) * item.quantity;
  }
  return Number(sum.toFixed(2));
}

export { lineReturnValue };
