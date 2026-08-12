# Backup and Restore

## CURRENT STATE (verified M1)

### Methods

| Method | Entry point | Auth |
|--------|-------------|------|
| Settings UI | Database Tools → Backup / Restore | Master PIN |
| API | `POST /api/db/backup`, `GET /api/db/download` | Owner |
| API import | `POST /api/db/import` | Owner + master PIN |
| IPC (desktop) | `electronAPI.backupDatabase`, `restoreBackup` | Master PIN |
| Google Drive | Scheduled/manual via `google-drive.ts` | Owner settings |
| Pre-migration | Automatic before schema changes | Internal |

### Backup location

| Context | Path |
|---------|------|
| Packaged app | `{userData}/backups/` |
| Dev server | Adjacent to `flo.db` or userData depending on launch mode |

Backup filenames: `flo-backup-{ISO-timestamp}-{hex}.db`

### Backup format

- Single SQLite file (`.db`)
- Written with `journal_mode = DELETE` (self-contained, no WAL sidecars)
- Contains `_flo_meta` table with `schema_version` stamp
- Created via `better-sqlite3` `.backup()` API (`main/db.ts` `createBackupUnlocked`)

### Restore mechanism

1. Validate backup file (not symlink, not live DB path)
2. Compare backup schema version vs live DB
3. **Same version:** direct file replace with maintenance lock
4. **Different version:** data-only restore path (migrations re-applied)
5. Run `integrity_check` and `foreign_key_check` after restore

Functions: `restoreBackup()`, `withDatabaseMaintenanceLock()` in `main/db.ts`

### Validation after restore

- `PRAGMA integrity_check` → `ok`
- `PRAGMA foreign_key_check` → clean
- Application restart or `initDatabase()` reopen
- Settings and user credentials preserved per restore path

### Failure modes

| Failure | Behavior |
|---------|----------|
| Backup target is live DB | Error thrown before write |
| Backup target is symlink | Error thrown |
| Restore interrupted | Recovery snapshot in backups dir (`flo-restore-recovery-*.db`) |
| Schema mismatch | Data-only restore; migrations run on next start |
| Maintenance lock held | Operations queue or reject concurrent backup/restore |

### M1 verification procedure

Automated (run in CI via `npm test`):

```sh
npm run test:backup        # Unit + integration backup/restore
npm run test:upgrade-path  # Migration safety with pre-migration backup
npm run test:schema-health # Fresh DB integrity
```

Manual checklist (operator/dev):

1. Start app with test data (products, orders, settings)
2. Settings → Database Tools → Create backup
3. Note backup file path and size
4. Modify data (add product)
5. Restore from backup
6. Verify modified data reverted
7. Restart app — verify login and orders intact

### Tests

- `tests/backup-restore.test.ts`
- `tests/backup-restore-production.test.ts`

## TARGET STATE

- Document backup schedule recommendation (daily minimum)
- Verify backup integrity checksum on create
