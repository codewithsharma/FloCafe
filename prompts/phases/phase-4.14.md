# Phase 4.14 — Configurable Service Charge ADR

## Status

COMPLETE

## Objective

Decide how Restaurant **service charge** should work, given that the tax engine already supports `service_charge` but order create **hardcodes `service_charge: 0`**. This phase is **ADR / discovery only**. No money-path implementation. Tips are out of scope unless the ADR explicitly reopens them (default: exclude).

## User Story

As a café owner, I want a configurable service charge on dine-in checks that taxes correctly. Before engineering wires it, finance/architecture must freeze when it applies, how it is snapshotted, and how it interacts with FIN-01, refunds, and day-close.

## Why This Phase

- Feature-list: Service charge **NOT BUILT** (hardcoded 0); Tips **NOT BUILT**.
- Tax facade: `ChargeTaxKind` includes `'service_charge'`; receipts already print service charge when > 0.
- Schema health already knows `service_charge_tax_category_id`.
- Wiring without ADR would touch orders, bills, tax snapshots, and possibly FIN-01.

## Existing System Evidence

| Area         | Evidence                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------- |
| Feature-list | Service charge / Tips NOT BUILT                                                               |
| Tax          | `main/services/tax.ts` charge kinds packaging / delivery / service_charge                     |
| Orders       | create path hardcodes `service_charge: 0` (inspect `main/routes/orders.ts` / POS coordinator) |
| Print        | `frontend/src/lib/printer/receipt-encoder.ts`                                                 |
| Tests        | `tests/schema-health.test.ts`, `tests/manual-tax-config.test.ts` (service_charge overrides)   |
| FIN-01       | collectible = total − gross tender; adding a charge changes `bill.total`                      |

## Existing APIs / Services

- Tax preview / calculateTax facade
- Order create / bill generate
- Settings tax / tax packs (charge category overrides)

Do not add Settings UI in this phase.

## Existing Schema

**v75 — confirmed at pipeline follow-up:**

| Exists                                                                   | Missing                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `orders.service_charge_tax_category_id`                                  | **No** `orders.service_charge` amount column                                          |
| `orders.packaging_charge`, `orders.delivery_charge` (REAL)               | **No** `bills.service_charge` amount column                                           |
| Tax kind `'service_charge'`; receipts print `bill.service_charge` if > 0 | Amount is hardcoded `0` in order create (`main/routes/orders.ts`) and never persisted |

Any future **wiring** phase that stores a non-zero amount almost certainly needs a **new column + migration (v76+)** unless the ADR invents a snapshot-only path. That is why **4.14 is ADR/discovery only** — do not migrate now.

## Vertical Impact

### Restaurant

Primary. Dine-in vs takeaway applicability is an ADR question.

### Retail

Must **not** get café service charge by default. Shared tax charge kind may exist; composition/settings must fail closed for Retail.

## Dependencies

- Tax snapshot freeze (Phase 2.11) — do not unfreeze snapshot shape casually.
- FIN-01 closed — any total change must preserve gross-tender outstanding definition.

## Explicit Non-Goals

- Implementation of Settings toggle or POS line
- **Tips** / tip-out / tip pooling / staff tip reports (default exclude)
- Payment terminals
- Changing REAL→cents
- Day-close formula rewrite beyond documenting impact
- 3.5B tax column cleanup

## Implementation Strategy

1. Inspect schema + order create + bill generate + refund of a check with delivery_charge (analog).
2. Write `docs/04-product/phase-4.14-service-charge-discovery.md` **and** `docs/14-decisions/ADR-014-service-charge.md` (or skip ADR number if 013 is still Proposed — do not collide; use next free ADR number).
3. ADR must lock: applicability (dine-in only?), rate vs amount, tax inclusive/exclusive via existing charge tax, snapshot immutability, refund behavior, Retail off, FIN-01, reporting/CSV.
4. **STOP.** No production code.

## TDD REQUIREMENTS

Before implementation (future, not 4.14):

- inspect existing tests
- add characterization tests where needed
- define acceptance tests
- implement smallest safe change
- run focused tests

This phase: characterization **plan** in the discovery doc. No failing money tests.

## SUBAGENT PLAN

| Subagent                  | Responsibility                                    | Allowed files                             | Forbidden files      | Expected output   |
| ------------------------- | ------------------------------------------------- | ----------------------------------------- | -------------------- | ----------------- |
| Discovery Agent           | Trace service_charge through tax + orders + bills | tax.ts, orders, bills, db.ts (read)       | writes               | Money-path map    |
| Isolation Agent           | Retail must not inherit café service charge       | modules, POS (read)                       | code                 | Isolation section |
| Documentation Agent       | Discovery + ADR + `.ai`                           | docs/14-decisions, docs/04-product, `.ai` | `main/`, `frontend/` | ADR               |
| Backend / Frontend / Test | **Idle**                                          | —                                         | production           | none              |
| Reviewer Agent            | Docs; reject any money diff                       | docs                                      | code                 | Review            |

## TRANSACTION / MONEY SAFETY

| Surface                                            | Touched?                                                |
| -------------------------------------------------- | ------------------------------------------------------- |
| orders / bills / payments / refunds / tax / FIN-01 | **DOCS ONLY** — implementation would touch all of these |
| inventory                                          | NO                                                      |
| shifts / day-close                                 | Document reporting impact                               |

**STOP implementation.** This phase is not authorized to change money paths. Explicit review is required before any future wiring phase (not in this 10).

## SCHEMA SAFETY

- schema change: **NO** (this phase)
- migration required: **NO** (this phase)

If ADR finds a missing column: recommend a **future** migration phase. Do not migrate now. If someone starts a migration: **STOP**.

## API CONTRACT

Document existing fields and **proposed** future Settings/order payload. Do not ship endpoints.

- Auth: future owner/manager settings
- Idempotency: future order create already has order idempotency — ADR must say charges are inside the order payload, not a second money API

## VERTICAL ISOLATION

Restaurant on. Retail off by default. Shared tax engine may calculate a charge if a number is passed — Retail POS must not send one.

## TEST MATRIX

- Docs-only diff
- `git diff --check`
- No `npm test` required unless tests added (must not fail)

## BUILD GATES

Docs-only. If any money file changes: **FAIL** and revert.

## DOCUMENTATION

- discovery + ADR
- `.ai/decisions.md`, `.ai/tasks.md`, `.ai/risks.md`
- feature-list remains NOT BUILT

## COMMIT

Docs only. Suggested: `docs: add service charge ADR`

## COMPLETION CRITERIA

- ADR + discovery exist
- production code unchanged
- schema v75
- git commit created
- If ADR is Proposed awaiting human: set `ADR_REQUIRED` and **STOP** auto-advance **or** complete discovery and still advance 4.15 (4.15 does not depend on service charge). Prefer: **COMPLETE** the paper phase once the ADR file is written; human Accept is required before a **future implementation** phase, not before 4.15.

Never auto-start service-charge **wiring**.
