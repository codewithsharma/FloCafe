# Phase 4.6 — ADR-013 Retail Product Variants / SKU Identity

## Status

COMPLETE (ADR-only — Accepted 2026-08-14)

Human Accept of ADR-013 locked Option A identity. **No** SKU matrix / parent-child / `Product.variants` implementation was authorized. Phase 4.6 is closed as an ADR/architecture decision phase. Do not create a 4.6 implementation slice.

## Objective

Produce **ADR-013** that locks sellable identity for Retail variants / SKU matrix **before any implementation**. Do not ship a variants feature in this phase.

Discovery is already complete: `docs/04-product/phase-4.6-retail-product-variants-discovery.md` (verdict **ADR REQUIRED**, schema v75 unchanged, production code none).

## User Story

As platform architect and Retail product owner, I need a written, accepted-or-explicitly-queued decision on whether variants are (A) separate `products` rows / ops practice, or (B) a parent/family model requiring schema, so that future work cannot invent a second stock identity that breaks refund restock and exchange.

## Why This Phase

- Catalog today: one `products` row = one sellable identity = one stock bucket = one optional barcode.
- Typed frontend `Product.variants` and `order_items.variant_selection` are **unused stubs**.
- ADR-011 restock and ADR-012 exchange both key on `order_items.product_id`.
- Feature-list still lists variants as a Retail gap; discovery forbids a matrix without ADR.

## Existing System Evidence

| Area      | Evidence                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Discovery | `docs/04-product/phase-4.6-retail-product-variants-discovery.md`                                                       |
| Schema    | `main/db.ts` `products`, `order_items`, `inventory_movements` (v75)                                                    |
| Inventory | `main/services/inventory.ts` — all writes keyed by `products.id`                                                       |
| Restock   | `main/services/refund-restock.ts` + ADR-011                                                                            |
| Exchange  | `frontend/src/lib/exchange/*` + ADR-012                                                                                |
| POS scan  | `frontend/src/lib/pos/product-search.ts` — exact barcode then exact SKU                                                |
| Stubs     | `frontend/src/lib/types.ts` `variants` / `order_items.variant_selection`                                               |
| Tests     | `tests/issue-137-barcode.test.ts`, `tests/phase-4.2-refund-restock.test.ts`, `tests/phase-4.5-retail-exchange.test.ts` |

## Existing APIs / Services

Reuse as characterization only (do not change):

- `GET/POST/PUT /api/products`, `GET /api/products?barcode=`, `?search=`
- `POST /api/products/:id/stock`
- `POST /api/refunds/:id/restock`
- POS order create `{ product_id, quantity, addons? }` — no variant payload

## Existing Schema

**v75.** No `product_variants` table. No `parent_id`. `sku` and `barcode` are not UNIQUE. `inventory_movements.product_id` = `products.id`.

## Vertical Impact

### Restaurant

Must not gain a variants matrix. Addons remain restaurant-only and are **not** variants. Shared `products` rows created as “variant SKUs” remain visible if the DB is reused across verticals (ops fact).

### Retail

Gap remains until a **later** implementation phase (not 4.6–4.15). This phase only decides identity.

## Dependencies

- Phase 4.5 complete (exchange identity is load-bearing).
- Do not reopen ADR-011 / ADR-012 except to **confirm they stay valid under Option A**.

## Explicit Non-Goals

- Product variant matrix UI
- Schema v76 / `parent_id` / `product_variants` table
- UNIQUE index on sku/barcode (may be recommended in ADR; not implemented here)
- Using `variant_selection` JSON as stock identity
- Treating addons as variants
- Suppliers / PO / BOM / multi-location
- Production code in `main/` or `frontend/`
- Reopening 3.5B / 3.5C / REAL→cents / P1.6

## Implementation Strategy

1. Re-read discovery §9–§22. Do not re-litigate completed discovery.
2. Draft `docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md`.
3. ADR must lock:
   - Option A (sellable variant = `products` row) as the **only** stock identity for money/inventory/restock/exchange
   - Whether software matrix is: ops guide only vs parent_id hybrid vs full variant table (**later**)
   - Barcode/SKU uniqueness policy (decision only)
   - Restaurant visibility
   - Migration stance for existing catalog
4. Optional: short merchant ops note that Size×Color can be separate products **today**.
5. Update `.ai/decisions.md`, `.ai/context.md`, `.ai/tasks.md`, `.ai/risks.md`.
6. **STOP.** No `main/` / `frontend/` / schema edits.

## TDD REQUIREMENTS

Before any future implementation (not this phase):

