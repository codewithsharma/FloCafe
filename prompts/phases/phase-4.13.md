# Phase 4.13 — Restaurant Table Merge Discovery

## Status

COMPLETE

## Objective

Discover whether two occupied tables can be merged using existing order/table primitives **without** a new money domain, and write the discovery (and ADR if billed checks are in scope). **Do not implement merge.**

## User Story

As a floor manager, I want to combine two parties onto one table during service. Before we build it, architecture must decide what happens to open orders, items, KDS tickets, and any bills already generated.

## Why This Phase

- Feature-list: Table merge **NOT BUILT**.
- Table **transfer** exists: `POST /api/tables/:id/move-order` — **409** if target already has an active order.
- Phase 4 discovery listed merge as restaurant polish, lower than Retail credibility slices already shipped (4.1–4.5).
- Combining orders is identity-sensitive; billed/partially paid checks are a money-path trap.

## Existing System Evidence

| Area         | Evidence                                                          |
| ------------ | ----------------------------------------------------------------- |
| Transfer     | `main/routes/tables.ts` `POST /:id/move-order`                    |
| Tests        | `tests/tables-string-ids.test.ts` (occupied target → 409)         |
| Tables       | `tables.status`, occupy/free gated by `isModuleEnabled('tables')` |
| Held orders  | `held_orders` table-scoped                                        |
| KDS          | notify on order updates when `kds` enabled                        |
| Split checks | `bill_items` / split payments exist — merge ≠ split inverse       |

## Existing APIs / Services

- `POST /api/tables/:id/move-order` `{ target_table_id, order_id? }`
- Order add-items / cancel item
- Bills generate / pay

Do not invent `/merge` in code this phase.

## Existing Schema

**v75.** `tables`, `orders.table_id`, `held_orders`. No merge table.

## Vertical Impact

### Restaurant

Only vertical that mounts `tables`. Discovery must keep merge restaurant-only.

### Retail

Must not receive merge APIs or UI. Fail-closed remount already omits tables routes.

## Dependencies

- Tables module + move-order characterization.
- Independent of Retail 4.6–4.12.

## Explicit Non-Goals

- Implementation
- Multi-location / combining stores
- Changing split-check money math
- Retail tables
- Schema migration in this phase
- Tips / service charge (4.14)

## Implementation Strategy

1. Trace move-order, occupy/free, KDS notify, held orders, bill generation per table.
2. Enumerate merge cases: both unpaid open orders; one billed; both billed; items on KDS; held carts.
3. Recommend **SAFE NOW** slice if any: e.g. merge only two **unpaid** orders with **no bill** by moving items onto surviving `order_id` then freeing source table — **or** declare ADR required.
4. Write `docs/04-product/phase-4.13-table-merge-discovery.md`.
5. If money-path merge of billed checks is desired: draft ADR, status `ADR_REQUIRED`.
6. **STOP.** No production code.

## TDD REQUIREMENTS

Before implementation (future phase, not 4.13):

- inspect existing tests
- add characterization tests where needed
- define acceptance tests
- implement smallest safe change
- run focused tests

This phase: list characterization commands in the discovery doc. Optional: add **read-only** characterization tests that document 409-on-occupied-target — only if they don’t require new product behavior.

## SUBAGENT PLAN

| Subagent                         | Responsibility                     | Allowed files                                                 | Forbidden files      | Expected output   |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------- | -------------------- | ----------------- |
| Discovery Agent                  | Map move-order + bill + KDS        | tables.ts, orders.ts, bills (read)                            | all writes           | Case matrix       |
| Isolation Agent                  | Confirm retail has no tables mount | modules, remount tests (read)                                 | code                 | Isolation section |
| Documentation Agent              | Discovery (+ ADR if needed)        | `docs/04-product/phase-4.13-*`, optional `docs/14-decisions/` | `main/`, `frontend/` | Docs              |
| Test / Backend / Frontend Agents | **Idle**                           | —                                                             | production           | none              |
| Reviewer Agent                   | Docs-only diff                     | docs, `.ai`                                                   | code                 | Review            |

Orchestrator owns: no merge endpoint.

## TRANSACTION / MONEY SAFETY

| Surface                   | Touched?                                          |
| ------------------------- | ------------------------------------------------- |
| orders / bills / payments | **Docs only**                                     |
| refunds / tax / FIN-01    | Must be called out if merge after pay is in scope |
| inventory                 | Item moves must not double-decrement              |
| shifts / day-close        | Unlikely; mention if bills move business date     |

If discovery recommends merging **paid** bills: **ADR_REQUIRED**. Do not implement.

## SCHEMA SAFETY

- schema change: **NO** (this phase)
- migration required: **NO** (this phase)

If implementation would need schema: record it; **do not migrate now**. STOP implementation (already non-goals).

## API CONTRACT

- Existing reused (characterize): `POST /api/tables/:id/move-order`
- Proposed endpoints: document candidates only, e.g. `POST /api/tables/:id/merge` — **do not ship**
- Auth / idempotency: specify in discovery for a future phase

## VERTICAL ISOLATION

Restaurant-only. Retail must not get merge. Shared order service must not gain a hard restaurant dependency (follow 2.17 `isModuleEnabled('tables')`).

## TEST MATRIX

- No implementation suite required
- `git diff` must not include `main/` or `frontend/`
- If characterization tests added: they must pass on current HEAD without product changes

## BUILD GATES

Docs-only: `git diff --check`. Full `npm test` / builds **not** required unless tests were added.

## DOCUMENTATION

- `docs/04-product/phase-4.13-table-merge-discovery.md`
- `.ai/decisions.md`, `.ai/tasks.md`, `.ai/risks.md`
- feature-list remains NOT BUILT

## COMMIT

Docs only. Suggested: `docs: discover restaurant table merge`

## COMPLETION CRITERIA

- discovery document complete with recommended SAFE slice **or** ADR_REQUIRED
- production code unchanged
- schema v75
- `.ai` updated
- git commit created (docs)
- no unresolved blocker except an explicit `ADR_REQUIRED` stop for **implementation** (discovery itself can COMPLETE)

**Auto-advance:** After discovery is committed, activate 4.14. Do **not** auto-start merge implementation (not in this 10).
