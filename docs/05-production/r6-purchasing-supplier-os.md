# R6 — Purchasing & Supplier OS

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v80  
**Suite:** `npm run test:r6`  
**Baseline:** R5 `a6ac124` + R4.1 `0a6ed6a`

---

## Purpose

Local-first purchasing workflow for the Restaurant vertical:

Supplier → Purchase Order → Receiving → Inventory ledger → Stock / catalog cost

Extends R4 Inventory and R5 Recipes. Does **not** rebuild inventory or recipes. Does **not** create a second stock ledger.

---

## Domain model

| Table | Role |
| --- | --- |
| `suppliers` | Vendor master (soft-deactivate via `is_active`) |
| `supplier_products` | Supplier ↔ product SKU mapping + last purchase cost (cents) |
| `purchase_orders` | PO header + status + money totals (cents) |
| `purchase_order_lines` | Ordered / received qty + unit cost (cents) |
| `purchase_receipts` / `purchase_receipt_lines` | Receiving operations |
| `purchase_receive_idempotency` | Receive Idempotency-Key store |

HTTP: `/api/purchasing/*` (module-gated with inventory).  
UI: `/products/purchasing` (owner/manager).

---

## PO lifecycle

```
DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED
  ↓         ↓
CANCELLED  CANCELLED (only if nothing received)
```

Illegal transitions → **409** `PO_ILLEGAL_TRANSITION`.  
Cancel after any receive → **409** `PO_CANCEL_AFTER_RECEIVE` (no silent stock reverse).

---

## Receiving

- Full and partial receives; multiple receipts per PO.
- Over-receive → **409** `PO_RECEIVE_EXCEEDS_ORDER` (no tolerance %).
- CAS on `received_qty + qty <= ordered_qty` inside SQLite txn.
- Concurrent overlapping receives: one succeeds, one 409.
- Mandatory `Idempotency-Key` — duplicate replay returns same receipt; no double stock.

### Inventory integration

Uses existing R4 ledger only:

- `movement_type = 'adjustment'`
- `reason = 'purchase_receipt'`
- `reference_type = 'purchase_receipt'`
- `reference_id = receipt id`

Helper: `applyPurchaseReceiptStock` in `main/services/inventory.ts`.  
Units: R4 `convertQuantity` / cross-family reject.

---

## Cost semantics

| Field | Storage |
| --- | --- |
| PO / receipt / mapping money | **INTEGER cents** (`*_cents`) |
| `products.cost` catalog | **REAL** (major units) — updated on receive from `unit_cost_cents / 100` |

R4.1 stopped full REAL→cents migration. New purchasing money uses cents; catalog REAL remains until P0.3 dual-write.  
R5 recipe consumption cost snapshots stay immutable.

No weighted-average / FIFO engine in R6 — last purchase updates catalog cost only.

---

## RBAC

| Role | Access |
| --- | --- |
| owner / manager | Full mutate + read |
| chef | Read suppliers / POs |
| cashier / waiter | No purchasing mutation |

---

## Audit

`supplier.created` / `supplier.updated` / `supplier.deactivated`  
`purchase_order.created` / `purchase_order.ordered` / `purchase_order.cancelled`  
`purchase_receipt.created` / `purchase_receipt.completed`

Inventory movements remain authoritative for stock deltas.

---

## Offline

All supplier / PO / receive / ledger writes are local SQLite. No cloud supplier APIs.

---

## Known limitations

- No supplier returns / debit notes
- No multi-location purchasing
- No auto-reorder / forecasting (R12+)
- No WAC/FIFO valuation policy (future ADR)
- Catalog `products.cost` still REAL (P0.3 dependency)

---

## Capability matrix

Promoted to Existing: Suppliers, Purchase orders, PO receiving, Partial receiving, Purchase inventory integration (supplier pricing = last cost mapping).
