# Rollback Procedure

## CURRENT STATE (verified M1)

This document describes **verified rollback capabilities** in FloCafe v3.0.5. Do not assume capabilities not listed here.

See also: [`11-devops/rollback.md`](../11-devops/rollback.md) (release-focused).

---

## 1. Revert a code change (development)

```sh
# Identify the commit to revert to
git log --oneline -5

# Revert uncommitted work
git checkout -- <file>
git restore .

# Revert to previous commit (keep history)
git revert HEAD

# Hard reset (destructive — only on local branches)
git reset --hard HEAD~1
```

After reverting code:

```sh
npm ci
npm run build
npm test
```

**No database change** occurs from code revert alone.

---

## 2. Restore the database

### From Settings UI

1. Settings → Database Tools → Restore
2. Enter master PIN
3. Select backup file (`.db`)
4. Confirm restore
5. Restart application when prompted

### From API (owner + master PIN)

```http
POST /api/db/import
```

### From IPC (desktop)

```javascript
electronAPI.restoreBackup(masterPin, backupPath)
```

### Pre-migration auto-backups

Before every schema migration, an automatic backup is created:

```
{userData}/backups/flo-backup-{timestamp}-pre-v{from}-to-v{to}.db
```

If a migration fails mid-flight, restore this backup before restarting.

---

## 3. Recover from failed migrations

**Forward-only migrations** — there is no `down()` migration.

Recovery steps:

1. **Stop the application** (do not retry migration repeatedly)
2. Locate pre-migration backup in `{userData}/backups/`
3. Restore backup via Settings → Database Tools → Restore
4. Install the **previous app version** that matches the backup schema version
5. Start app and verify `GET /api/health` and login work
6. Run `npm run test:upgrade-path` before attempting upgrade again

Verify schema version:

```sql
PRAGMA user_version;
-- or
SELECT value FROM _flo_meta WHERE key = 'schema_version';
```

---

## 4. Return to previous release

### Desktop (packaged)

1. Download previous installer from [GitHub Releases](https://github.com/FreeOpenSourcePOS/FloCafe/releases)
2. Install over current version (or uninstall first on Windows)
3. **If new version ran migrations:** restore pre-upgrade database backup first
4. Launch and verify

### electron-updater

- Auto-update downloads forward only
- **Downgrade via auto-updater is NOT supported**
- Manual install of previous release required

---

## 5. Verify system integrity after rollback

```sh
# Automated checks
npm run test:schema-health
npm run test:smoke
npm run audit:db
```

Manual checks:

| Check | Expected |
|-------|----------|
| App starts | No migration errors in log |
| Login | Owner/staff credentials work |
| Orders | Recent orders visible (if backup timing allows) |
| Settings | Business name, tax config intact |
| Printers | Printer list preserved |

SQLite integrity (if DB accessible):

```sql
PRAGMA integrity_check;      -- must return 'ok'
PRAGMA foreign_key_check;    -- must return no rows
PRAGMA user_version;         -- must match app expectation
```

---

## Limitations (CURRENT)

| Capability | Status |
|------------|--------|
| Schema downgrade | **NOT SUPPORTED** — restore backup + older app |
| Partial table rollback | **NOT SUPPORTED** — full DB restore only |
| Point-in-time recovery | **NOT SUPPORTED** — only explicit backups |
| Cloud config rollback | Tax packs only (`POST /api/tax-packs/:id/rollback`) |

---

## M1 rollback safety summary

| Change type | Rollback method |
|-------------|---------------|
| M1 code (coverage, CI, docs) | `git revert` — no DB impact |
| Failed future migration (M2+) | Restore pre-migration backup |
| Bad release | Install previous release + restore backup if needed |