- inspect existing tests
- add characterization tests where needed
- define acceptance tests
- implement smallest safe change
- run focused tests

This phase: **no new behavioral tests required** unless documenting a characterization command list in the ADR. Do not add failing matrix tests.

## SUBAGENT PLAN

| Subagent                         | Responsibility                                         | Allowed files                                                | Forbidden files                    | Expected output            |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------- | -------------------------- |
| Discovery Agent                  | Confirm discovery still matches HEAD `a42493a`         | `docs/04-product/phase-4.6-*`, ADRs, `main/db.ts` (read)     | `main/` writes, `frontend/` writes | Short confirmation memo    |
| Documentation Agent              | Draft ADR-013 + `.ai` notes                            | `docs/14-decisions/ADR-013-*`, `.ai/*`, this prompt’s status | Production code                    | ADR file                   |
| Isolation Agent                  | Verify ADR does not leak Restaurant addons-as-variants | docs only                                                    | code                               | Isolation paragraph in ADR |
| Reviewer Agent                   | Diff review: docs only                                 | same                                                         | code                               | Approve/reject             |
| Backend / Frontend / Test Agents | **Idle**                                               | —                                                            | all production                     | none                       |

Subagents must NOT independently change architecture. Orchestrator owns the ADR text.

## TRANSACTION / MONEY SAFETY

| Surface                                            | Touched?                                          |
| -------------------------------------------------- | ------------------------------------------------- |
| orders / bills / payments / refunds / tax / FIN-01 | **NO** (docs)                                     |
| inventory                                          | **NO** (docs; ADR must preserve current identity) |
| shifts / day-close                                 | **NO**                                            |

If a draft ADR proposes changing restock/exchange identity without Option A: **STOP** — reject the draft.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If the ADR recommends schema for a **future** phase, that is allowed **as a recommendation only**. Implementing it in 4.6 is forbidden.

If someone starts a migration in this phase: **STOP**.

## API CONTRACT

- Existing endpoints reused: none (docs)
- Proposed endpoints: **none in 4.6**
- Request / response / auth / idempotency: N/A

Do not invent variant CRUD APIs in code.

## VERTICAL ISOLATION

- Restaurant does not receive Retail-only matrix behavior (none ships).
- Retail does not receive Restaurant addons-as-variants.
- Shared Inventory/Product services remain shared.
- Composition gates unchanged.

## TEST MATRIX

| Gate                           | Required now                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Focused phase tests            | N/A (docs)                                                                                       |
| Characterization listed in ADR | Yes (commands, not new failing tests)                                                            |
| Restaurant / Retail isolation  | Docs assertion only                                                                              |
| `npm test` / lint / builds     | **Not required** if zero production diff; if any code slipped in, **full gates** and revert code |

## BUILD GATES

If production diff is empty:

- `git diff --stat` shows **docs + prompts + `.ai` only**
- `git diff --check`

If any `main/` or `frontend/` file changed: **FAIL the phase** — revert those files.

Do not run a full product implementation gate to “prove” an ADR.

## DOCUMENTATION

Update:

- `docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md` (create)
- `.ai/context.md`, `.ai/tasks.md`, `.ai/decisions.md`, `.ai/risks.md`
- Optional pointer from `docs/04-product/phase-4.6-retail-product-variants-discovery.md`
- `feature-list` only if status text must say “ADR-013 drafted” — do not mark variants BUILT

## COMMIT

Commit only ADR + discovery pointer + `.ai` notes for 4.6.

Do not include unrelated branding, Retail working-tree, `audit/`, generated files, or refactors. See `prompts/STATE.md` dirty-tree list.

Suggested message:

```text
docs: add ADR-013 retail product variant identity
```

## COMPLETION CRITERIA

COMPLETE only if:

- [ ] ADR-013 file exists and covers identity, uniqueness, Restaurant visibility, migration stance, ADR-011/012 validity
- [ ] `.ai/decisions.md` records the ADR
- [ ] **No** production code / schema change
- [ ] Phase-specific commit created (or human explicitly defers commit)
- [ ] Status in this file set to `COMPLETE` **or** `ADR_REQUIRED` if waiting for human Accept

**Auto-advance:**

- If ADR status is **Accepted** or **Deferred (ops-only, no software matrix)**: activate Phase 4.7.
- If ADR status is **Proposed** awaiting human Accept: set `STATUS=ADR_REQUIRED`, write `prompts/blocked/phase-4.6.md`, **STOP** (human may override `ACTIVE.md` to 4.7 because 4.7 does not depend on the matrix).
- Never auto-start a variants **implementation** phase (not in this 10).
