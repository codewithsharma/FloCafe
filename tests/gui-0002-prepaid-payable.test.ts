/**
 * GUI-0002 — prepaid payable invariants (pure helpers).
 * RED before PrepaidCheckoutModal wires these helpers.
 */
import * as assert from 'node:assert/strict';
import {
  canConfirmPrepaidPayment,
  prepaidConfirmLabelAmount,
  type PrepaidPayableState,
} from '../frontend/src/lib/prepaid-payable';

function state(partial: Partial<PrepaidPayableState>): PrepaidPayableState {
  return {
    cartSubtotal: 0,
    previewTotal: null,
    taxLoading: false,
    taxError: null,
    ...partial,
  };
}

console.log('GUI-0002 prepaid payable');

assert.equal(
  prepaidConfirmLabelAmount(state({ cartSubtotal: 60, previewTotal: null, taxLoading: false })),
  null,
  'missing preview must not render Confirm · ฿0.00',
);

assert.equal(
  canConfirmPrepaidPayment(state({ cartSubtotal: 60, previewTotal: null })),
  false,
  'cannot confirm when preview missing and cart has items',
);

assert.equal(
  canConfirmPrepaidPayment(state({ cartSubtotal: 60, previewTotal: 0 })),
  false,
  'cannot confirm zero payable with non-empty cart',
);

assert.equal(
  prepaidConfirmLabelAmount(state({ cartSubtotal: 60, previewTotal: 0 })),
  null,
  'zero payable with cart items must not show ฿0.00 confirm label',
);

assert.equal(
  canConfirmPrepaidPayment(state({ cartSubtotal: 60, previewTotal: 64.2 })),
  true,
  'happy path ฿64.20 confirm allowed',
);

assert.equal(
  prepaidConfirmLabelAmount(state({ cartSubtotal: 60, previewTotal: 64.2 })),
  64.2,
);

assert.equal(
  canConfirmPrepaidPayment(state({ cartSubtotal: 0, previewTotal: 0 })),
  false,
  'empty cart zero total cannot confirm',
);

assert.equal(
  canConfirmPrepaidPayment(state({ cartSubtotal: 60, previewTotal: 64.2, taxLoading: true })),
  false,
);

console.log('✅ GUI-0002 prepaid payable tests passed');
