# R9 Slice 4 — Day-close / Z Polish

**Type:** Authorization / Definition Prompt
**Classification:** AUTHORIZED (R9 program governance)
**Status:** AUTHORIZED — implement via `prompts/r9/R9-S4-day-close-z-polish-implementation.md`
**Schema tip (current):** v83
**Suite:** `npm run test:r9.4` → `tests/r9-day-close-z-polish.test.ts`
**Companion:** `prompts/r9/R9-S4-day-close-z-polish-implementation.md` — ACTIVE

---

## 1. Current release truth (verified 2026-08-15)

```text
R1–R8: COMPLETE
R9 Slice 1 Expenses: COMPLETE (073be05)
R9 Slice 2 Audit-Trail: COMPLETE (532b812)
R9 Slice 3 Tax Reporting + Accountant Export: COMPLETE (548c504)
R9 Slice 4 Day-close/Z Polish: NOT AUTHORIZED (this prompt)
R9 Slice 5–6: NOT AUTHORIZED

Schema: v83
Live café validation: DEFERRED
Controlled Pilot: READY WITH CONDITIONS
Live Go-Live: NO-GO
```

Withheld evidence:

- `.ai/decisions.md` (Slice 3): “Do not start R9 Slice 4+ / Z polish / food-cost without slice auth.”
- `docs/05-production/r9-tax-export-slice-3.md`: Day-close/Z polish out of Slice 3
- `.ai/tasks.md`: remaining R9 only with explicit slice auth
- No `feat: complete R9 Slice 4` commit; no “Authorized” ADR for Slice 4

---

## 2. Why authorization is required

Day-close / Z is pilot financial SoR (M5-G + Phase 3.6D). Roadmap presence is **not** authorization. Polish that touches close UX, print/download, or audits must still **preserve** frozen cash formulas and snapshot contract.

---

## 3. Existing surfaces (inspection complete)

| Area      | Path                                                                                          | Notes                                                       |
| --------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Service   | `main/services/day-close.ts`                                                                  | `closeBusinessDay`, `getDayClose`, frozen `DayCloseSummary` |
| Close API | `POST/GET /api/reports/day-close`                                                             | Owner/Manager; audit `day.closed` on success                |
| Print     | `POST /api/printers/print-day-close`                                                          | Frozen `summary_json` only; **no print audit today**        |
| Thermal   | `main/printers/thermal.ts` `formatDayCloseZ` / `printDayCloseZ`                               | Banner `** DAY CLOSE Z **`                                  |
| UI        | `DayCloseCard` on Operations                                                                  | Today-local date; close + print/download when closed        |
| Client    | `frontend/src/lib/day-close.ts`, `day-close-z.ts`                                             | Plain-text download                                         |
| Docs      | `docs/03-architecture/phase-3.6d-day-close-z-snapshot.md`                                     | COMPLETE cash Z                                             |
| Pattern   | `.ai/patterns.md`                                                                             | Frozen cash only; do not fold live Gross/Net                |
| Tests     | `tests/day-close.test.ts`, `day-close-ui.test.ts`, `day-close-z.test.ts` (`test:day-close-z`) | Formula + UI + Z contracts                                  |

**Formulas (frozen — must not change in S4):**

- Business date = tenant `settings.timezone` (not UTC reports day)
- Per shift cash via `getShiftPaymentSummary`; day totals sum shift cash fields
- `net_cash_movement_cents` = Cash In − Cash Refunds (excludes opening float)
- Expected/counted/variance from **persisted** shift columns at close
- Duplicate business date → 409 `DAY_CLOSE_EXISTS`

---

## 4. Proposed objective (for human auth)

Polish day-close / Z **operator experience** without inventing new financial formulas or expanding the frozen snapshot contract.

---

## 5. Proposed authorized scope (exact — awaiting checkbox auth)

### In scope if authorized

