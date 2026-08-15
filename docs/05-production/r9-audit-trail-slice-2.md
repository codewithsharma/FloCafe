<!-- Last updated: 2026-08-15, schema v83 -->

# R9 Slice 2 — Financial Audit-Trail Hardening

**Status:** COMPLETE  
**Schema:** **v83** (unchanged — no migration)  
**Suite:** `npm run test:r9.2`  
**Authorization:** Engineering/Product development authorization for this slice only. Does **not** authorize live go-live, signed RC claims, or OPS-02 site PASS.

## Scope delivered

| Area       | Delivered                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- |
| API        | Existing `GET /api/audit-logs` + `until` filter; `GET /api/audit-logs/export.csv`            |
| Audit      | Successful export emits `audit.exported` (`entity_type=audit_log`, format/row_count/filters) |
| RBAC       | Owner/Manager only; Cashier/Waiter/Chef 403 on list + export                                 |
| UI         | `/audit` Owner/Manager viewer + filters + CSV export                                         |
| Offline    | Local SQLite SoR; no cloud dependency; persists across restart                               |
| Money path | Unchanged — read/export only                                                                 |

## Explicitly not in Slice 2

Tax export depth · day-close/Z polish · ops finance reports · food-cost report · authz-denial flood · Master PIN / sensitive-action controls · retention purge · schema immutability redesign · ADR-014 · REAL cutover · Retail · Phase 4.16 · R9 Slice 3+.

## OPS-02 truth

Live café validation: **DEFERRED**  
Live Go-Live: **NO-GO**  
Signing/notarization: **BLOCKED**  
Controlled Pilot: **READY WITH CONDITIONS**
