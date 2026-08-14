# Phase 4.7 — Restaurant 86 (Sold-Out) Workflow

## Status

COMPLETE

## Objective

Give Restaurant floor staff a dedicated **86** (temporarily unavailable) workflow that toggles existing `products.is_active` without a full product edit, without schema, and without touching stock math.

## User Story

As a manager during service, I need to 86 an item from POS in one action so it disappears from the sellable grid, and un-86 it when the prep issue is resolved — without opening Products admin or zeroing inventory.

## Why This Phase

- Feature-list: Menu availability **PARTIAL** (`is_active` only; no dedicated 86).
- Phase 4 discovery: Restaurant 86 is secondary polish; backend flag already exists.
- POS already requests active products; 86 is a UX + audit + safe adapter gap, not a new domain.

## Existing System Evidence

| Area             | Evidence                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Column           | `products.is_active`                                                                            |
| Write            | `PUT /api/products/:id` owner/manager — full product body including `is_active`                 |
| POS catalog      | `GET /api/products?active=1` (and POS search on loaded catalog)                                 |
| Admin            | Product form already has active toggle                                                          |
| Risk of full PUT | Sending a partial 86 via full PUT can clobber unrelated fields if the client sends a stale body |

## Existing APIs / Services

- `GET /api/products` (`is_active` filter)
- `PUT /api/products/:id` (`requireRole('owner','manager')`)
- Audit: `main/services/audit-log.ts`

Prefer a **narrow availability adapter** over teaching POS to send a full PUT.

## Existing Schema

**v75.** No 86 table. Reuse `is_active`. No migration.

## Vertical Impact

### Restaurant

Primary UX: POS (and optionally Products) 86 / un-86. KDS does not need a new 86 entity — inactive items simply are not ordered.

### Retail

Do **not** add café “86” chrome. Retail already deactivates products from Products admin. Shared column/API is fine; gate the POS 86 control with `isModuleEnabled` / Restaurant vertical (e.g. show on Restaurant POS only). If the adapter is on Product module, Retail admin may call it later — UI must stay Restaurant-first.

## Dependencies

- None on 4.6.
- Must not use stock=0 as 86 (low-stock hub is a different workflow).

## Explicit Non-Goals

- Schema / 86 history table / timed auto-un-86
- Station-level 86
- Recipes / BOM / 86 ingredients
- Changing `stock_quantity`
- Cashier-unauthenticated 86 (v1 = owner/manager, optional manager PIN)
- Retail POS 86 button
- Money path, tax, FIN-01, refunds

## Implementation Strategy

1. Characterize PUT `is_active` and POS `active=1` behavior with tests.
2. Add smallest adapter, e.g. `POST /api/products/:id/availability` `{ "is_active": boolean }` owner/manager, module `product`, audit `product.availability`.
3. POS Restaurant: 86 / restore on product (long-press or overflow) → adapter → refresh catalog.
4. Fail closed if product missing/deleted.
5. Restaurant isolation tests: Retail POS has no 86 control.
6. Docs + feature-list PARTIAL → BUILT (86 workflow) with evidence.

## TDD REQUIREMENTS

Before implementation:

- inspect existing tests (`tests/` product + POS catalog)
- add characterization tests where needed
- define acceptance tests (`tests/phase-4.7-menu-86.test.ts` or equivalent)
- implement smallest safe change
- run focused tests

## SUBAGENT PLAN

| Subagent            | Responsibility                     | Allowed files                                                   | Forbidden files                                              | Expected output               |
| ------------------- | ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| Discovery Agent     | Confirm PUT vs need for adapter    | `main/routes/products.ts` (read), POS pages (read)              | schema, money routes                                         | Adapter vs PUT recommendation |
| Backend Agent       | Availability adapter + audit + Zod | `main/routes/products.ts`, `main/validation/*` (product), tests | `main/db.ts`, bills/refunds/orders money                     | Endpoint                      |
| Frontend Agent      | Restaurant POS 86 UI               | `frontend/src/app/(dashboard)/pos/**`, small component, i18n    | Retail-only chrome on Restaurant-only files mixed with money | UI                            |
| Test Agent          | Phase 4.7 suite + isolation        | `tests/phase-4.7*.ts`, package.json script                      | unrelated suites rewrite                                     | Tests                         |
| Isolation Agent     | Retail has no 86 button            | frontend POS + composition tests                                | schema                                                       | Isolation cases               |
| Documentation Agent | phase doc + feature-list + `.ai`   | `docs/04-product/phase-4.7-*`, `.ai/*`, feature-list            | production unrelated                                         | Docs                          |
| Reviewer Agent      | Diff                               | phase files only                                                | dirty-tree files in STATE.md                                 | Review                        |

Orchestrator owns: no schema, no stock writes.

## TRANSACTION / MONEY SAFETY

| Surface                                            | Touched?                        |
| -------------------------------------------------- | ------------------------------- |
| orders / bills / payments / refunds / tax / FIN-01 | **NO**                          |
| inventory                                          | **NO** (do not decrement on 86) |
| shifts / day-close                                 | **NO**                          |

If implementation starts writing stock or orders: **STOP**.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If schema change is required: **STOP**. Create ADR/discovery instead.

## API CONTRACT

**Existing reused:** `GET /api/products?active=1`

**Proposed (preferred):**

```http
POST /api/products/:id/availability
Authorization: Bearer <owner|manager JWT>
{ "is_active": false }
→ 200 { product }
```

- Auth: owner/manager (same as PUT)
- Idempotency: not money; repeat toggle is OK; last write wins
- Do not invent if PUT can be called with **only** `is_active` without clobbering — prove with tests first. If PUT already no-ops omitted fields (`COALESCE`), POS may PATCH via PUT with `{ is_active }` only. Prefer the adapter if PUT is unsafe.

## VERTICAL ISOLATION

- Restaurant: 86 on POS.
- Retail: no 86 POS chrome; product admin active toggle unchanged.
- Shared Product service remains shared.
- Fail-closed: missing module/role → 403.

## TEST MATRIX

- Focused phase 4.7 tests (86, un-86, 404, 403 cashier, POS catalog hide)
- Product PUT regression
- Restaurant isolation (86 visible)
- Retail isolation (86 not on POS)
- Inventory boundary (stock unchanged)
- `npm test`
- lint + both builds

## BUILD GATES

Required: focused phase test · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.7-menu-86.md`
- `docs/00-product/feature-list.md`
- `.ai/context.md`, `.ai/tasks.md`, `.ai/decisions.md`, `.ai/patterns.md`, `.ai/risks.md`

## COMMIT

Phase-only. Suggested: `feat: add restaurant 86 availability workflow`

Do not include unrelated dirty tree (`prompts/STATE.md`).

## COMPLETION CRITERIA

- implementation finished
- focused + regression tests pass
- Restaurant / Retail isolation pass
- lint + backend + frontend builds pass
- documentation updated
- git commit created
- no unresolved blocker
- schema still v75
