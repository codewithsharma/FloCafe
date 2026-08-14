# Phase 3.6B — Reports Gross / Refunds / Net Sales UI

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**  
**Selected after discovery** — see Candidate Table below.

---

## Objective

Surface the existing P0.2 financial reporting fields (`grossSales`, `refunds`, `netSales`) on the Reports and Home dashboards so owners/managers can see refund-aware day sales without relying on the legacy single “Sales” number.

## User Story

> As an owner/manager, I need Gross Sales, Refunds, and Net Sales on Reports and Home so that I understand the day’s money after refunds without opening the API or day-close JSON.

## Current State

- Backend `GET /api/reports/daily-stats` and `GET /api/reports/summary` already return `grossSales`, `refunds`, `netSales` (`daySalesSemantics` in `main/routes/reports.ts`).
- Contract covered by `tests/financial-reporting-semantics.test.ts`.
- Frontend Reports and Home still bind only legacy `sales` / `bills.collected`.

## Gap

UI does not display Gross / Refunds / Net even though the API already provides them.

## Scope

- Reports page: metric tiles bind Gross / Refunds / Net (today via daily-stats; historical via summary.bills).
- Home (dashboard) page: replace single “Today’s Sales” with Gross / Refunds / Net from daily-stats.
- i18n en/es/pt labels.
- Focused UI contract tests.
- Docs: this file + feature-list note + `.ai/` memory.

## Non-goals

P1.6 · tax cleanup · REAL→cents · FIN-01 status rewrite · CSV export · `/reports/sales` wiring · cash drawer · refund restock · schema · transaction ownership · service extraction · Retail redesign · changing report SQL/semantics

## Files Expected

- `frontend/src/app/(dashboard)/reports/page.tsx`
- `frontend/src/app/(dashboard)/dashboard/page.tsx`
- `frontend/src/lib/i18n/{en,es,pt}.json`
- `tests/flo-reports.test.ts`, `tests/flo-home.test.ts`, optional `tests/reports-gross-refunds-net-ui.test.ts`
- `docs/03-architecture/phase-3.6b-reports-gross-refunds-net-ui.md`
- `.ai/*` minimal updates

## API

**Reused existing API** — no new endpoints. Prefer `grossSales` / `refunds` / `netSales` over legacy `sales` / `collected` for primary sales tiles.

## Schema

**NO CHANGE** (v75).

## Money Path

**UNCHANGED.** Display-only binding of existing fields. Order/tax/discount/payment/refund/FIN-01/day-close/inventory calculation untouched.

## Vertical Behavior

- Restaurant: Reports + Home show Gross/Refunds/Net.
- Retail: same shared reports module; no Restaurant-only leak.

## Acceptance Criteria

1. Given daily-stats with gross/refunds/net, When Home loads, Then three tiles show those values (not only legacy sales).
2. Given summary for a selected date with bills.grossSales/refunds/netSales, When Reports loads that date, Then three tiles show those values.
3. Given backend report SQL unchanged, When focused financial-reporting tests run, Then they still PASS.
4. Restaurant isolation PASS; Retail isolation PASS.
5. No schema migration; no money-path code changes in services.

## Test Plan

- Focused UI contracts (flo-reports, flo-home, phase 3.6b)
- `npm run test:financial-reporting`
- Restaurant / Retail isolation
- `npm test` · lint · backend build · frontend build

---

## Candidate Table (discovery)

| Candidate                     | User Value                                 | Existing Support                                   | Complexity | Money Risk     | Schema Risk | Vertical Risk | Decision                          |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------- | ---------- | -------------- | ----------- | ------------- | --------------------------------- |
| Reports Gross/Refunds/Net UI  | Owner sees refund-aware day sales          | API fields + financial-reporting tests; UI missing | S          | None (display) | None        | None          | **SAFE NOW — SELECTED**           |
| Manual stock adjust UI        | Manager adjusts stock without product form | `POST /products/:id/stock`                         | S          | Low            | None        | None          | SAFE NOW (deferred to queue)      |
| Day-close Z print/download    | Print closed day snapshot                  | day-close API + UI                                 | S          | None           | None        | None          | SAFE NOW (queue)                  |
| Cash drawer kick              | Open till on pay                           | Printer stack only                                 | M          | None           | None        | None          | SAFE NOW (queue; more greenfield) |
| WebUSB refund print parity    | Client-mode refund slips                   | 3.6A server path                                   | M          | None           | None        | None          | SAFE NOW (queue; 3.6A non-goal)   |
| Menu 86 quick toggle          | Mark item unavailable mid-service          | `is_active`                                        | S          | None           | None        | None          | SAFE NOW (queue)                  |
| Soft-reactivate customer UX   | Reuse inactive phone                       | soft-reactivate API                                | S          | None           | None        | None          | SAFE NOW (queue)                  |
| QA-FIN01-STATUS-01            | Clear bill status after refund+settle      | Pay rejects correctly                              | M          | High           | Possible    | None          | NEEDS DECISION                    |
| Returns restock               | Stock after refund                         | Refund + inventory                                 | M          | High           | Possible    | Shared        | DANGEROUS / NEEDS DECISION        |
| Service charge / tips / comps | New money features                         | Partial infra                                      | M–L        | High           | Likely      | Shared        | NEEDS DECISION / DEFERRED         |
| Accounting CSV export         | Accountant handoff                         | Reports data                                       | M          | Low            | None        | None          | DEFERRED (post-pilot depth)       |
| P1.6 / tax 3.5B / extraction  | —                                          | —                                                  | —          | —              | —           | —             | OUT OF SCOPE                      |

## Rollback

Revert the Phase 3.6B commit. API unchanged; UI returns to legacy single sales tile.
