/**
 * Phase 3.6D — Day-close Z snapshot plain-text formatter (download).
 * Displays frozen DayCloseSummary cents fields only — does not recompute accounting totals.
 */
import type { DayCloseSummary } from './day-close';

/** Present integer cents as decimal string without inventing new totals. */
export function formatCentsField(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  const truncated = Math.trunc(cents);
  const sign = truncated < 0 ? '-' : '';
  const abs = Math.abs(truncated);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

export interface DayCloseZFormatOptions {
  businessName?: string;
  closedAt?: string | null;
}

/** Human-readable cash Z snapshot from authoritative summary fields. */
export function formatDayCloseZPlainText(
  summary: DayCloseSummary,
  options: DayCloseZFormatOptions = {},
): string {
  const lines: string[] = [];
  lines.push('DAY CLOSE Z SNAPSHOT');
  lines.push('====================');
  if (options.businessName) lines.push(`Store: ${options.businessName}`);
  lines.push(`Business date: ${summary.business_date}`);
  lines.push(`Timezone: ${summary.timezone}`);
  if (options.closedAt) lines.push(`Closed at: ${options.closedAt}`);
  lines.push('');
  lines.push('CASH RECONCILIATION');
  lines.push('------------------');
  lines.push(`Opening float: ${formatCentsField(summary.opening_float_cents_total)}`);
  lines.push(`Expected cash: ${formatCentsField(summary.expected_cash_cents_total)}`);
  lines.push(`Counted cash: ${formatCentsField(summary.counted_cash_cents_total)}`);
  lines.push(`Cash variance: ${formatCentsField(summary.variance_cents_total)}`);
  lines.push('');
  lines.push('CASH MOVEMENT');
  lines.push('-------------');
  lines.push(
    `Cash In: ${formatCentsField(summary.cash_payment_total_cents)} (${summary.cash_payment_count})`,
  );
  lines.push(
    `Cash Refunds: ${formatCentsField(summary.cash_refund_total_cents)} (${summary.cash_refund_count})`,
  );
  lines.push(`Net Cash: ${formatCentsField(summary.net_cash_movement_cents)}`);
  lines.push('');
  lines.push(`Shifts closed: ${summary.shift_count}`);
  lines.push(`Open shifts at close: ${summary.open_shift_count}`);
  if (summary.open_shifts_warning) {
    lines.push('WARNING: One or more shifts were still open at close.');
  }
  if (summary.shifts?.length) {
    lines.push('');
    lines.push('PER-SHIFT CASH');
    lines.push('--------------');
    for (const shift of summary.shifts) {
      lines.push(
        `Shift #${shift.id} · ${shift.terminal_id} · Net ${formatCentsField(shift.net_cash_movement_cents)}`,
      );
    }
  }
  lines.push('');
  lines.push('(Cash reconciliation snapshot — not a full sales Z.)');
  lines.push('');
  return lines.join('\n');
}

export function downloadDayCloseZText(
  summary: DayCloseSummary,
  options: DayCloseZFormatOptions = {},
): void {
  const text = formatDayCloseZPlainText(summary, options);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `day-close-z-${summary.business_date}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
