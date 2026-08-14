# Phase 4.15 — Wastage Stock Decrease

## Status

COMPLETE

## Objective

Let owners/managers record **wastage** as an inventory decrease using the existing stock-adjust pipeline (`movement_type=adjustment`) with a dedicated `action` value, so the ledger distinguishes waste from generic `decrease`. No new movement CHECK values unless they already allow it without migration.

## User Story

As a manager, I need to write off spoiled or damaged stock so on-hand qty drops and the ledger shows wastage — not an unexplained decrease.

## Why This Phase

- Feature-list: Wastage tracking **NOT BUILT**.
- Phase 3.6C: `POST /api/products/:id/stock` `{ action: 'set' \| 'increase' \| 'decrease', quantity }` ; ledger `reason` = action; **no free-text reason**.
- Inventory service already maps those actions to `adjustment` movements.
- A fourth enum value is a focused product slice; suppliers/PO remain frozen.

## Existing System Evidence

| Area      | Evidence                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| HTTP      | `POST /api/products/:id/stock` owner/manager                                  |
| Zod       | `main/validation/inventory.ts` `z.enum(['set','increase','decrease'])`        |
| Service   | `main/services/inventory.ts` `adjustProductStock`                             |
| UI        | `StockAdjustmentDialog`                                                       |
| Ledger UI | `/products/movements`                                                         |
| CHECK     | `inventory_movements.movement_type IN ('sale','cancel_restore','adjustment')` |
| 3.6C doc  | Do not add free-text reason                                                   |

## Existing APIs / Services

Reuse `adjustProductStock`. Extend `action` enum with `'wastage'` that behaves like `decrease` (reject insufficient stock) and sets `reason=wastage` (and `reference_type` inspect existing manual refs — prefer `manual` or `wastage` **only if column has no CHECK forbidding it**).

## Existing Schema

**v75.** Do **not** add `movement_type=wastage` if that requires CHECK change + migration.

Inspect `reference_type` / `reason` constraints in `main/db.ts` before choosing values.

## Vertical Impact

### Restaurant

Spoilage write-off (no BOM explosion — whole-item qty only).

### Retail

Damaged/unsellable write-off. Same API. Shared inventory module.

## Dependencies

- Phase 3.6C UI + inventory ledger.
- Independent of 4.14.

## Explicit Non-Goals

- Free-text reason field (3.6C contract)
- New `movement_type` requiring v76
- Recipes/BOM / ingredient wastage
- Suppliers / PO / receiving
- Auto-86 when stock hits 0 (that is 4.7)
- Money / COGS posting / valuation engine (4.11 is read-only catalog cost)
- Multi-location

## Implementation Strategy

1. Read CHECK constraints on `inventory_movements`.
2. If `reason` is unconstrained TEXT: add `action: 'wastage'` → decrease qty, `reason=wastage`.
3. If a CHECK would fail: **STOP**, `ADR_REQUIRED`, no migration in this phase.
4. Extend Zod + service + StockAdjustmentDialog action list + i18n.
5. Ledger UI should show reason `wastage` (already displays reason).
6. Tests: wastage decreases stock; insufficient stock 400; Restaurant + Retail; 3.6C set/increase/decrease unchanged.

## TDD REQUIREMENTS

Before implementation:

- inspect `tests/stock-adjust-ui.test.ts`, inventory-boundary, inventory-ledger
- add characterization of current actions
- define acceptance tests (RED)
- implement smallest safe change
- run focused tests

## SUBAGENT PLAN

| Subagent            | Responsibility                    | Allowed files                                                                          | Forbidden files    | Expected output   |
| ------------------- | --------------------------------- | -------------------------------------------------------------------------------------- | ------------------ | ----------------- |
| Discovery Agent     | CHECK constraints on movements    | `main/db.ts` (read), inventory.ts (read)                                               | migrations         | Go / ADR_REQUIRED |
| Backend Agent       | Enum + adjustProductStock branch  | `main/validation/inventory.ts`, `main/services/inventory.ts`, products route if needed | db.ts CHECK, bills | Action            |
| Frontend Agent      | Dialog action + i18n              | StockAdjustmentDialog, stock-adjust.ts                                                 | Products redesign  | UI                |
| Test Agent          | phase-4.15 + 3.6C regression      | `tests/phase-4.15*.ts`                                                                 | money tests        | Tests             |
| Isolation Agent     | Shared; both verticals            | composition if needed                                                                  | tables             | Isolation         |
| Documentation Agent | phase-4.15 + feature-list + `.ai` | docs, `.ai`                                                                            | unrelated          | Docs              |
| Reviewer Agent      | Reject schema bump                | diff                                                                                   | STATE dirty tree   | Review            |

## TRANSACTION / MONEY SAFETY

| Surface                                            | Touched?                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| orders / bills / payments / refunds / tax / FIN-01 | **NO**                                                            |
| inventory                                          | **YES** — stock decrease + ledger row (authorized for this phase) |
| shifts / day-close                                 | **NO**                                                            |

Inventory write is in scope. Tender/refund/tax is not. If the phase posts COGS to bills: **STOP**.

## SCHEMA SAFETY

- schema change: **NO** (required)
- migration required: **NO**

If schema change is required: **STOP**. Create ADR/discovery instead (do not ship v76 here).

## API CONTRACT

**Existing reused:** `POST /api/products/:id/stock`

**Proposed body extension:**

```http
POST /api/products/:id/stock
Authorization: owner|manager
{ "action": "wastage", "quantity": number }  // quantity > 0, decrease semantics
→ 200 { product }
```

- Auth: owner/manager (unchanged)
- Idempotency: not money; repeat wastage is a second decrease (no idempotency key required unless inventory already uses one — do not invent)

Do not add a parallel `/wastage` route unless the enum extension is impossible (it should not be).

## VERTICAL ISOLATION

Shared inventory. Both verticals get the action in Products adjust dialog. No Restaurant-only BOM. No Retail-only write-off table.

## TEST MATRIX

- Focused 4.15
- 3.6C / inventory-boundary / inventory-ledger / ledger UI
- Restaurant / Retail
- Inventory boundary (wastage is an allowed write)
- Money tests unchanged
- `npm test` · lint · builds

## BUILD GATES

Focused phase test · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.15-wastage-stock.md`
- feature-list Wastage
- `.ai/context.md`, `.ai/tasks.md`, `.ai/patterns.md` (reason=wastage)

## COMMIT

Phase-only. Suggested: `feat: add inventory wastage stock action`

## COMPLETION CRITERIA

- implementation finished
- focused + inventory regression pass
- isolation pass
- lint + builds pass
- documentation updated
- git commit created
- no blocker
- schema v75
- After 4.15 COMPLETE: pipeline has no NEXT phase in this 10 — set `NEXT_PHASE=` empty and `STATUS=COMPLETE` on the pipeline (do not invent 4.16).
