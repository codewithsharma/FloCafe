/**
 * Shared POS catalog search / scan matching (Phase 4.1).
 * Pure helpers — no network, no cart/money side effects.
 */

export type PosSearchableProduct = {
  id: string | number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
};

/** Filter match: query is a substring of name, SKU, or barcode (case-insensitive). */
export function productMatchesPosSearch(product: PosSearchableProduct, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (product.name.toLowerCase().includes(q)) return true;
  if (product.sku && product.sku.toLowerCase().includes(q)) return true;
  if (product.barcode && product.barcode.toLowerCase().includes(q)) return true;
  return false;
}

/**
 * Exact scan/wedge match: prefer barcode, then SKU (case-insensitive).
 * Does not match product name — name stays filter-only.
 */
export function findProductByScanCode<T extends PosSearchableProduct>(
  products: readonly T[],
  code: string,
): T | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const byBarcode = products.find((p) => p.barcode && p.barcode.toLowerCase() === lower);
  if (byBarcode) return byBarcode;
  return products.find((p) => p.sku && p.sku.toLowerCase() === lower);
}
