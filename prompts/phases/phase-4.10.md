# Phase 4.10 — FIN-01 Collectible Outstanding Display

## Status

PENDING

## Objective

Surface **collectible outstanding** (FIN-01: `bill_total − gross_successful_tender`) in Orders/bill UI so operators are not misled by `payment_status=partial` or net `balance` after refunds. **Display only.** Do not mutate bills, payments, or refunds. Do not weaken `BILL_NO_OUTSTANDING_BALANCE` rejection.

## User Story

As a cashier, when a bill was fully tendered and then partially refunded, I need the UI to show that there is nothing left to collect — even if net paid dropped — so I do not try to take another payment.

## Why This Phase

- `.ai/tasks.md` / `.ai/risks.md`: **QA-FIN01-STATUS-01** (P2) — APIs refuse further pay; bill may still show `payment_status=partial` / net `balance` > 0.
- Phase 4 discovery: “FIN-01 bill status display alignment.”
- P0.2 / FIN-01 already implemented in `preparePaymentBatch`.

## Existing System Evidence

| Area      | Evidence                                                                   |
| --------- | -------------------------------------------------------------------------- |
| Invariant | `docs/15-project-management/reporting-financial-semantics.md`              |
| Payment   | `main/services/payment-tender.ts`, `main/routes/bills.ts`                  |
| Tests     | `tests/integration-refunds.test.ts` §19–21                                 |
| UI        | `frontend/src/app/(dashboard)/orders/page.tsx`, bill payment_status badges |
| QA        | `docs/15-project-management/p1.6-final-release-candidate-audit.md`         |

## Existing APIs / Services

- Bill JSON already includes `total`, `paid_amount`, `balance`, `payment_status`, `payment_details`
- Payment POST already returns `BILL_NO_OUTSTANDING_BALANCE` / `BILL_ALREADY_REFUNDED`

Inspect whether gross tender is already in the bill DTO. Prefer **frontend derivation** from `payment_details` + `total` if present. Add a **read-only** computed field on GET bill only if derivation is unsafe/duplicative.

## Existing Schema

**v75.** No new columns. Do not “fix” `payment_status` in SQL.

## Vertical Impact

### Restaurant

Orders / pay UI uses the same bills.

### Retail

Same. Exchange (4.5) must still compose refund + new sale; do not change coordinator economics.

## Dependencies

- FIN-01 closed.
- ADR-009 refund model unchanged.

## Explicit Non-Goals

- Writing `bills.payment_status` or `bills.balance` to match FIN-01
- Weakening payment rejection
- REAL→cents
- Changing refund math, day-close, accounting CSV formulas
- New payment states in schema
- Loyalty clawback

## Implementation Strategy

1. Characterize current bill payload + Orders badges after: partial pay; full tender; full tender + refund.
2. Define display copy: e.g. **Collectible** vs **Net paid** (do not invent a third money truth).
3. If `payment_details` is on the bill: compute collectible in a **pure helper** with unit tests.
4. Show collectible outstanding and disable Pay when collectible is 0 even if net balance > 0.
5. Do not PATCH bills.
6. If the only honest fix is mutating stored `payment_status`: **STOP**, set `ADR_REQUIRED`, write discovery — do not implement.

## TDD REQUIREMENTS

Before implementation:

- inspect `integration-refunds` §19–21 and Orders UI tests
- add characterization of current **misleading** display (document actual strings)
- define acceptance tests for display + Pay disabled when collectible is 0
- implement smallest safe change
- run focused tests **and** refund/payment regressions

## SUBAGENT PLAN

| Subagent            | Responsibility                                                   | Allowed files                                       | Forbidden files                               | Expected output                   |
| ------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- | --------------------------------- |
| Discovery Agent     | Can UI derive collectible without new API?                       | bills route, Orders UI, refund tests (read)         | db.ts                                         | Derive vs read-DTO recommendation |
| Backend Agent       | Optional read-only DTO field **only if** discovery says required | bill GET serializer                                 | `preparePaymentBatch` logic, refund.ts, db.ts | Additive JSON field or idle       |
| Frontend Agent      | Helper + Orders/pay display                                      | `frontend/src/lib/**` helper, orders/pos pay chrome | cart checkout money math                      | UI                                |
| Test Agent          | Display + FIN-01 rejection still holds                           | `tests/phase-4.10*.ts`, existing refund tests       | changing §19–21 expectations to weaken        | Tests                             |
| Isolation Agent     | Both verticals                                                   | orders UI                                           | exchange coordinator rewrite                  | Isolation                         |
| Documentation Agent | phase-4.10 + QA-FIN01 note + `.ai`                               | docs, `.ai`, tasks checkbox                         | unrelated                                     | Docs                              |
| Reviewer Agent      | **Must** grep diff for UPDATE bills / payment_status writes      | actual diff                                         | —                                             | Reject if writes                  |

## TRANSACTION / MONEY SAFETY

| Surface                        | Touched?                                 |
| ------------------------------ | ---------------------------------------- |
| orders                         | Read/display                             |
| bills / payments / refunds     | **READ / DISPLAY ONLY**                  |
| tax / FIN-01                   | Display alignment; **no formula change** |
| inventory / shifts / day-close | **NO**                                   |

If the diff contains `UPDATE bills` or changes `preparePaymentBatch` / `createBillRefund`: **STOP** and require explicit review. Default authorization is **display-only**.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If schema change is required: **STOP**. Create ADR/discovery instead.

## API CONTRACT

- Existing reused: GET bill/order payloads, payment error codes
- Proposed: **none preferred**; optional additive `collectible_outstanding` on GET bill (number, cents-or-REAL matching existing bill fields — **do not mix units**)
- Auth: unchanged
- Idempotency: N/A (no money mutation)

Do not invent a new payment endpoint.

## VERTICAL ISOLATION

Shared bills. Restaurant and Retail both display. Do not special-case Retail exchange beyond not breaking 4.5 tests.

## TEST MATRIX

- Focused 4.10 display cases
- `tests/integration-refunds.test.ts` (FIN-01)
- Payment boundary / day-close / 4.4 CSV / 4.5 exchange
- Restaurant / Retail isolation as applicable
- Money boundary: **no** status write
- `npm test` · lint · builds

## BUILD GATES

Focused phase test · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.10-fin01-outstanding-display.md`
- `.ai/tasks.md` (QA-FIN01-STATUS-01)
- `.ai/risks.md`, `.ai/context.md`
- feature-list payments note if needed

## COMMIT

Phase-only. Suggested: `feat: display FIN-01 collectible outstanding`

## COMPLETION CRITERIA

- display implemented **without** bill writes
- FIN-01 rejection tests still pass
- focused + regression pass
- isolation pass
- lint + builds pass
- documentation updated
- git commit created
- no blocker
- schema v75
