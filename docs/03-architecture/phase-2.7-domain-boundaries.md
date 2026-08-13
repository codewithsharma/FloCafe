# Phase 2.7 — Domain Boundary Hardening (Inventory + Tax)

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.6 module contract (`bae7751`)

## 1. Problem

Extraction readiness rated **Inventory** and **Tax** as **HIGH** coupling:

- Inventory had no service boundary; stock SQL lived in order/product routes on `products` columns.
- Tax already had `tax-engine.ts` / `tax.ts`, but discount scaling was duplicated across orders/bills/index, and ownership was not explicit.

Package extraction was not the goal — making domains coherent **in place** was.

## 2. Existing State

### Inventory

- Columns only: `track_inventory`, `stock_quantity`, `low_stock_threshold` on `products`.
- No `stock_movements` ledger; history not fully reconstructable.
- Mutations: order create/add-items decrement; order cancel / last-item cancel restore; `POST /api/products/:id/stock` adjust; voids and refunds do **not** restock.
- HTTP stock surface already under `/api/products` (no dedicated inventory router).

### Tax

- Authoritative engine: `TaxEngine.calculate`.
- Adapters: `calculateItemTax`, charge taxes, combine/scale snapshots.
- Discount item-tax scale used `Math.round(amount * ratio * 100) / 100` in money paths (distinct from preview Decimal scale).

## 3. Inventory Boundary

**Now owns** (`main/services/inventory.ts`):

- Availability assert
- Tracked decrement (sale)
- Tracked restore (cancel)
- Manual adjust (`set` / `increase` / `decrease`)
- Low-stock SQL fragment

**Does not own:** product CRUD/pricing/categories, orders, payments, refunds.

**Routes:** No new `main/routes/inventory.ts` — existing product stock HTTP preserved.

**Ledger:** Documented gap; deferred (no schema change).

## 4. Tax Boundary

**Strengthened** (`main/services/tax.ts`):

- Domain header documenting ownership
- `calculateTax` facade → `TaxEngine.calculate`
- Re-export `applyPayableRounding`
- `scaleItemTaxForDiscountRatio` / `scaleItemTaxAfterOrderDiscount` / `computeDiscountTaxRatio` — **preserving Math.round** money-path behavior

**Does not own:** products, orders, payments, refunds, reporting UI, tax-pack install/activate lifecycle.

Orders / bills / index consume the Tax helpers for discount scaling.

## 5. Transaction Boundaries

Stock helpers run **inside** existing `withTxn` scopes on order create/add-items/cancel and item-cancel collapse. No stock work was moved outside SQLite transactions. Refund money path remains separate and still does not touch inventory.

## 6. API Boundaries

| Change | Detail |
|--------|--------|
| New HTTP API | **None** |
| Stock adjust | Still `POST /api/products/:id/stock` (owner/manager) |
| Low stock | Still `GET /api/products?low_stock=true` |
| Tax preview / packs | Unchanged paths |

## 7. Compatibility

Restaurant workflows unchanged: same stock reservation timing, same non-restock void/refund policy, same tax rounding numbers. No frontend changes. No schema migration. No package extraction. Soft module diagnostics unchanged (no fail-closed).

## 8. Extraction Readiness

| Module | Before | After |
|--------|--------|-------|
| Inventory | HIGH | **MEDIUM** |
| Tax | HIGH | **MEDIUM** |

MEDIUM reflects a real service seam + clearer ownership without pretending ledger/denormalized snapshots are gone.

## 9. Remaining Coupling

- Stock columns still physically on `products`.
- No movement ledger → cannot reconcile stock history.
- Order routes still orchestrate stock + tax inside one transaction (correct; POS is not the Inventory module).
- Tax snapshots still denormalized on orders/bills/items.
- Discount scale vs preview Decimal scale remain intentionally different.
- Tax preview/categories still partly registered via `index.ts`.

## 10. Future Extraction

Before package cut:

1. Optional `stock_movements` ledger + backfill/reconcile (likely Phase 2.8+).
2. Freeze inventory HTTP contract (or keep product-nested forever with clear ports).
3. Freeze tax snapshot schema; move remaining `/api/tax/*` handlers fully under tax routes.
4. Explicit ports from Order → Inventory / Tax without expanding POS ownership.

## Related

- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)
- [module-contract.md](module-contract.md)
