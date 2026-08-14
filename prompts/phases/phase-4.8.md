# Phase 4.8 — Reports Multi-Day Range Picker

## Status

COMPLETE

## Objective

Let owners/managers select a **UTC date range** on Reports for accounting CSV export (and existing range-capable report endpoints), instead of exporting a single selected day. Reuse Phase 4.4 APIs. No new money semantics.

## User Story

As an owner, I need to download one accounting CSV for last week (or up to 93 days) from Reports, using the same Gross / Net / Refunds / Payments Received columns already defined.

## Why This Phase

- Phase 4.4: `GET /api/reports/export/bills.csv?start_date&end_date` with 93-day cap — **implemented**.
- Known limitation: “Single-day UX on Reports page; multi-day range picker deferred.”
- `.ai/risks.md`: multi-day range picker not yet in UI.
- `/topProducts` already takes `start_date`/`end_date`; `/summary` exists.

## Existing System Evidence

| Area      | Evidence                                                                       |
| --------- | ------------------------------------------------------------------------------ |
| API       | `main/services/bills-csv-export.ts`, `main/routes/reports.ts`                  |
| Client    | `frontend/src/lib/accounting-csv-export.ts`                                    |
| UI        | `frontend/src/app/(dashboard)/reports/page.tsx` — `selectedDate` for both ends |
| Semantics | `docs/15-project-management/reporting-financial-semantics.md`                  |
| Docs      | `docs/04-product/phase-4.4-accounting-csv.md` §12                              |
| Tests     | `tests/phase-4.4-accounting-csv-export.test.ts`                                |

## Existing APIs / Services

```http
GET /api/reports/export/bills.csv?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Authorization: owner|manager
```

Also range-capable: `/reports/topProducts`, `/reports/summary` (inspect before wiring). Insights uses `days: 30` — **do not redesign insights** in this phase unless a trivial param already exists.

## Existing Schema

**v75.** Read-only queries on `bills` / `refunds` / `payment_details`. No migration.

## Vertical Impact

### Restaurant

Same Reports module (shared `reporting`).

### Retail

Same. No restaurant-only columns. Table stats on Reports must remain gated if already gated.

## Dependencies

- Phase 4.4 complete.
- Do not change UTC `utcDayBounds()` or the 93-day cap.

## Explicit Non-Goals

- Tenant-local day-close export (ADR)
- Tally / GST portal / accounting integrations
- Changing CSV columns or money formulas
- Full sales Z / folding Gross into day-close
- Schema, FIN-01 writes, tax engine
- Insights rewrite / BI product

## Implementation Strategy

1. Characterize 4.4 tests (cap, reversed range, auth).
2. Reports UI: `end_date` (and keep start) — default both = today (current behavior).
3. Validate client-side range ≤ 93 inclusive days; surface API 400 messages.
4. CSV download uses both dates (already supported).
5. Optionally apply the same range to `topProducts` only if it is the same selected window (no new backend).
6. Do **not** change `daily-stats` (today-only) semantics; historical days already use `/summary?date=`.
7. Docs: lift the 4.4 “single-day UX” limitation.

## TDD REQUIREMENTS

Before implementation:

- inspect `tests/phase-4.4-accounting-csv-export.test.ts` and Reports page tests
- add characterization if UI wiring is untested
- define acceptance tests (range picker, 94-day reject, default single day still works)
- implement smallest safe change
- run `npm run test:phase-4.4` plus new focused tests

## SUBAGENT PLAN

| Subagent            | Responsibility                                                                        | Allowed files                                                                     | Forbidden files                              | Expected output |
| ------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | --------------- |
| Discovery Agent     | Confirm which report GETs already take a range                                        | `main/routes/reports.ts`, Reports page (read)                                     | money services                               | Endpoint list   |
| Frontend Agent      | Range picker + CSV wiring + i18n                                                      | `frontend/src/app/(dashboard)/reports/page.tsx`, `accounting-csv-export.ts`, i18n | `main/services/bills-csv-export.ts` formulas | UI              |
| Test Agent          | UI + API regression                                                                   | `tests/phase-4.8*.ts` or extend 4.4                                               | financial semantics rewrite                  | Tests           |
| Backend Agent       | **Idle unless** a documented query param is missing for an already-described endpoint | reports route only if gap is a bug                                                | csv money math                               | none expected   |
| Isolation Agent     | reporting module gate unchanged                                                       | composition tests                                                                 | schema                                       | Isolation       |
| Documentation Agent | phase-4.8 + 4.4 limitation update + `.ai`                                             | docs, `.ai`, feature-list                                                         | production unrelated                         | Docs            |
| Reviewer Agent      | Diff                                                                                  | phase files                                                                       | STATE.md dirty tree                          | Review          |

## TRANSACTION / MONEY SAFETY

| Surface                             | Touched?                                      |
| ----------------------------------- | --------------------------------------------- |
| orders / bills / payments / refunds | **READ ONLY**                                 |
| tax / FIN-01                        | **NO writes**; display existing report fields |
| inventory / shifts / day-close      | **NO**                                        |

Do not change `reporting-financial-semantics.md` formulas. If a formula change is proposed: **STOP**.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If schema change is required: **STOP**.

## API CONTRACT

- Existing reused: `GET /api/reports/export/bills.csv` (required dates, 93-day cap, owner/manager)
- Proposed endpoints: **none**
- Auth: unchanged
- Idempotency: GET; N/A

## VERTICAL ISOLATION

Shared reporting. Restaurant table widgets stay restaurant-gated. Retail must still export CSV.

## TEST MATRIX

- Focused 4.8 (+ existing 4.4)
- Financial reporting semantics regression
- Restaurant / Retail reporting access
- `npm test` · lint · both builds

## BUILD GATES

`npm run test:phase-4.4` · focused 4.8 · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.8-reports-date-range.md`
- Update 4.4 known limitation
- feature-list (accounting export remains BUILT; note range UX)
- `.ai/context.md`, `.ai/tasks.md`, `.ai/risks.md`

## COMMIT

Phase-only. Suggested: `feat: add reports multi-day export range`

## COMPLETION CRITERIA

- implementation finished
- focused + 4.4 + regression pass
- Restaurant / Retail isolation pass
- lint + builds pass
- documentation updated
- git commit created
- no blocker
- CSV semantics unchanged
