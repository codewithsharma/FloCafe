/**
 * Phase 3.6D — Day-close Z snapshot contracts + formatter units.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/day-close-z.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFront(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function formatCentsField(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  const truncated = Math.trunc(cents);
  const sign = truncated < 0 ? '-' : '';
  const abs = Math.abs(truncated);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

function main(): void {
  console.log('Phase 3.6D Day-Close Z Snapshot');
  console.log('='.repeat(60));

  assert.equal(formatCentsField(12345), '123.45', 'cents display 12345');
  assert.equal(formatCentsField(0), '0.00', 'cents display 0');
  assert.equal(formatCentsField(-50), '-0.50', 'cents display negative');
  assert.equal(formatCentsField(null), '—', 'null cents');
  console.log('   ✓ cents field presentation');

  const zClient = readFront('lib/day-close-z.ts');
  assert.ok(zClient.includes('formatDayCloseZPlainText'), 'exports plain-text formatter');
  assert.ok(zClient.includes('downloadDayCloseZText'), 'exports download helper');
  assert.ok(zClient.includes('cash_payment_total_cents'), 'shows Cash In field');
  assert.ok(zClient.includes('cash_refund_total_cents'), 'shows Cash Refunds field');
  assert.ok(zClient.includes('net_cash_movement_cents'), 'shows Net Cash field');
  assert.ok(zClient.includes('expected_cash_cents_total'), 'shows expected cash');
  assert.ok(zClient.includes('variance_cents_total'), 'shows variance');
  assert.ok(!/grossSales|netSales/.test(zClient), 'must not invent gross/net sales into Z');
  assert.ok(!/\+\s*summary\.|\-\s*summary\./.test(zClient), 'must not recompute summary totals');

  const { formatDayCloseZPlainText } = require('../frontend/src/lib/day-close-z.ts');
  const sampleText = formatDayCloseZPlainText({
    business_date: '2026-08-14',
    timezone: 'Asia/Kolkata',
    shift_count: 1,
    open_shift_count: 0,
    open_shifts_warning: false,
    opening_float_cents_total: 10000,
    expected_cash_cents_total: 15000,
    counted_cash_cents_total: 14900,
    variance_cents_total: -100,
    cash_payment_total_cents: 5000,
    cash_payment_count: 2,
    cash_refund_total_cents: 500,
    cash_refund_count: 1,
    net_cash_movement_cents: 4500,
    shifts: [
      {
        id: 1,
        terminal_id: 't1',
        opened_by_user_id: 'u',
        closed_by_user_id: 'u',
        opening_float_cents: 10000,
        expected_cash_cents: 15000,
        counted_cash_cents: 14900,
        variance_cents: -100,
        cash_payment_total_cents: 5000,
        cash_payment_count: 2,
        cash_refund_total_cents: 500,
        cash_refund_count: 1,
        net_cash_movement_cents: 4500,
        opened_at: 'x',
        closed_at: 'y',
      },
    ],
  });
  assert.ok(sampleText.includes('DAY CLOSE Z SNAPSHOT'), 'banner');
  assert.ok(sampleText.includes('50.00'), 'cash in cents displayed');
  assert.ok(sampleText.includes('5.00'), 'cash refund cents displayed');
  assert.ok(sampleText.includes('45.00'), 'net cash cents displayed');
  assert.ok(sampleText.includes('2026-08-14'), 'business date');
  console.log('   ✓ client Z formatter contract');

  const card = readFront('components/dashboard/DayCloseCard.tsx');
  assert.ok(card.includes('downloadDayCloseZText') || card.includes('dayClose.download'), 'card has download');
  assert.ok(card.includes('print-day-close') || card.includes('printDayClose'), 'card has print');
  assert.ok(card.includes('postDayClose'), 'close action preserved');
  console.log('   ✓ DayCloseCard Z actions');

  const thermal = fs.readFileSync(path.join(ROOT, 'main/printers/thermal.ts'), 'utf8');
  assert.ok(thermal.includes('formatDayCloseZ') || thermal.includes('DAY CLOSE Z'), 'thermal Z formatter');
  assert.ok(thermal.includes('printDayCloseZ') || thermal.includes('printDayClose'), 'thermal Z print');
  console.log('   ✓ thermal Z print helpers');

  const printers = fs.readFileSync(path.join(ROOT, 'main/routes/printers.ts'), 'utf8');
  assert.ok(printers.includes('/print-day-close'), 'print-day-close route');
  assert.ok(printers.includes('getDayClose'), 'print loads frozen day close');
  console.log('   ✓ printers route');

  const dayCloseSvc = fs.readFileSync(path.join(ROOT, 'main/services/day-close.ts'), 'utf8');
  // Ensure we did not edit formula lines for this phase — still has net cash from cash - refunds in service
  assert.ok(dayCloseSvc.includes('net_cash_movement_cents'), 'day-close service ownership preserved');
  console.log('   ✓ day-close service present');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('dayClose.printZ'), 'en print label');
  assert.ok(en.includes('dayClose.downloadZ'), 'en download label');
  console.log('   ✓ i18n');

  console.log('='.repeat(60));
  console.log('✅ Phase 3.6D day-close Z contracts passed');
}

main();
