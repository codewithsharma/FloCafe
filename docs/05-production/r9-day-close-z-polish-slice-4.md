<!-- Last updated: 2026-08-15, schema v83 -->

# R9 Slice 4 — Day-close / Z Polish

**Status:** COMPLETE
**Schema:** **v83** (unchanged — no migration)
**Suite:** `npm run test:r9.4`
**Authorization:** R9 program governance (development slice) — does **not** authorize live go-live, signed RC, or OPS-02 site PASS.

## Scope delivered

| Area    | Delivered                                                                  |
| ------- | -------------------------------------------------------------------------- |
| Confirm | Close confirmation before `POST /day-close`                                |
| Clarity | Cash Z ≠ live Gross/Net/tax copy on Operations card                        |
| History | Business-date picker; load frozen close; 404 when missing                  |
| Display | Opening float + per-shift cash rows from `summary_json`                    |
| Export  | `GET /api/reports/day-close/:date/export/z.txt` + `day_close.z_downloaded` |
| Print   | Success-only `day_close.z_printed` on thermal print                        |
| RBAC    | Owner/Manager; Cashier/Waiter/Chef 403                                     |
| Offline | Local SQLite SoR (`day_closes`)                                            |

## Financial safety

No change to Cash In / Refunds / Net / expected / variance / float math. Z remains frozen cash snapshot only (Phase 3.6D).

## Explicitly not in Slice 4

Ops finance reports (S5) · food-cost report (S6) · Gross/Net-in-Z · tax-engine · REAL cutover · ADR-014 · R10+

## OPS-02 truth

Live café validation: **DEFERRED**
Controlled Pilot: **READY WITH CONDITIONS**
Live Go-Live: **NO-GO**
