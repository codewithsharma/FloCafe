/**
 * Prepaid checkout payable invariants (GUI-0002).
 * Never treat a missing/invalid tax preview as Confirm Payment · ฿0.00
 * when the cart still has payable items.
 */

export type PrepaidPayableState = {
  cartSubtotal: number;
  /** null = preview not available yet / failed */
  previewTotal: number | null;
  taxLoading: boolean;
  taxError?: string | null;
};

/** True only when a positive payable total is known and cart is consistent. */
export function canConfirmPrepaidPayment(state: PrepaidPayableState): boolean {
  if (state.taxLoading) return false;
  if (state.previewTotal === null || !Number.isFinite(state.previewTotal)) return false;
  if (state.cartSubtotal > 0 && state.previewTotal <= 0) return false;
  return state.previewTotal > 0;
}

/**
 * Amount for the Confirm Payment label, or null when the UI must not show ฿0.00
 * (loading, error, or inconsistent zero with items).
 */
export function prepaidConfirmLabelAmount(state: PrepaidPayableState): number | null {
  if (state.taxLoading) return null;
  if (state.previewTotal === null || !Number.isFinite(state.previewTotal)) return null;
  if (state.cartSubtotal > 0 && state.previewTotal <= 0) return null;
  if (state.previewTotal <= 0) return null;
  return state.previewTotal;
}
