# Migrations

## CURRENT STATE

### Location
All migrations inline in `main/db.ts` → `export const MIGRATIONS`.

### Version
Current: **66** (`seed_bill_template_settings`)

### Rules (from code comments)
1. Append new entries only — never edit existing
2. Each runs once in a transaction
3. Sets `PRAGMA user_version` after each
4. Auto-backup before pending batch

### Fresh install
v1 `initial_schema` calls `createSchema()` (**23 base tables**) + `seedInstallDefaults()`.

### Subsequent schema growth
**17 additional live tables** are created by later migrations and helpers (e.g. `createCloudSyncSchema()`, `createWhatsAppSchema()`). Total live tables after all migrations: **40**.

### Upgrade testing
- `tests/upgrade-path.test.ts` — from v1.5.0 fixture
- `tests/migration-v56-to-v57.test.ts` — parent version fixture
- `npm run audit:db` — integrity diagnostic

### Health check
`buildIdealSchemaDb()` builds expected schema for comparison (`schema-health.ts`).

## TARGET STATE
- Extract to `main/migrations/NNN-name.ts`
- Keep same versioning scheme
- Document each migration in CHANGELOG
