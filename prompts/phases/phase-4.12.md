# Phase 4.12 — Retail POS Fulfillment-Type Honesty

## Status

COMPLETE

## Objective

Stop Retail POS from presenting café **delivery** fulfillment chrome. Restaurant keeps dine-in / takeaway / delivery. Retail should sell as **takeaway** (counter/pickup) unless a later ADR adds genuine retail delivery.

## User Story

As a Retail cashier, I should not see dine-in tables or café delivery-address flows. Checkout should be a simple counter sale (takeaway), matching `ACTIVE_VERTICAL_ID=retail`.

## Why This Phase

- Phase 4.1: dine-in hidden when `tables` module is off; POS defaults takeaway if composition has no tables.
- `CartPanel` still lists `delivery` whenever type !== dine_in (`filter((type) => tablesModuleEnabled || type !== 'dine_in')`).
- Phase 4 discovery: “Takeaway forced; delivery still F&B-shaped.”
- Dirty working tree may already touch `CartPanel.tsx` / `cart.ts` — **do not** mix those unrelated edits; implement from HEAD + this phase only.

## Existing System Evidence

| Area            | Evidence                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| 4.1             | `docs/04-product/phase-4.1-retail-floor-usability.md`                            |
| Cart UI         | `frontend/src/components/pos/CartPanel.tsx` order type toggles                   |
| Default         | `frontend/src/app/(dashboard)/pos/page.tsx` takeaway when `!tablesModuleEnabled` |
| Store           | `frontend/src/store/cart.ts` `orderType: 'dine_in' \| 'takeaway' \| 'delivery'`  |
| Orders          | `orders.type` includes dine_in / takeaway / delivery / online                    |
| Delivery charge | `orders.delivery_charge` + tax charge kind `delivery`                            |

## Existing APIs / Services

- Order create already accepts `type`
- No new backend required if Retail client only sends `takeaway`
- Composition: `GET /api/platform/composition` `verticalId`

## Existing Schema

**v75.** No change. Do not drop `delivery` from Restaurant.

## Vertical Impact

### Restaurant

Unchanged: dine-in (tables), takeaway, delivery + address field.

### Retail

Hide dine-in (already) **and** hide delivery toggle + delivery address. Force/keep `takeaway`. Do not mount tables.

## Dependencies

- Phase 4.1 composition / tables gate.
- Independent of 4.6 variants.

## Explicit Non-Goals

- Implementing retail courier delivery
- Online ordering / aggregators
- Schema / order type enum migration
- Changing delivery **tax** or charges for Restaurant
- Packaging charge redesign
- Mixing dirty-tree Retail branding/module files from `STATE.md`

## Implementation Strategy

1. Characterize CartPanel filter + POS default on restaurant vs retail-test/retail.
2. Gate order types: Restaurant = existing three; Retail = takeaway only (or takeaway + explicit future flag — default takeaway only).
3. If persisted cart hydrates `delivery` under Retail, coerce to takeaway on composition load (same pattern as 4.1 dine_in → takeaway).
4. Isolation tests: Restaurant still shows delivery; Retail does not.
5. Do not change backend order validation to reject delivery globally (Restaurant + historical rows).

## TDD REQUIREMENTS

Before implementation:

- inspect `tests/flo-ui-shell.test.ts`, `pos-orchestration-boundary`, phase-4.1 / retail tests
- add characterization of current Retail delivery toggle
- define acceptance tests
- implement smallest safe change
- run focused tests

## SUBAGENT PLAN

| Subagent            | Responsibility                                                       | Allowed files                                           | Forbidden files                                                    | Expected output   |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| Discovery Agent     | Confirm 4.1 leftover delivery path                                   | CartPanel, pos/page, cart store (read)                  | main/db.ts                                                         | Exact UI branches |
| Frontend Agent      | Gate types + coerce persisted cart                                   | CartPanel, pos/page, cart.ts **only as needed**, i18n   | unrelated POS redesign, dirty branding                             | UI                |
| Test Agent          | phase-4.12 + 4.1 regression                                          | `tests/phase-4.12*.ts`, flo-ui / retail tests           | backend money                                                      | Tests             |
| Backend Agent       | **Idle** unless order create must reject delivery on retail vertical | orders route **only** if discovery requires fail-closed | tax, bills                                                         | none expected     |
| Isolation Agent     | Restaurant delivery intact                                           | composition tests                                       | schema                                                             | Isolation         |
| Documentation Agent | phase-4.12 + verticals.md honesty + `.ai`                            | docs, `.ai`, feature-list                               | unrelated                                                          | Docs              |
| Reviewer Agent      | Diff vs STATE dirty tree                                             | phase files                                             | do not commit pre-existing cart.ts drift unless it **is** this fix | Review            |

## TRANSACTION / MONEY SAFETY

| Surface                                   | Touched?                                      |
| ----------------------------------------- | --------------------------------------------- |
| orders                                    | Client `type` only; no bill math              |
| bills / payments / refunds / tax / FIN-01 | **NO** (do not change delivery_charge engine) |
| inventory / shifts / day-close            | **NO**                                        |

If someone “cleans up” delivery tax while here: **STOP** — out of scope.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If schema change is required: **STOP**.

## API CONTRACT

- Existing reused: `POST /api/orders` with `type: takeaway`
- Proposed endpoints: **none**
- Optional backend fail-closed: if `verticalId===retail` and `type==='delivery'` → 400. Only if tests show clients can still send it. Not required for v1 if UI is gated.
- Auth / idempotency: unchanged

## VERTICAL ISOLATION

- Restaurant keeps delivery.
- Retail does not receive dine-in or café delivery chrome.
- Shared order service remains shared.
- Fail-closed tables already in 4.1.

## TEST MATRIX

- Focused 4.12
- Phase 4.1 / flo-ui / synthetic-retail / production-retail if present
- Restaurant isolation (delivery still there)
- Retail isolation (no delivery toggle)
- `npm test` · lint · builds

## BUILD GATES

Focused phase test · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.12-retail-fulfillment-types.md`
- `docs/00-product/verticals.md` / feature-list if checkout honesty changes
- `.ai/context.md`, `.ai/tasks.md`, `.ai/patterns.md`

## COMMIT

Phase-only. Suggested: `feat: hide cafe delivery types on retail POS`

Do not include unrelated `main/modules/*` or branding diffs.

## COMPLETION CRITERIA

- implementation finished
- focused + 4.1 regression pass
- Restaurant / Retail isolation pass
- lint + builds pass
- documentation updated
- git commit created
- no blocker
- schema v75
