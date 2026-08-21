/**
 * Restaurant 86 (sold-out) helpers.
 *
 * Fail closed: missing vertical or non-manager roles never show POS 86 chrome.
 * Retail uses Products admin for deactivation — no café 86 control.
 *
 * INV-AUTO-86: effective inactivity is `is_active=0`. Manual vs auto is distinguished
 * via `manual_unavailable` / `auto_unavailable` when the API returns those fields.
 */

export function canShowRestaurantEightySix(
  verticalId: string | undefined | null,
  role: string | undefined | null,
): boolean {
  return verticalId === 'restaurant' && (role === 'owner' || role === 'manager');
}

export function productAvailabilityPath(productId: string): string {
  return `/products/${productId}/availability`;
}

export function isProductInactive(product: { is_active?: boolean | number | null }): boolean {
  return Number(product.is_active) === 0;
}

export function isAutoEightySixed(product: {
  auto_unavailable?: boolean | number | null;
}): boolean {
  return Number(product.auto_unavailable) === 1;
}

export function isManualEightySixed(product: {
  manual_unavailable?: boolean | number | null;
}): boolean {
  return Number(product.manual_unavailable) === 1;
}

/** Label hint for the POS restore strip (manual vs stock-driven). */
export function eightySixRestoreHint(product: {
  auto_unavailable?: boolean | number | null;
  manual_unavailable?: boolean | number | null;
}): 'auto' | 'manual' | 'both' {
  const auto = isAutoEightySixed(product);
  const manual = isManualEightySixed(product);
  if (auto && manual) return 'both';
  if (auto) return 'auto';
  return 'manual';
}
