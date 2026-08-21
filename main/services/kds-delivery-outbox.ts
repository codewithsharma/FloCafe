/**
 * KDS-H-OUTBOX — durable snapshot delivery intent (not a second SoR).
 *
 * SQLite order_items/orders remain authoritative kitchen state.
 * This table records that authenticated KDS clients need a fresh board push.
 * Drain re-reads live SQLite and broadcasts; retries are idempotent snapshots.
 */

import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import { getDatabase, isDatabaseOpen, isKdsEnabled, now } from '../db';
import { isModuleEnabled } from '../modules';

export type KdsOutboxStatus = 'pending' | 'in_flight' | 'done' | 'failed' | 'cancelled';

export type KdsOutboxRow = {
  id: string;
  event_id: string;
  job_type: string;
  status: KdsOutboxStatus;
  attempts: number;
  max_attempts: number;
  order_id: number | null;
  item_id: number | null;
  payload_json: string | null;
  last_error: string | null;
  next_attempt_at: string;
  leased_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

/** Base delay (ms) for attempt 0 → ~1s, then exponential. */
export const KDS_OUTBOX_BASE_DELAY_MS = 1000;
/** Cap delay at 60s. */
export const KDS_OUTBOX_MAX_DELAY_MS = 60_000;
export const KDS_OUTBOX_DEFAULT_MAX_ATTEMPTS = 12;
/** Recover in_flight leases older than this. */
export const KDS_OUTBOX_LEASE_STALE_MS = 60_000;
/** Prune completed rows older than this. */
export const KDS_OUTBOX_DONE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const KDS_OUTBOX_JOB_TYPE_SNAPSHOT = 'snapshot';

type Db = Database.Database;

export function computeKdsOutboxBackoffMs(attemptsAfterFailure: number, jitterMs = 0): number {
  const exp = Math.max(0, attemptsAfterFailure);
  const raw = KDS_OUTBOX_BASE_DELAY_MS * 2 ** exp;
  const capped = Math.min(KDS_OUTBOX_MAX_DELAY_MS, raw);
  const jitter = Math.max(0, Math.min(jitterMs, 500));
  return capped + jitter;
}

function shape(row: KdsOutboxRow): KdsOutboxRow {
  return {
    ...row,
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    order_id: row.order_id == null ? null : Number(row.order_id),
    item_id: row.item_id == null ? null : Number(row.item_id),
  };
}

function isoPlusMs(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/**
 * Coalesce to a single open snapshot delivery intent.
 * Safe to call inside the same transaction as kitchen status mutation.
 */
export function enqueueKdsSnapshotDelivery(
  db: Db,
  meta?: { orderId?: number | string | null; itemId?: number | string | null; reason?: string },
): KdsOutboxRow {
  const ts = now();
  const open = db
    .prepare(
      `SELECT * FROM kds_delivery_outbox
       WHERE job_type = ? AND status IN ('pending', 'in_flight', 'failed')
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(KDS_OUTBOX_JOB_TYPE_SNAPSHOT) as KdsOutboxRow | undefined;

  const payload = JSON.stringify({
    reason: meta?.reason ?? 'kitchen_update',
    order_id: meta?.orderId ?? null,
    item_id: meta?.itemId ?? null,
    coalesced_at: ts,
  });

  if (open) {
    db.prepare(
      `UPDATE kds_delivery_outbox
       SET status = 'pending',
           next_attempt_at = ?,
           leased_at = NULL,
           payload_json = ?,
           order_id = COALESCE(?, order_id),
           item_id = COALESCE(?, item_id),
           last_error = NULL,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      ts,
      payload,
      meta?.orderId != null ? Number(meta.orderId) : null,
      meta?.itemId != null ? Number(meta.itemId) : null,
      ts,
      open.id,
    );
    return shape(
      db.prepare(`SELECT * FROM kds_delivery_outbox WHERE id = ?`).get(open.id) as KdsOutboxRow,
    );
  }

  const id = uuidv4();
  const eventId = `kds-snap-${id}`;
  db.prepare(
    `INSERT INTO kds_delivery_outbox (
      id, event_id, job_type, status, attempts, max_attempts,
      order_id, item_id, payload_json, last_error,
      next_attempt_at, leased_at, created_at, updated_at, completed_at
    ) VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, NULL)`,
  ).run(
    id,
    eventId,
    KDS_OUTBOX_JOB_TYPE_SNAPSHOT,
    KDS_OUTBOX_DEFAULT_MAX_ATTEMPTS,
    meta?.orderId != null ? Number(meta.orderId) : null,
    meta?.itemId != null ? Number(meta.itemId) : null,
    payload,
    ts,
    ts,
    ts,
  );
  return shape(
    db.prepare(`SELECT * FROM kds_delivery_outbox WHERE id = ?`).get(id) as KdsOutboxRow,
  );
}

export function recoverStaleKdsOutboxLeases(db?: Db): number {
  const database = db ?? (isDatabaseOpenSafe() ? getDatabase() : null);
  if (!database) return 0;
  const cutoff = new Date(Date.now() - KDS_OUTBOX_LEASE_STALE_MS).toISOString();
  const ts = now();
  const info = database
    .prepare(
      `UPDATE kds_delivery_outbox
       SET status = 'pending', leased_at = NULL, next_attempt_at = ?, updated_at = ?
       WHERE status = 'in_flight' AND (leased_at IS NULL OR leased_at < ?)`,
    )
    .run(ts, ts, cutoff);
  return Number(info.changes ?? 0);
}

function isDatabaseOpenSafe(): boolean {
  try {
    return isDatabaseOpen();
  } catch {
    return false;
  }
}

/** Atomically claim the next eligible row (CAS on status). */
export function claimNextKdsOutboxJob(db: Db = getDatabase()): KdsOutboxRow | null {
  recoverStaleKdsOutboxLeases(db);
  const ts = now();
  const row = db
    .prepare(
      `SELECT * FROM kds_delivery_outbox
       WHERE status IN ('pending', 'failed')
         AND next_attempt_at <= ?
         AND attempts < max_attempts
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT 1`,
    )
    .get(ts) as KdsOutboxRow | undefined;
  if (!row) return null;

  const info = db
    .prepare(
      `UPDATE kds_delivery_outbox
       SET status = 'in_flight', leased_at = ?, updated_at = ?, attempts = attempts + 1
       WHERE id = ? AND status IN ('pending', 'failed')`,
    )
    .run(ts, ts, row.id);
  if (Number(info.changes ?? 0) !== 1) return null;
  return shape(
    db.prepare(`SELECT * FROM kds_delivery_outbox WHERE id = ?`).get(row.id) as KdsOutboxRow,
  );
}

export function markKdsOutboxDone(db: Db, id: string): void {
  const ts = now();
  db.prepare(
    `UPDATE kds_delivery_outbox
     SET status = 'done', completed_at = ?, leased_at = NULL, last_error = NULL, updated_at = ?
     WHERE id = ?`,
  ).run(ts, ts, id);
}

export function markKdsOutboxFailed(db: Db, id: string, error: string): KdsOutboxRow {
  const row = db.prepare(`SELECT * FROM kds_delivery_outbox WHERE id = ?`).get(id) as KdsOutboxRow;
  const attempts = Number(row.attempts);
  const ts = now();
  if (attempts >= Number(row.max_attempts)) {
    db.prepare(
      `UPDATE kds_delivery_outbox
       SET status = 'failed', last_error = ?, leased_at = NULL, updated_at = ?, completed_at = ?
       WHERE id = ?`,
    ).run(error.slice(0, 500), ts, ts, id);
  } else {
    const delay = computeKdsOutboxBackoffMs(attempts, Math.floor(Math.random() * 250));
    db.prepare(
      `UPDATE kds_delivery_outbox
       SET status = 'pending', last_error = ?, leased_at = NULL,
           next_attempt_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(error.slice(0, 500), isoPlusMs(delay), ts, id);
  }
  return shape(
    db.prepare(`SELECT * FROM kds_delivery_outbox WHERE id = ?`).get(id) as KdsOutboxRow,
  );
}

/** Mark all open snapshot jobs done after a successful live broadcast. */
export function completeOpenKdsSnapshotJobs(db: Db = getDatabase()): number {
  const ts = now();
  const info = db
    .prepare(
      `UPDATE kds_delivery_outbox
       SET status = 'done', completed_at = ?, leased_at = NULL, last_error = NULL, updated_at = ?
       WHERE job_type = ? AND status IN ('pending', 'in_flight', 'failed')`,
    )
    .run(ts, ts, KDS_OUTBOX_JOB_TYPE_SNAPSHOT);
  return Number(info.changes ?? 0);
}

export function listOpenKdsOutboxJobs(db: Db = getDatabase()): KdsOutboxRow[] {
  return (
    db
      .prepare(
        `SELECT * FROM kds_delivery_outbox
         WHERE status IN ('pending', 'in_flight', 'failed')
         ORDER BY created_at ASC`,
      )
      .all() as KdsOutboxRow[]
  ).map(shape);
}

export function pruneCompletedKdsOutbox(db: Db = getDatabase()): number {
  const cutoff = new Date(Date.now() - KDS_OUTBOX_DONE_RETENTION_MS).toISOString();
  const info = db
    .prepare(
      `DELETE FROM kds_delivery_outbox
       WHERE status IN ('done', 'cancelled') AND completed_at IS NOT NULL AND completed_at < ?`,
    )
    .run(cutoff);
  return Number(info.changes ?? 0);
}

export type KdsBroadcastResult = { attempted: number; succeeded: number };

let drainInProgress = false;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let broadcastFn: (() => KdsBroadcastResult) | null = null;

export function registerKdsOutboxBroadcaster(fn: () => KdsBroadcastResult): void {
  broadcastFn = fn;
}

/**
 * Process at most one eligible outbox row.
 * Delivery re-reads SQLite via broadcastFn — never applies status from payload.
 */
export function processKdsOutboxOnce(db: Db = getDatabase()): {
  processed: boolean;
  result?: 'done' | 'failed' | 'skipped';
} {
  if (!isModuleEnabled('kds') || !isKdsEnabled()) {
    return { processed: false, result: 'skipped' };
  }
  if (drainInProgress) return { processed: false, result: 'skipped' };
  if (!broadcastFn) return { processed: false, result: 'skipped' };

  drainInProgress = true;
  try {
    const job = claimNextKdsOutboxJob(db);
    if (!job) return { processed: false, result: 'skipped' };

    try {
      const result = broadcastFn();
      if (result.succeeded > 0) {
        markKdsOutboxDone(db, job.id);
        // Coalesced siblings may still be open — clear them too after a good push.
        completeOpenKdsSnapshotJobs(db);
        return { processed: true, result: 'done' };
      }
      markKdsOutboxFailed(
        db,
        job.id,
        result.attempted === 0 ? 'no_authenticated_kds_clients' : 'broadcast_failed',
      );
      return { processed: true, result: 'failed' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      markKdsOutboxFailed(db, job.id, message);
      return { processed: true, result: 'failed' };
    }
  } finally {
    drainInProgress = false;
  }
}

export function startKdsOutboxWorker(intervalMs = 1000): void {
  if (workerTimer) return;
  try {
    recoverStaleKdsOutboxLeases();
  } catch (err) {
    console.error('[KDS Outbox] lease recovery skipped:', err);
  }
  workerTimer = setInterval(() => {
    try {
      if (!isDatabaseOpenSafe()) return;
      processKdsOutboxOnce();
      pruneCompletedKdsOutbox();
    } catch (err) {
      console.error('[KDS Outbox] worker tick failed:', err);
    }
  }, intervalMs);
  // Unref so tests/process exit are not blocked when running under Electron.
  if (typeof workerTimer === 'object' && workerTimer && 'unref' in workerTimer) {
    (workerTimer as NodeJS.Timeout).unref?.();
  }
}

export function stopKdsOutboxWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
