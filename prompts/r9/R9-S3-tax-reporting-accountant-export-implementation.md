# R9 Slice 3 — Tax Reporting Depth + Accountant Export

**Type:** Implementation Prompt
**Classification:** IMPLEMENTABLE (development slice authorization)
**Status:** EXECUTE / VERIFY / COMMIT
**Schema tip:** v83 (no migration)
**Suite:** `npm run test:r9.3`
**Authorization:** Development product-slice only — does **not** authorize live go-live, signed RC, or OPS-02 site PASS.

---

## 1. Current release truth (verify before work)

```text
R1–R8: COMPLETE
R9 Slice 1 Expenses: COMPLETE (073be05)
R9 Slice 2 Audit-Trail: COMPLETE (532b812) — HEAD before this slice commit
R9 Slice 3 Tax Reporting: AUTHORIZED / NEXT (this prompt)
R9 Slice 4+: NOT AUTHORIZED

Schema: v83
Live café validation: DEFERRED
Controlled Pilot: READY WITH CONDITIONS
Live Go-Live: NO-GO
```

Evidence: `.ai/decisions.md`, `.ai/tasks.md`, `docs/05-production/r9-audit-trail-slice-2.md` (withholds Slice 3 until auth), Slice 3 ADR in `.ai/decisions.md`.

---

## 2. Objective

Deepen existing tax-component reporting with accountant-ready CSV export and Reports UI, without changing tax-engine semantics, filing, timezone, or schema.

---

## 3. Repository inspection requirements

Before coding, inspect:

- `main/services/tax-components.ts` (`aggregateTaxComponents`)
- Existing `GET /api/reports/tax-components` in `main/routes/reports.ts`
- Phase 4.4 CSV pattern (`main/lib/csv.ts`, bills CSV export + audit)
- R9 Slice 2 export/audit pattern (`audit.exported`)
- Reports UI `frontend/src/app/(dashboard)/reports/page.tsx`
- Schema tip in `main/database/migrations.ts` (must remain **v83**)

---

## 4. Exact scope

| Area         | In scope                                                                       |
| ------------ | ------------------------------------------------------------------------------ |
| Shared query | `queryTaxComponentsReport` wrapping existing aggregator                        |
| JSON         | Keep `GET /api/reports/tax-components` on shared query                         |
| CSV          | `GET /api/reports/export/tax-components.csv`                                   |
| Audit        | `tax.exported` on successful CSV only (`entity_type=tax_report`)               |
| UI           | `/reports` tax-components panel + export button                                |
| RBAC         | Owner/Manager only; Cashier/Waiter/Chef 403                                    |
| i18n         | en/es/pt keys for tax components panel                                         |
| Tests        | `tests/r9-tax-export.test.ts` + `npm run test:r9.3`                            |
| Docs         | `docs/05-production/r9-tax-export-slice-3.md` + `.ai/*` + roadmap/matrix notes |

---

## 5. Backend / API

- Shared service: `main/services/tax-components-report.ts`
- Reuse `aggregateTaxComponents` — do **not** recalculate tax
- UTC half-open window via existing `utcDayBounds` / `reportDate` helpers
- CSV columns: `start_date,end_date,bill_count,report_tax_amount,component_title,rate,tax_amount`
- JSON and CSV for the same date range must match

---

## 6. Database

- **No migration.** Schema tip remains **v83**.
- Read-only over `bills` / `orders` / `order_items` + existing tax snapshots.

---

## 7. UI

- Reports page: tax-components table for selected date range
- Export CSV control (Owner/Manager UX; server RBAC authoritative)
- Client helper: `frontend/src/lib/tax-components-report.ts`

---

## 8. RBAC

- `requireRole('owner', 'manager')` on JSON + CSV
- Denied roles: 403, **no** `tax.exported` audit

---

## 9. Audit

- Success CSV only: `action=tax.exported`, `entity_type=tax_report`, metadata includes format/dates/counts
- Never audit on 403 / validation failure

---

## 10. Offline

- Local SQLite SoR only
- No cloud filing, GSTR, IRN, e-invoice

---

## 11. Acceptance criteria

1. Schema tip still **v83**
2. Owner/Manager JSON + CSV 200; Cashier/Waiter/Chef 403
3. CSV body matches JSON components for same UTC window
4. `tax.exported` written once per successful CSV
5. No payment / day-close / tax-engine side effects
6. No GSTR/filing routes
7. Reports UI shows components + export
8. Focused suite green: `npm run test:r9.3`
9. `npm run build` passes

---

## 12. Test plan

```bash
npm run test:r9.3
npm run test:r9.2   # regression neighbor
npm run build
```

Cover: RBAC, JSON↔CSV parity, audit success-only, CSV escaping, restart persistence of SoR, no payment mutation.

---

## 13. Regression suites

- `npm run test:r9.2` (audit trail)
- Prefer also `npm run test:r9` if time permits
- Do not weaken money/tax-engine suites

---

## 14. Migration decision

**No schema change.** Reject any PRAGMA user_version bump.

---

## 15. Financial safety

- Do not change tax calculation, tender, refund, day-close, or Z formulas
- Do not change UTC reporting boundary to tenant TZ in this slice
- Integer/display money must follow existing report conventions (aggregator amounts)

---

## 16. Explicit out-of-scope

Day-close/Z polish · ops finance reports v1 · food-cost report v1 · GSTR/IRN/e-invoice · tax-engine rewrite · UTC→tenant TZ · REAL cutover · ADR-014 · R9 Slice 4+ · R10+

---

## 17. Dependencies

- R9 Slice 1 + 2 complete on branch
- Existing `aggregateTaxComponents` + Reports module mount

---

## 18. Git requirements

- One clean commit for this slice only
- Author: **Dev Raj Sharma**
- No Co-authored-by / AI attribution
- Do **not** push
- Exclude unrelated WIP (staff, KDS, tax-packs TS harden, audit-v2/v3, orders churn, etc.)

---

## 19. Final report requirements

Report: phase/slice status, tests, build, schema, commit hash, author, push=no, next prompt path (R9-S4 authorization).
