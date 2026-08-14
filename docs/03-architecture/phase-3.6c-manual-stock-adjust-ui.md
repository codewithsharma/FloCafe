# Phase 3.6C — Manual Stock Adjustment UI

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**

---

## Backend Contract

```text
POST /api/products/:id/stock
Auth:     requireRole('owner','manager')
Module:   product (shared commerce — Restaurant + Retail)
Body:     { action: 'set' | 'increase' | 'decrease', quantity: number >= 0 }
Response: { product }  // includes stock_quantity
Service:  adjustProductStock → withTxn → stock UPDATE + inventory_movements
          movement_type=adjustment, reference_type=manual, reason=<action>
Errors:   400 validation / Insufficient stock; 404 Product not found
```

**Reason field:** The HTTP body does **not** accept free-text reason. Ledger `reason` is the action name (`set`/`increase`/`decrease`). Per phase rules: do **not** change API/schema to add reason. UI documents this clearly (no fake reason input).

**Semantics:**

- `set` → absolute stock target
- `increase` → add quantity
- `decrease` → subtract quantity (rejects when insufficient stock)

---

## Frontend Entry Point

Products table row action (owner/manager + `track_inventory`) → `StockAdjustmentDialog` → `POST /products/:id/stock` → refresh product list.

Ledger remains `/products/movements` (read-only).

---

## User Flow

1. Owner/manager opens Products.
2. Clicks Adjust Stock on a tracked product.
3. Dialog shows name + current stock + action + quantity.
4. Submit → existing API → toast success → refresh list.
5. Failure → toast/error; stock unchanged; retry allowed.
6. Movement appears in ledger with `reason` = action.

---

## Files Expected

- `frontend/src/lib/stock-adjust.ts` — typed client + validation helpers
- `frontend/src/components/products/StockAdjustmentDialog.tsx`
- `frontend/src/components/products/ProductsTable.tsx` — row action
- `frontend/src/app/(dashboard)/products/page.tsx` — wire submit
- `frontend/src/components/products/index.ts`
- i18n en/es/pt
- `tests/stock-adjust-ui.test.ts` (+ flo-products contracts)
- `docs/03-architecture/phase-3.6c-manual-stock-adjust-ui.md`
- `.ai/*` minimal

---

## Tests

- UI contracts: dialog, payload shape, role/module gates, no free-text reason field inventing API fields
- Existing: `test:inventory-boundary`, `test:inventory-ledger`, `test:inventory-ledger-ui`
- Restaurant / Retail isolation
- npm test · lint · builds

---

## Non-goals

New stock API · schema · free-text reason column · suppliers/PO · recipes · multi-location · Products redesign · tax · FIN-01 · refunds · service extraction · P1.6 · 3.5B
