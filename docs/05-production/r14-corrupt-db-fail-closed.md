<!-- Last updated: 2026-08-15, schema tip unchanged (v85; R13 may bump in parallel) -->

# R14 — Corrupt-DB Fail-Closed (Reliability thin deepen)

**Status:** COMPLETE (engineering slice)  
**Schema:** **no bump** — reuses `PRAGMA integrity_check` + install-state latch  
**Suite:** `npm run test:r14`  
**Authorization:** Development deepen only — does **not** authorize live go-live, signed RC, OPS-02 site PASS, or a live DR drill PASS.

## Problem

REC-01 already fail-closes **missing** / **empty** operational DBs. A **corrupt-but-openable** SQLite file could still open, migrate, and serve money APIs while `integrity_check` only logged warnings (`dbHealthError`). That is dirty service.

## Delivered

| Area                 | Behavior                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Integrity detect     | `checkSqliteIntegrity()` in `main/services/schema-health.ts` (`PRAGMA integrity_check`)      |
| Schema-health report | `HealthCheckReport.integrity` surfaces ok/details                                            |
| Startup latch        | `runStartupIntegrityCheck` → `setRecoveryRequired('corrupt_database')`                       |
| Refuse dirty service | Existing `recoveryApiProtectionMiddleware` → money/business **HTTP 503** `recovery_required` |
| Health               | `/api/health` → **503** `status: recovery_required`, `reason: corrupt_database`              |
| Electron             | Existing `isRecoveryRequired()` after `initDatabase()` → recovery UI path                    |
| Restore              | Good backup `restoreBackup` still clears latch (H4 / REC-01 path unchanged)                  |

**Latch used:** install-state in-memory recovery override — `setRecoveryRequired('corrupt_database')` / `isRecoveryRequired()` (same latch as REC-01 `missing_database` / `empty_database`).

## Explicitly not in this thin slice

- Unopenable `new Database()` throw → recovery UI (P1-06 residual)
- Disaster recovery product depth / Drive PIN DRV-01 / observability rebuild
- Schema migration / `migrations.ts` bump
- Live café DR drill sign-off

## Tests

```sh
npm run test:r14
```

Covers: corrupt-openable fixture → latch → health/money 503 → schema-health integrity → good restore ACTIVE.

## OPS-02 truth

Live DR drill: **NOT CLAIMED**  
Controlled Pilot: **READY WITH CONDITIONS** (engineering)  
Live Go-Live: **NO-GO**
