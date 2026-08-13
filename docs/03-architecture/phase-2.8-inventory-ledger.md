# Phase 2.8 — Inventory Movement Ledger

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.7 (`f1a38a7`, accepted historical commit)

## 1. Why the ledger exists

Phase 2.7 gave Inventory a service boundary, but stock changes were not durable history. Without a ledger, stock cannot be independently reconstructed and package extraction stays incomplete.

## 2. Current stock vs movement history

| Store | Role |
|-------|------|
| `products.stock_quantity` | **Current-state cache** — runtime source of truth for availability / UI |
| `inventory_movements` | **Append-only durable history** from schema v75 onward |

Do **not** replace runtime reads with `SUM(quantity_delta)` in Phase 2.8.

## 3. Movement types

| Type | When | Delta sign |
|------|------|------------|
| `sale` | Order create / add-items (`decrementTrackedStock`) | negative |
| `cancel_restore` | Order cancel / last-item collapse restore | positive |
| `adjustment` | `POST /api/products/:id/stock` set/increase/decrease | signed |

**Not recorded:** refunds (no restock), voids (no restock), product create/PUT stock fields (deferred), purchase/transfer/waste (not built).

## 4. Transaction rules

Every mutation performs stock UPDATE + movement INSERT in the **same** SQLite transaction:

- Order paths: caller's `withTxn`
- Manual adjust: `withTxn` inside `adjustProductStock`

If either fails → both roll back.

## 5. Migration point

- **Schema:** v74 → **v75** (`p2_8_inventory_movements_ledger`)
- Creates `inventory_movements` + indexes
- Does **not** alter product stock
- Does **not** backfill history

## 6. Historical data limitation

Ledger starts **empty** at migration. Pre-v75 stock changes are not reconstructable. Do not fabricate opening rows.

## 7. Append-only rule

Normal ops: **INSERT only**. Never UPDATE/DELETE movement rows. Corrections = compensating movements.

## 8. Reconciliation strategy

Read-only helpers (no production HTTP):

- `calculateLedgerStock(productId)` → `SUM(quantity_delta)` post-migration
- `compareCurrentStockToLedger(productId)` → current vs latest `stock_after`

Future tooling can deepen baseline reconciliation.

## 9. Why product stock remains

Compatibility + performance. POS/orders continue using `products.stock_quantity`. Ledger explains *how* stock changed after v75.

## 10. Future extraction implications

Inventory is closer to a Lego module: service + durable history. Remaining coupling: stock columns on `products`, product CRUD still writing stock outside ledger, no movement UI/API.

## Schema

```sql
inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  movement_type TEXT NOT NULL CHECK (...),
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  stock_after REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
)
```

Indexes: `(product_id, created_at)`, `(reference_type, reference_id)`, `(created_at)`.

## API / Frontend

- **New HTTP API:** none
- **Frontend:** unchanged

## Related

- [phase-2.7-domain-boundaries.md](phase-2.7-domain-boundaries.md)
- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)