1. **Close confirmation** — irreversible copy before `POST /day-close` (client UX; server 409 already blocks re-close)
2. **Cash Z clarity on Operations card** — explicit that Z is cash reconciliation, not live Gross/Net/tax (parity with `.txt`/thermal footer)
3. **Historical closed-day load** — optional business-date control to `GET /day-close/:date` + reprint/download from frozen summary (no recompute)
4. **Opening float + richer per-shift rows** on card when summary exists (fields already in summary; display-only)
5. **Print/download audit** — e.g. `day_close.z_printed` / `day_close.z_downloaded` on success only (Owner/Manager); never on 403; print remains best-effort and must not mutate close
6. **i18n / empty-state / error-copy** polish for close + Z actions
7. **Focused suite** `npm run test:r9.4` documenting accepted behavior
8. **Docs** — `docs/05-production/r9-day-close-z-polish-slice-4.md` + `.ai/*` + roadmap/matrix notes; OPS wording alignment only if copy changes

### Explicitly out of scope

- Changing Cash In / Refunds / Net / expected / variance / float math
- Folding live Gross/Net/tax/full tender into Z without a **new** frozen snapshot contract
- Changing business-day window to UTC reports day, or locking trading after close
- Recomputing closed-shift expected at day-close instead of persisted columns
- Schema bump / `day_closes` redesign
- Ops finance reports v1 (Slice 5)
- Food-cost report v1 (Slice 6)
- Tax-engine / filing / REAL cutover / ADR-014 / R10+

---

## 6. Draft acceptance criteria (formula-preserving)

1. Schema tip remains **v83**
2. `buildDayCloseSummary` / shift payment aggregation byte-stable for cash math (no intentional formula edits)
3. Z print/download still read frozen `summary_json` only
4. Owner/Manager RBAC preserved on close + Z print/download; Cashier/Waiter/Chef 403
5. Close still audits `day.closed` once on success
6. If print/download audits authorized: success-only; no audit on deny
7. UI shows cash-vs-sales clarity; confirmation before close
8. Historical date (if authorized) never invents a close — 404 when missing
9. `npm run test:r9.4` green; `npm run test:day-close-z` green; `npm run build` PASS
10. Live go-live remains **NO-GO**; no live café PASS claim

---

## 7. Draft test plan

```bash
npm run test:r9.4
npm run test:day-close-z
npm run build
```

Regression neighbors (after auth + implement): existing `tests/day-close.test.ts` (via security pack or direct), R9 `test:r9` / `test:r9.2` / `test:r9.3` as time permits.

Scenarios: RBAC; close confirmation contract (UI source); cash clarity copy; historical GET; print/download audit success-only; formula regression pins (net cash / variance fields unchanged); schema tip v83.

---

## 8. Migration decision (proposal)

**No schema change.** Expect tip **v83** unless a later auth explicitly requires otherwise.

---

## 9. Financial safety statement (required at auth)

S4 authorization, if granted, means:

> No tender, refund, tax, expense, day-close accounting, or Z accounting formula changes. Presentation, confirmation, audit-of-print, and frozen-summary display only.

---

## 10. Authorization checklist (human / project owner)

Mark **all** before any agent may implement:

- [ ] Explicit written authorization in `.ai/decisions.md` titled **R9 Slice 4 … (Authorized)** (or equivalent project instruction)
- [ ] Exact acceptance criteria accepted (section 6)
- [ ] Migration decision accepted (**no** bump)
- [ ] Financial safety statement accepted (section 9)
- [ ] Suite name `test:r9.4` accepted
- [ ] Out-of-scope list confirmed (section 5)
- [ ] Scope items 1–8 accepted or explicitly trimmed in the Authorized ADR

---

## 11. After authorization

1. Flip companion implementation prompt status from **AWAITING AUTHORIZATION** → **ACTIVE**
2. Set Authorized ADR in `.ai/decisions.md`
3. RED → GREEN via `tests/r9-day-close-z-polish.test.ts`
4. Implement minimum scope only
5. Test + build + scope audit
6. Commit as **Dev Raj Sharma**; do not push
7. Generate `prompts/r9/R9-S5-operations-finance-reports-authorization.md` — do **not** implement S5

---

## 12. Immediate instruction

**STOP.** Do not write production code for Slice 4.

S4 implementation is blocked because explicit authorization is still missing.

Next human action: approve/reject with exact scope (trim section 5 if needed), then add an **Authorized** decision record.
