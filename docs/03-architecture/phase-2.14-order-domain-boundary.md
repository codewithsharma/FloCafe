# Phase 2.14 (CURRENT) — Order Domain Boundary

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.13 Product↔Tax ownership

## Numbering note — CURRENT vs INTERIM

| Label | Doc | Meaning |
|-------|-----|---------|
| **INTERIM 2.14** | [`phase-2-exit-gate.md`](./phase-2-exit-gate.md) | Historical Phase 2 exit gate (docs/catalog hardening). **Preserved — do not delete.** |
| **CURRENT 2.14** | This document | Order domain boundary: ownership facade + relocate item cancel/restore onto `orderRoutes`. |

Platform work list in [`docs/modules/README.md`](../modules/README.md) notes both: interim exit stays; CURRENT 2.14 Order is the continuation.

Phase 2 is **CONTINUATION in progress** — not claimed complete after this milestone.

## Ownership map

| Concern | Owner |
|---------|--------|
| Order lifecycle (create, status, item cancel/restore HTTP) | **Order** |
| Order / `order_items` persistence | **Order** |
| Historical money + tax *storage* on order rows | **Order** (snapshots; Tax calc at write time) |
| Stock quantity mutations / ledger | **Inventory** (`decrementTrackedStock` / `restoreTrackedStock`) |
| Tax calculation / engine / scaling helpers | **Tax** facade |
| Payment tender / bills | **Payment** |
| KDS push semantics | **KDS** (`notifyKdsUpdate` is a call site only) |

Facade: `main/services/order.ts` exports `ORDER_OWNED_CONCERNS`, `ORDER_DOES_NOT_OWN`, `assertOrderBoundaryInvariants()`.

Callers keep `withTxn`. Inventory remains stock owner; Tax remains calc owner. No package extraction.

## What moved

| From | To | Paths (unchanged when mounted at `/api/orders`) |
|------|-----|--------------------------------------------------|
| `main/routes/index.ts` | `main/routes/orders.ts` (`orderRoutes`) | `PATCH /:orderId/items/:itemId/cancel` |
| `main/routes/index.ts` | `main/routes/orders.ts` (`orderRoutes`) | `PATCH /:orderId/items/:itemId/restore` |

`checkPinRateLimit` already lived on `orders.ts` and stays there.

## What did NOT change

- Money / tax math
- Inventory semantics (including void×cancel quirks — **pinned, not fixed**)
- Schema (remains **v75**)
- API paths / contracts
- `withTxn` usage by callers
- Package extraction (none)

## Characterized stock asymmetries

1. **Partial line cancel** (2+ items): stock **unchanged** for cancelled qty (no restock until full-order / last-item path).
2. **Void preparing/ready** (manager PIN): stock **unchanged** by design.
3. **Void then full order cancel**: CURRENT behavior may **over-restore** (voided row + `void_adjustment` both restored). Product fix **deferred**.

Tests: `tests/order-boundary.test.ts`, `tests/order-void-cancel-stock.test.ts` (`npm run test:order-boundary`).

## Extraction readiness

**LOW–MEDIUM**

- Cancel/restore HTTP now colocated with other order routes.
- Thin ownership facade exists.
- Create / addItems / money rollup still live in route handlers; pure `recalculateOrderMoneyFields` **deferred** (`ORDER_MONEY_ROLLUP_EXTRACTION = 'deferred'`).

## Deferred

- Void×cancel restock semantic fix
- Full facade extraction of create / addItems
- Safe pure money-rollup helper extraction
- Phase 3 package extraction / fail-closed deps

## Related

- [phase-2-exit-gate.md](./phase-2-exit-gate.md) (INTERIM 2.14)
- [module-ownership.md](./module-ownership.md)
- Inventory / Tax boundary docs (2.7–2.13)
