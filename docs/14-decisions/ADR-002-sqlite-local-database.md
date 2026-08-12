# ADR-002: SQLite Local Database

## Status
Accepted (CURRENT STATE)

## Context
POS must operate without network; data owned by operator.

## Decision
SQLite via better-sqlite3 in WAL mode, single file per installation.

## Consequences
- (+) Zero server dependency, fast local queries
- (+) Simple backup (file copy)
- (-) Single writer limits concurrent POS terminals
- (-) No built-in multi-location sync

## Evidence
`main/db.ts`, README.md
