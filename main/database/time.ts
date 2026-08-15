/**
 * R4.1 — pure timestamp helpers (extracted from main/db.ts; behavior unchanged).
 */

export function now(): string {
  // Match SQLite's CURRENT_TIMESTAMP format (`YYYY-MM-DD HH:MM:SS`, UTC). The
  // legacy `new Date().toISOString()` form (with `T`, `Z`, milliseconds) was
  // mixed into columns whose `CREATE TABLE` defaults use CURRENT_TIMESTAMP, so
  // range and ordering operations on those columns stopped sorting correctly.
  // Migration v45 normalized the legacy ISO rows to this format. #208
  return new Date().toISOString().replace('T', ' ').replace(/\..*$/, '');
}

/**
 * Parse a DB timestamp into a Date. Columns are stored in UTC wall time in
 * `YYYY-MM-DD HH:MM:SS` (space) form — V8's legacy parser treats that form as
 * machine-LOCAL time, so `new Date(ts)` silently shifts by the host's offset
 * on machines outside UTC. ISO rows (`...T10:00:00.123Z`, pre-v40 data) parse
 * as UTC natively. Use this everywhere a stored timestamp is turned into a
 * Date (reports, receipts, KDS clocks, auth token staleness, telemetry).
 */
export function parseDbTimestamp(ts: string | null | undefined): Date {
  if (!ts) return new Date(NaN);
  // Space form: append a Z so V8 parses it as UTC instead of machine-local.
  return /^\d{4}-\d{2}-\d{2} /.test(ts) ? new Date(`${ts.replace(' ', 'T')}Z`) : new Date(ts);
}

/**
 * "Today" as a `YYYY-MM-DD` string in UTC. All daily boundaries are UTC —
 * the tenant timezone setting only drives the insights hour/day bucketing,
 * never which day a row belongs to.
 */
export function utcTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `[start, end)` half-open range strings (UTC wall, `YYYY-MM-DD HH:MM:SS`)
 * for a given `YYYY-MM-DD` date. Use with `WHERE col >= ? AND col < ?`
 * against the UTC timestamp columns (`created_at`, `paid_at`, etc.) so
 * indexes apply instead of `date(col) = date('now')`, which can't. #208
 *
 * Bounds are emitted in the space form so string comparisons line up exactly
 * with stored rows (migration v40 normalized all rows to it).
 */
export function utcDayBounds(date: string): [string, string] {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  const fmt = (dt: Date) => dt.toISOString().replace('T', ' ').replace(/\..*$/, '');
  return [fmt(start), fmt(end)];
}

/**
 * Business calendar date (`YYYY-MM-DD`) for an instant in an IANA timezone.
 * Used by M5-G day close (OD-M5-5) — not UTC day boundaries.
 */
export function businessDateInTimezone(timezone: string, when: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

/** Offset ms such that `utcMs + offset ≈ wall time in zone interpreted as UTC`. */
function timezoneOffsetMsAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

/** Local midnight (00:00:00) of `YYYY-MM-DD` in `timeZone`, as UTC epoch ms. Two-pass DST-safe. */
function localMidnightUtcMs(businessDate: string, timeZone: string): number {
  const [y, m, d] = businessDate.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = wallAsUtc - timezoneOffsetMsAt(wallAsUtc, timeZone);
  guess = wallAsUtc - timezoneOffsetMsAt(guess, timeZone);
  return guess;
}

function addOneCalendarDay(businessDate: string): string {
  const [y, m, d] = businessDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function formatUtcWallTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\..*$/, '');
}

/**
 * Half-open `[start, end)` UTC wall timestamps for a local business date in an
 * IANA timezone. Query with `closed_at >= start AND closed_at < end`.
 */
export function localDayBoundsUtc(businessDate: string, timezone: string): [string, string] {
  const startMs = localMidnightUtcMs(businessDate, timezone);
  const endMs = localMidnightUtcMs(addOneCalendarDay(businessDate), timezone);
  return [formatUtcWallTimestamp(startMs), formatUtcWallTimestamp(endMs)];
}

/** Verify a user PIN against the stored pin_hash. */
