# Database Architecture

## CURRENT STATE

| Aspect | Value |
|--------|-------|
| Engine | SQLite 3 |
| Driver | better-sqlite3 ^13 |
| File | `{userData}/flo.db` |
| Journal | WAL |
| FK enforcement | ON (after migrations) |
| Schema version | 66 (`PRAGMA user_version`) |
| Tables | 40 live |

### Migration strategy
- Inline `MIGRATIONS[]` in `main/db.ts`
- Append-only — never edit existing migrations
- Auto-backup before pending batch
- `buildIdealSchemaDb()` for health comparison

### Backup format
Timestamped `.db` files with `_flo_meta` schema version stamp.

## TARGET STATE
- Extract migrations to `main/migrations/*.ts`
- Add `stock_movements`, `shifts`, `audit_logs` tables (PLANNED)
- Consider read replicas only if multi-terminal writes needed (NOT current scope)
