/**
 * M4-E2 — Shift UI integration tests (pure helpers + module contracts).
 *
 * Usage: ts-node --transpile-only -P tests/tsconfig.json tests/shift-ui.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  canManageShifts,
  mapShiftMutationError,
} from '../frontend/src/lib/shifts';
import {
  formatCentsForInput,
  parseCurrencyInputToCents,
} from '../frontend/src/lib/money';
import { applyShiftFetchOutcome } from '../frontend/src/lib/shifts';
import { shouldAttachTerminalId } from '../frontend/src/lib/terminal-id';

const OPEN_MODAL_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/components/shifts/OpenShiftModal.tsx`,
  'utf8',
);
const CLOSE_MODAL_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/components/shifts/CloseShiftModal.tsx`,
  'utf8',
);
const STATUS_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/components/shifts/ShiftStatusSection.tsx`,
  'utf8',
);

const SAMPLE_SHIFT = {
  id: 7,
  terminal_id: 'term-ui-001',
  status: 'open' as const,
  opened_by_user_id: 'owner-1',
  closed_by_user_id: null,
  opening_float_cents: 10000,
  opening_note: null,
  closing_note: null,
  counted_cash_cents: null,
  opened_at: '2026-08-12T10:00:00.000Z',
  closed_at: null,
  created_at: '2026-08-12T10:00:00.000Z',
  updated_at: '2026-08-12T10:00:00.000Z',
};

async function main(): Promise<void> {
  console.log('M4-E2 Shift UI Integration Tests');
  console.log('='.repeat(60));

  {
    const disabled = applyShiftFetchOutcome({ kind: 'disabled' }, false);
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.error, null);
    console.log('   ✓ shifts disabled → no error state');
  }

  {
    const inactive = applyShiftFetchOutcome({ kind: 'no_shift' }, false);
    assert.equal(inactive.shift, null);
    assert.equal(inactive.error, null);
    console.log('   ✓ no active shift → inactive without error');
  }

  {
    const active = applyShiftFetchOutcome({ kind: 'active', shift: SAMPLE_SHIFT }, false);
    assert.equal(active.shift?.id, 7);
    console.log('   ✓ active shift → populated state');
  }

  {
    assert.ok(OPEN_MODAL_SOURCE.includes('DialogTitle'));
    assert.ok(OPEN_MODAL_SOURCE.includes('opening_float_cents'));
    assert.ok(OPEN_MODAL_SOURCE.includes('parseCurrencyInputToCents'));
    console.log('   ✓ open shift modal structure present');
  }

  {
    assert.equal(parseCurrencyInputToCents('-1').ok, false);
    assert.equal(parseCurrencyInputToCents('abc').ok, false);
    assert.equal(parseCurrencyInputToCents('100.00').ok, true);
    if (parseCurrencyInputToCents('100.00').ok) {
      assert.equal(parseCurrencyInputToCents('100.00').cents, 10000);
    }
    assert.equal(parseCurrencyInputToCents('25.50').ok, true);
    if (parseCurrencyInputToCents('25.50').ok) {
      assert.equal(parseCurrencyInputToCents('25.50').cents, 2550);
    }
    console.log('   ✓ currency validation rejects invalid/negative values');
  }

  {
    assert.ok(OPEN_MODAL_SOURCE.includes('opening_float_cents: parsed.cents'));
    assert.ok(CLOSE_MODAL_SOURCE.includes('counted_cash_cents: parsed.cents'));
    console.log('   ✓ open/close modals send integer cents to API');
  }

  {
    assert.ok(OPEN_MODAL_SOURCE.includes('onSuccess={refresh}') || OPEN_MODAL_SOURCE.includes('onSuccess'));
    assert.ok(STATUS_SOURCE.includes('onSuccess={refresh}'));
    console.log('   ✓ successful mutations call refresh()');
  }

  {
    assert.ok(OPEN_MODAL_SOURCE.includes('if (submitting) return'));
    assert.ok(CLOSE_MODAL_SOURCE.includes('disabled={submitting'));
    console.log('   ✓ duplicate submission guarded in modals');
  }

  {
    assert.ok(OPEN_MODAL_SOURCE.includes('setError(mapShiftMutationError(err))'));
    assert.ok(OPEN_MODAL_SOURCE.includes('toast.success(t(\'shift.openSuccess\'))'));
    assert.ok(OPEN_MODAL_SOURCE.includes('await onSuccess();'));
    console.log('   ✓ open modal surfaces errors and refreshes on success');
  }

  {
    assert.ok(CLOSE_MODAL_SOURCE.includes('DialogTitle'));
    assert.ok(CLOSE_MODAL_SOURCE.includes('counted_cash_cents'));
    console.log('   ✓ close shift modal structure present');
  }

  {
    assert.equal(canManageShifts('cashier'), true);
    assert.equal(canManageShifts('owner'), true);
    assert.equal(canManageShifts('waiter'), false);
    assert.equal(canManageShifts('chef'), false);
    console.log('   ✓ unauthorized roles excluded from shift controls');
  }

  {
    const err503 = mapShiftMutationError({
      isAxiosError: true,
      response: { status: 503, data: { error: 'Shift management is disabled' } },
    });
    assert.match(err503, /disabled/i);
    console.log('   ✓ mutation errors mapped to user-facing messages');
  }

  {
    assert.ok(shouldAttachTerminalId('/shifts/active', 'get'));
    assert.ok(!OPEN_MODAL_SOURCE.includes('/shifts/terminal-id'));
    console.log('   ✓ browser uses terminal header, not host terminal-id endpoint');
  }

  {
    assert.equal(formatCentsForInput(0), '0.00');
    assert.equal(formatCentsForInput(2550), '25.50');
    console.log('   ✓ cents formatting helper deterministic');
  }

  console.log('='.repeat(60));
  console.log('✅ M4-E2 shift UI integration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
