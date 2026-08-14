/**
 * Restaurant 86 (sold-out) helpers.
 *
 * Fail closed: missing vertical or non-manager roles never show POS 86 chrome.
 * Retail uses Products admin for deactivation — no café 86 control.
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
