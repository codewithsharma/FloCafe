# Phase 4.11 — Inventory On-Hand Valuation Report

## Status

COMPLETE

## Objective

Give owners/managers a **read-only** on-hand valuation: catalog `cost` × `stock_quantity` for inventory-tracked products. Label it honestly (catalog cost, not WAC/FIFO). No schema. No stock writes.

## User Story

As an owner, I need to see the approximate inventory value of what’s on the shelf using the costs I already enter on products, without a procurement system.

## Why This Phase

- Phase 4 matrix: Inventory valuation **PARTIAL** — `products.cost` exists; no report.
- Cost is already in Product form (`cost_price`) and Products table.
- Ledger UI (3.5A) and low-stock hub (4.3) exist; valuation is the missing owner dollar view.
- STRATEGY still freezes ERP procurement — this is **not** receiving or suppliers.

## Existing System Evidence

| Area        | Evidence                                                   |
| ----------- | ---------------------------------------------------------- |
| Column      | `products.cost` (API `cost_price`)                         |
| Stock cache | `products.stock_quantity` + `track_inventory`              |
| Ledger      | `inventory_movements` (history, not cost layers)           |
| UI          | `ProductFormDialog` cost field; `ProductsTable` shows cost |
| List API    | `GET /api/products` owner/manager                          |

## Existing APIs / Services

- `GET /api/products` (includes cost + stock)
- `GET /api/inventory/movements` — **do not** use for valuation math
- `GET /api/reports/*` pattern for owner/manager reporting

Prefer computing from existing product list **or** a thin `GET /api/reports/inventory-valuation` that SELECTs the same columns (no new formula tables).

## Existing Schema

**v75.** `products.cost`, `stock_quantity`, `track_inventory`. No valuation snapshots.

## Vertical Impact

### Restaurant

Shared inventory module. F&B valuation is crude (no BOM) — copy must say so.

### Retail

Higher value (SKU stock). Same report. No Retail-only costing engine.

## Dependencies

- Cost field already on products (no new cost UX required).
- Do not wait for suppliers/PO.

## Explicit Non-Goals

- Weighted average / FIFO / layers
- Suppliers, PO, receiving, landed cost
- Writing cost from last PO
- Recipes/BOM explosion
- Multi-location
- Changing `stock_quantity`
- Tax / FIN-01 / money tenders

## Implementation Strategy

1. Confirm GET products returns cost + stock + track_inventory for owner/manager.
2. If the list is complete (no silent pagination that drops SKUs), v1 may be a Products or Reports page computing sums client-side from one fetch — **prove completeness first**.
3. If pagination/filtering would under-count, add `GET /api/reports/inventory-valuation` aggregating in SQL.
4. Include: SKU, name, on-hand qty, unit cost, extended value; totals; skip or zero-cost flag for null cost.
5. Auth: owner/manager; inventory or reporting module enabled.
6. Disclaimer in UI: catalog cost × on-hand; not accounting COGS.

## TDD REQUIREMENTS

Before implementation:

- inspect product list + inventory tests
- characterize cost_price mapping
- define acceptance tests (tracked only; null cost; restaurant/retail)
- implement smallest safe change
- run focused tests

## SUBAGENT PLAN

| Subagent            | Responsibility                            | Allowed files                                             | Forbidden files             | Expected output           |
| ------------------- | ----------------------------------------- | --------------------------------------------------------- | --------------------------- | ------------------------- |
| Discovery Agent     | Pagination / completeness of GET products | products route (read)                                     | db.ts                       | Client vs report endpoint |
| Backend Agent       | Optional valuation GET                    | `main/routes/reports.ts` or inventory route               | inventory writes, db.ts     | Endpoint or idle          |
| Frontend Agent      | Report page + nav gate                    | Reports or `/products/valuation`, i18n, Sidebar if needed | stock adjust, ledger writes | UI                        |
| Test Agent          | phase-4.11                                | `tests/phase-4.11*.ts`                                    | ledger type expansion       | Tests                     |
| Isolation Agent     | Both verticals; Restaurant BOM disclaimer | nav/composition                                           | tables/kds                  | Isolation                 |
| Documentation Agent | phase-4.11 + feature-list + `.ai`         | docs, `.ai`                                               | unrelated                   | Docs                      |
| Reviewer Agent      | Diff                                      | phase files                                               | STATE dirty tree            | Review                    |

## TRANSACTION / MONEY SAFETY

| Surface                                            | Touched?      |
| -------------------------------------------------- | ------------- |
| orders / bills / payments / refunds / tax / FIN-01 | **NO**        |
| inventory                                          | **READ ONLY** |
| shifts / day-close                                 | **NO**        |

If the phase writes stock or cost from the report: **STOP**.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If schema change is required: **STOP**.

## API CONTRACT

**Existing reused:** `GET /api/products`

**Proposed (only if list is incomplete):**

```http
GET /api/reports/inventory-valuation
Authorization: owner|manager
→ { currency, as_of, lines[], totals: { on_hand_qty, extended_cost } }
```

- Auth: owner/manager
- Idempotency: GET
- Do not invent costing methods

## VERTICAL ISOLATION

Shared inventory + reporting. No Restaurant BOM. No Retail-only valuation table. Composition fail-closed on reporting/inventory module.

## TEST MATRIX

- Focused 4.11
- Product/inventory regression (no stock drift)
- Restaurant / Retail
- Inventory boundary (no writes)
- `npm test` · lint · builds

## BUILD GATES

Focused phase test · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.11-inventory-valuation.md`
- feature-list Inventory valuation
- `.ai/context.md`, `.ai/tasks.md`, `.ai/risks.md` (stale cost)

## COMMIT

Phase-only. Suggested: `feat: add catalog-cost inventory valuation report`

## COMPLETION CRITERIA

- implementation finished
- focused + inventory regression pass
- isolation pass
- lint + builds pass
- documentation updated (including “not WAC” disclaimer)
- git commit created
- no blocker
- schema v75
