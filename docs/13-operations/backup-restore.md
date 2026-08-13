# Backup and Restore

**Pilot operators:** start with [`pilot-runbook.md`](./pilot-runbook.md). This page is the mechanics + policy layers reference.

## CURRENT STATE (verified)

### Methods

| Method | Entry point | Auth |
|--------|-------------|------|
| Settings UI | Database Tools → Backup / Restore | Master PIN |
| Recovery UI | `/recovery` when RECOVERY_REQUIRED | Master PIN (IPC restore) |
| API | `POST /api/db/backup`, `GET /api/db/download` | Owner |
| API import | `POST /api/db/import` | Owner + master PIN |
| IPC (desktop) | `electronAPI.backupDatabase`, `restoreBackup` | Master PIN |
| Google Drive | Scheduled/manual via `google-drive.ts` | Owner settings / owner JWT for backup-now |
| Pre-migration | Automatic before schema changes | Internal |

### Backup location

| Context | Path |
|---------|------|
| Packaged app | `{userData}/backups/` |
| Dev server | Adjacent to `flo.db` or userData depending on launch mode |

Backup filenames: `flo-backup-{ISO-timestamp}-{hex}.db`

### Backup format (product behavior)

- Single SQLite file (`.db`)
- Written with `journal_mode = DELETE` (self-contained, no WAL sidecars)
- Contains `_flo_meta` table with `schema_version` stamp
- Created via `better-sqlite3` `.backup()` API (`main/db.ts` `createBackupUnlocked`)
- **Does not** include `jwt-secret.enc`; JWT forge key is not in SQLite/Drive DB backups

### Sensitivity

Backup files contain **sensitive business and customer data**. Restrict access; do not post to shared chat or guest machines. See pilot runbook.

### Restore mechanism

1. Validate backup file (not symlink, not live DB path)
2. Compare backup schema version vs live DB (or supported schema when live DB missing)
3. **Same version:** direct file replace with maintenance lock
4. **Different version:** data-only restore path when a live DB exists; missing live DB cannot use data-only restore — use same-schema backup or matching app version
5. Run `integrity_check` and `foreign_key_check` after restore
6. Successful recovery restore ensures installation marker / clears recovery latch (REC-01)

Functions: `restoreBackup()`, `withDatabaseMaintenanceLock()` in `main/db.ts`

### Validation after restore

- `PRAGMA integrity_check` → `ok`
- `PRAGMA foreign_key_check` → clean
- Application reopen / relaunch as prompted
- Complete **financial + device checklist** in `pilot-runbook.md` (not only PRAGMA)

### Failure modes

| Failure | Behavior |
|---------|----------|
| Backup target is live DB | Error thrown before write |
| Backup target is symlink | Error thrown |
| Corrupt / non-SQLite backup | `{ success: false }`; live DB untouched |
| Restore interrupted | Recovery snapshot in backups dir (`flo-restore-recovery-*.db`) |
| Schema mismatch with live DB | Data-only restore; migrations run on next start |
| Schema mismatch with **no** live DB | Reject data-only; need same-schema backup |
| Maintenance lock held | Operations queue or reject concurrent backup/restore |

### Policy layers (do not invent pilot numbers)

| Layer | Content |
|-------|---------|
| **Product behavior** | Local backups on demand; optional Drive `daily` \| `weekly`; Drive remote retention default **10** in code (`DEFAULT_RETENTION`) |
| **Recommended operator practice** | Verify a local backup at least once per service day; treat files as PII; escrow Master PIN offline |
| **Approved pilot policy — frequency** | **POLICY VALUE PENDING APPROVAL** |
| **Approved pilot policy — local retention** | **POLICY VALUE PENDING APPROVAL** |
| **Approved pilot policy — Drive retention** | **POLICY VALUE PENDING APPROVAL** |

### Incomplete machine recovery reminder

| Included in `.db` backup | Not included |
|--------------------------|--------------|
| Business SQLite data | `jwt-secret.enc` |
| | Master PIN (must be escrowed offline) |

Same-machine: keep `.enc`. New-machine: expect JWT `recovery_required`; recover with owner + Master PIN (`POST /api/auth/jwt-secret/recover`).

### M1 / engineering verification

Automated (CI):

```sh
npm run test:backup        # Unit + production + continuity + REC-01
npm run test:upgrade-path  # Migration safety with pre-migration backup
npm run test:schema-health # Fresh DB integrity
```

**Café pilot drill:** use [`dr-drill-worksheet.md`](./dr-drill-worksheet.md) (timed RTO/RPO), not only CI.

Manual engineering checklist:

1. Start app with test data
2. Settings → Database Tools → Create backup
3. Note backup file path and size
4. Modify data
5. Restore from backup
6. Verify modified data reverted
7. Restart — login and orders intact

### Tests

- `tests/backup-restore.test.ts`
- `tests/backup-restore-production.test.ts`
- `tests/backup-restore-continuity.test.ts`
- `tests/rec-01-recovery.test.ts`

## TARGET STATE

- Approve numeric pilot frequency/retention (replace PENDING APPROVAL)
- Verify backup integrity checksum on create
- Optional backup `installation_id` metadata (product residual)
