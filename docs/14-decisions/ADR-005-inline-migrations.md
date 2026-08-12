# ADR-005: Inline Database Migrations

## Status
Accepted (CURRENT); refactor planned (TD-01)

## Context
Schema changes must be versioned, transactional, and safe for upgrades.

## Decision
Migrations as `MIGRATIONS[]` array in `main/db.ts` with `PRAGMA user_version`.

## Consequences
- (+) Single source of truth, transactional, tested upgrade path
- (-) db.ts is very large (~4500 lines)
- (-) No separate SQL migration files

## Target
Extract to `main/migrations/` without changing behavior.

## Evidence
`main/db.ts`, `tests/upgrade-path.test.ts`
