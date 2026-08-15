<!-- Last updated: 2026-08-15, schema v80 -->

# H4 — Restore / Conflict Hardening

**Slice:** Restore → Conflict Detection → Conflict-Safe Recovery  
**Branch:** `restaurant-vertical`  
**Status:** COMPLETE (2026-08-15)  
**Canonical plan:** [`docs/00-product/capability-matrix.md`](../00-product/capability-matrix.md)

## Delivered

1. **Backup create verification** — `createBackupUnlocked` runs `PRAGMA integrity_check` on the artifact before success; failed check deletes the incomplete file.
2. **Restore / backup audit** — HTTP `POST /api/db/backup` logs `backup.created`; IPC restore logs `restore.completed` / `restore.failed` (no secrets in metadata).
3. **Cancel TOCTOU** — order cancel re-reads `orders.status` inside `withTxn` before restock so concurrent/repeat cancels cannot double-restock.
4. **Item cancel retry** — already `cancelled`/`voided` items return `200` with `already_cancelled: true` (lost-response safe).
5. **Item restore conflict** — only `cancelled` items restore; uses tender guard (`ORDER_HAS_SUCCESSFUL_TENDER`); concurrent status mismatch → `409 ITEM_STATUS_CONFLICT`.
6. **Restore auth continuity** — continuity tests assert backup-only staff stay inactive after restore onto a fresh install (existing merge security); FIN-01 probe reactivates explicitly.

## Restore guarantees

- Corrupt/incomplete backups still fail closed (pre-existing + create-time integrity).
- Successful create backups are integrity-checked before being reported.
- Restore still merges live credentials and disables backup-only logins.
- Backup/restore actions are auditable on the primary operator paths.

## Conflict guarantees

| Conflict                   | Behavior                            |
| -------------------------- | ----------------------------------- |
| Repeat order cancel        | No second stock restore             |
| Duplicate item cancel      | No-op 200                           |
| Restore non-cancelled item | 409 `ITEM_STATUS_CONFLICT`          |
| KDS stale status           | Unchanged H2 CAS 409                |
| Payment/refund retry       | Unchanged mandatory Idempotency-Key |

## Tests

```sh
npm run test:h4
npm run test:backup
```

Plus regression: `test:h1`, `test:h2`, `test:h3`, `test:orders-authz`.

## Not in H4

- Durable KDS ticket outbox
- Order-status `expected_status` CAS for preparing/ready/served
- Manual stock adjust/wastage Idempotency-Key
- Drive `backup-now` Master PIN (DRV-01)
- Corrupt-but-openable live DB fail-closed at startup
- Disaster recovery product / Phase 4.16 / Frozen capabilities

## Matrix impact

Conflict handling / App restart recovery / Restore remain **🟡 Hardening** with H4 depth documented. Backup stays **🟢 Existing**.
