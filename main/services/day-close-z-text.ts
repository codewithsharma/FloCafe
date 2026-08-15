/**
 * R9 Slice 4 — plain-text day-close Z from frozen summary (no recomputation).
 */
export type DayCloseZSummary = {
  business_date: string;
  timezone: string;
  shift_count: number;
  open_shift_count: number;
  open_shifts_warning: boolean;
  opening_float_cents_total: number;
  expected_cash_cents_total: number;
  counted_cash_cents_total: number | null;
  variance_cents_total: number | null;
  cash_payment_total_cents: number;
  cash_payment_count: number;
  cash_refund_total_cents: number;
  cash_refund_count: number;
  net_cash_movement_cents: number;
  shifts?: Array<{
    id: number;
    terminal_id: string;
    net_cash_movement_cents: number;
  }>;
};

function formatCentsField(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  const truncated = Math.trunc(cents);
  const sign = truncated < 0 ? '-' : '';
  const abs = Math.abs(truncated);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${String(frac).padStart(2, '0')}`;
}

export function formatDayCloseZPlainText(
  summary: DayCloseZSummary,
  options: { businessName?: string; closedAt?: string | null } = {},
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
