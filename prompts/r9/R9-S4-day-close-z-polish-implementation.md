# R9 Slice 4 — Day-close / Z Polish — Implementation Prompt

**Type:** Implementation Prompt
**Classification:** COMPLETE
**Status:** COMPLETE — committed with `npm run test:r9.4`
**Schema tip:** v83 (no migration)
**Suite:** `npm run test:r9.4` → `tests/r9-day-close-z-polish.test.ts`
**Auth source of truth:** `prompts/r9/R9-S4-day-close-z-polish-authorization.md` + Authorized/Implemented ADR

---

## GATE

Slice 4 implementation is complete. Do not re-execute unless a regression fix is authorized.

---

## 1. Current release truth (pre-S4)

```text
R1–R8: COMPLETE
R9 Slice 1–3: COMPLETE
R9 Slice 4: AUTHORIZED only when decision record says so
R9 Slice 5–6: NOT AUTHORIZED

Schema: v83
Live café validation: DEFERRED
Controlled Pilot: READY WITH CONDITIONS
Live Go-Live: NO-GO
```

---

## 2. Objective

Polish day-close / Z operator UX and ops audit trail while **preserving** existing cash day-close formulas and frozen `summary_json` Z contract (Phase 3.6D).

---

## 3. Repository inspection (required before coding)

- `main/services/day-close.ts`
- `main/routes/reports.ts` day-close routes
- `main/routes/printers.ts` `print-day-close`
- `main/printers/thermal.ts` day-close Z formatters
- `frontend/src/components/dashboard/DayCloseCard.tsx`
- `frontend/src/lib/day-close.ts`, `day-close-z.ts`
- `docs/03-architecture/phase-3.6d-day-close-z-snapshot.md`
- `.ai/patterns.md` day-close Z rule
- `tests/day-close.test.ts`, `day-close-z.test.ts`, `day-close-ui.test.ts`
- Authorized ADR scope (may trim items below)

---

## 4. Exact scope (default package — ADR may trim)

| #   | Deliverable                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------ |
| 1   | Close confirmation UX before `POST /api/reports/day-close`                                             |
| 2   | Operations card copy: cash Z ≠ live Gross/Net/tax                                                      |
| 3   | Optional business-date control to load historical frozen close + reprint/download                      |
| 4   | Display opening float + per-shift cash rows already present in summary                                 |
| 5   | Success-only audits for Z print and/or download (e.g. `day_close.z_printed`, `day_close.z_downloaded`) |
| 6   | i18n en/es/pt for new strings                                                                          |
| 7   | `tests/r9-day-close-z-polish.test.ts` + `package.json` `test:r9.4`                                     |
| 8   | Slice doc `docs/05-production/r9-day-close-z-polish-slice-4.md` + `.ai` + roadmap/matrix/feature-list  |

---

## 5. Backend / API

- **No formula changes** in `closeBusinessDay` / summary builders
- Keep `POST /api/reports/day-close` and `GET /api/reports/day-close/:date` contracts
- `POST /api/printers/print-day-close` remains frozen-summary-only; add success audit if in authorized scope
- Download may stay client-side; if download audit is authorized, prefer a thin authenticated endpoint **or** document client-only limitation in ADR (do not invent cloud sync)

---

## 6. Database

- **No migration.** Schema tip remains **v83**.

---

## 7. UI

- `DayCloseCard` (+ Operations page wiring if date control needed)
- Confirmation before close
- Cash-vs-sales clarity
- Historical date load must not invent closes (show empty/404 state)
- Print/download remain best-effort; failures must not mutate day-close

---

## 8. RBAC

- Owner/Manager only for close, GET, print, download paths
- Cashier/Waiter/Chef 403; no success audits on deny

---

## 9. Audit

- Preserve `day.closed` on successful close
- Add Z print/download success audits only if authorized
- Never audit on 403 / validation failure

---

## 10. Offline

- Local SQLite SoR (`day_closes.summary_json`)
- No cloud filing / remote Z dependency

---

## 11. Acceptance criteria

1. Schema tip **v83**
2. Cash math / summary fields unchanged for identical fixtures vs pre-S4 baselines in tests
3. Z outputs still frozen-summary-only (no Gross/Net/tax injection)
4. RBAC Owner/Manager; others 403
5. Confirmation + clarity UX present
6. Authorized audits success-only
7. `npm run test:r9.4` PASS
8. `npm run test:day-close-z` PASS
9. `npm run build` PASS
10. Docs updated; live go-live remains NO-GO

---

## 12. Test plan

```bash
# RED first
npm run test:r9.4

# GREEN + neighbors
npm run test:day-close-z
npm run build
```

Include: schema tip; RBAC; formula pins; UI source contracts; audit success-only; historical 404; no payment schema side effects.

---

## 13. Regression suites

- `npm run test:day-close-z`
- Prefer `tests/day-close.test.ts` (or existing npm alias that runs it)
- R9 neighbors `test:r9` / `test:r9.2` / `test:r9.3` when practical

---

## 14. Migration decision

No schema bump.

---

## 15. Financial safety

Do not change:

- payment / refund / tender totals
- tax calculations or snapshots
- expense calculations
- day-close accounting truth
- Z accounting truth
- money representation
- tenant TZ vs UTC reports boundary semantics

---

## 16. Explicit exclusions

Slice 5 ops finance reports · Slice 6 food-cost · filing/GSTR · tax-engine rewrite · REAL cutover · ADR-014 · R10+ · unrelated WIP · staff/KDS/orders churn

---

## 17. Dependencies

- Phase 3.6D complete
- R9 Slice 1–3 complete
- Explicit Slice 4 Authorized ADR

---

## 18. Git requirements

- One clean Slice 4 commit (plus optional docs-only prompt commits)
- Author: **Dev Raj Sharma**
- No AI attribution / Co-authored-by
- Do **not** push
- Exclude unrelated dirty tree

---

## 19. Final report requirements

Report phase/slice/status/tests/build/schema/commit/author/push=no; then generate S5 **authorization** prompt only.

---

## Immediate instruction (pre-auth)

**DO NOT IMPLEMENT from this file until authorization exists.**
