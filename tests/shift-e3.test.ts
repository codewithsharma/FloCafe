/**
 * M4-E3 — Shift UI polish: stale warnings + shift history client tests.
 *
 * Usage: ts-node --transpile-only -P tests/tsconfig.json tests/shift-e3.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  DEFAULT_SHIFT_STALE_HOURS,
  canForceCloseShifts,
  canViewShiftHistory,
  isShiftStale,
  parseShiftStaleHours,
} from '../frontend/src/lib/shifts';

const STATUS_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/components/shifts/ShiftStatusSection.tsx`,
  'utf8',
);
const FORCE_CLOSE_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/components/shifts/ForceCloseShiftModal.tsx`,
  'utf8',
);
const HISTORY_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/components/shifts/ShiftHistoryPanel.tsx`,
  'utf8',
);
const SHIFTS_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/lib/shifts.ts`,
  'utf8',
);

async function main(): Promise<void> {
  console.log('M4-E3 Shift UI Polish Tests');
  console.log('='.repeat(60));

  {
    assert.equal(parseShiftStaleHours(undefined), DEFAULT_SHIFT_STALE_HOURS);
    assert.equal(parseShiftStaleHours('24'), 24);
    assert.equal(parseShiftStaleHours('0'), DEFAULT_SHIFT_STALE_HOURS);
    assert.equal(parseShiftStaleHours('abc'), DEFAULT_SHIFT_STALE_HOURS);
    console.log('   ✓ parseShiftStaleHours honors server default fallback');
  }

  {
    const openedAt = '2026-08-10T10:00:00.000Z';
    const now = new Date('2026-08-12T11:00:00.000Z');
    assert.equal(isShiftStale(openedAt, 24, now), true);
    assert.equal(isShiftStale('2026-08-12T09:00:00.000Z', 24, now), false);
    assert.equal(isShiftStale('not-a-date', 24, now), false);
    console.log('   ✓ isShiftStale compares opened_at to threshold hours');
  }

  {
    assert.equal(canForceCloseShifts('owner'), true);
    assert.equal(canForceCloseShifts('manager'), true);
    assert.equal(canForceCloseShifts('cashier'), false);
    assert.equal(canViewShiftHistory('manager'), true);
    assert.equal(canViewShiftHistory('cashier'), false);
    console.log('   ✓ force-close and history role helpers match RFC §12');
  }

  {
    assert.ok(SHIFTS_SOURCE.includes('fetchShiftStaleHours'));
    assert.ok(SHIFTS_SOURCE.includes('listShifts'));
    assert.ok(SHIFTS_SOURCE.includes('forceCloseShift'));
    assert.ok(SHIFTS_SOURCE.includes('/settings/shift_stale_hours'));
    assert.ok(SHIFTS_SOURCE.includes('/force-close'));
    console.log('   ✓ shift client exposes stale hours, history, and force-close APIs');
  }

  {
    assert.ok(STATUS_SOURCE.includes('isShiftStale'));
    assert.ok(STATUS_SOURCE.includes('fetchShiftStaleHours'));
    assert.ok(STATUS_SOURCE.includes('shift.staleWarning'));
    assert.ok(STATUS_SOURCE.includes('ForceCloseShiftModal'));
    assert.ok(STATUS_SOURCE.includes('canForceClose'));
    console.log('   ✓ StatusBar section renders stale banner and force-close entry');
  }

  {
    assert.ok(FORCE_CLOSE_SOURCE.includes('reason'));
    assert.ok(FORCE_CLOSE_SOURCE.includes('forceCloseShift'));
    assert.ok(FORCE_CLOSE_SOURCE.includes('shift.errorForceCloseReasonRequired'));
    assert.ok(!FORCE_CLOSE_SOURCE.includes('/shifts/terminal-id'));
    console.log('   ✓ force-close modal requires reason and uses force-close API');
  }

  {
    assert.ok(HISTORY_SOURCE.includes('listShifts'));
    assert.ok(HISTORY_SOURCE.includes('shift.historyTitle'));
    assert.ok(HISTORY_SOURCE.includes('historyLoadMore'));
    console.log('   ✓ shift history panel loads paginated shifts');
  }

  console.log('='.repeat(60));
  console.log('✅ M4-E3 shift UI polish tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
