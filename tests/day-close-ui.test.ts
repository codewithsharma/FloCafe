/**
 * M5-G day close client + DayCloseCard source contracts.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/day-close-ui.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DAY_CLOSE_CLIENT = fs.readFileSync(
  path.join(__dirname, '../frontend/src/lib/day-close.ts'),
  'utf8',
);
const DAY_CLOSE_CARD = fs.readFileSync(
  path.join(__dirname, '../frontend/src/components/dashboard/DayCloseCard.tsx'),
  'utf8',
);
const OPERATIONS_PAGE = fs.readFileSync(
  path.join(__dirname, '../frontend/src/app/(dashboard)/operations/page.tsx'),
  'utf8',
);
const DASHBOARD_PAGE = fs.readFileSync(
  path.join(__dirname, '../frontend/src/app/(dashboard)/dashboard/page.tsx'),
  'utf8',
);

function main(): void {
  console.log('M5-G Day Close UI Contracts');
  console.log('='.repeat(60));

  assert.ok(DAY_CLOSE_CLIENT.includes('postDayClose'), 'client exports postDayClose');
  assert.ok(DAY_CLOSE_CLIENT.includes('getDayClose'), 'client exports getDayClose');
  assert.ok(DAY_CLOSE_CLIENT.includes('/reports/day-close'), 'client hits day-close routes');
  assert.ok(DAY_CLOSE_CLIENT.includes('formatVarianceLabel'), 'reuses variance label helper');
  console.log('   ✓ day-close client contract');

  assert.ok(DAY_CLOSE_CARD.includes('postDayClose'), 'card can close day');
  assert.ok(DAY_CLOSE_CARD.includes('getDayClose'), 'card loads existing close');
  assert.ok(DAY_CLOSE_CARD.includes('open_shifts_warning'), 'card shows open-shift warning');
  assert.ok(DAY_CLOSE_CARD.includes("role === 'owner'") || DAY_CLOSE_CARD.includes("role === \"owner\""), 'owner gate');
  assert.ok(DAY_CLOSE_CARD.includes('manager'), 'manager gate');
  console.log('   ✓ DayCloseCard contract');

  assert.ok(OPERATIONS_PAGE.includes('DayCloseCard'), 'operations wires DayCloseCard');
  assert.ok(!DASHBOARD_PAGE.includes('DayCloseCard'), 'dashboard no longer wires DayCloseCard');
  console.log('   ✓ operations wires DayCloseCard (Phase 10)');

  console.log('='.repeat(60));
  console.log('✅ M5-G day-close UI contracts passed');
}

main();
