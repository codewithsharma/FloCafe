# R4 — Inventory OS

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v78 (`inventory_unit`, `stock_adjust_idempotency`, `inventory_counts` / `inventory_count_lines`)  
**Baseline:** R3 `d62d21d` on `restaurant-vertical`  
**Suite:** `npm run test:r4` (S-INV + units + reconstruct + counts)

---

## Architecture

Inventory is an independent SKU foundation. Future chain:

```
MENU → ORDER → KITCHEN → RECIPE/BOM (R5) → INVENTORY
INVENTORY ↔ PURCHASING (R6)
```

**R4 does NOT auto-decrement inventory from POS/KDS via BOM.**  
Sale decrement of **tracked sellable SKUs** on order create remains Existing (not ingredient explode). Count/adjust/wastage are explicit manual mutations.

SQLite SoR. Offline-first. Valuation is catalog cost × qty — not accounting COGS.

---

## Inventory model

Sellable identity = `products` row (ADR-013).

| Field                   | Role                                   |
| ----------------------- | -------------------------------------- |
| `sku` / name / category | Identity                               |
| `track_inventory`       | Opt-in stock tracking                  |
| `stock_quantity`        | Runtime cache                          |
| `cost`                  | Catalog unit cost (valuation)          |
| `low_stock_threshold`   | Reorder attention                      |
| `inventory_unit`        | R4 display/adjust unit (default `pcs`) |
| `is_active`             | Soft lifecycle                         |

No hard-coded café SKUs.

---

## Units

Allowed: `pcs`, `box`, `pack`, `kg`, `g`, `L`, `ml`.

| Family | Conversion                                 |
| ------ | ------------------------------------------ |
| count  | same-unit only (no pcs↔box silent convert) |
| mass   | 1 kg = 1000 g                              |
| volume | 1 L = 1000 ml                              |

Cross-dimension (e.g. kg→ml) → **400**. Service: `main/services/inventory-units.ts`.

Stock quantity remains `REAL` for compatibility with existing sale path; milli-unit integer math used inside conversions where applicable. Full integer stock migration = remaining gap.

---

## Stock ledger

Append-only `inventory_movements` (v75 CHECK unchanged):

| movement_type    | Use                                                                            |
| ---------------- | ------------------------------------------------------------------------------ |
| `sale`           | Order create / add-items                                                       |
| `cancel_restore` | Order cancel restock                                                           |
| `adjustment`     | Manual set/increase/decrease, wastage, opening, count variance, refund restock |

Every stock write records a movement (zero-delta skipped). Dual model: `stock_quantity` cache + ledger history.

---

## Adjustments

`POST /api/products/:id/stock` `{ action, quantity, wastage_reason?, inventory_unit? }`

- Actions: `set` | `increase` | `decrease` | `wastage`
- **Mandatory `Idempotency-Key`** — replay safe; different body → 409
- Owner/manager only
- Audits: `inventory.stock_adjusted` / `inventory.wastage`

---

## Wastage

SKU wastage via `action=wastage` → `adjustment` + reason `wastage` or `wastage:SPOILAGE|DAMAGED|EXPIRED|SPILLAGE|OTHER`.

Not ingredient waste. Not BOM consumption.

---

## Low stock

`stock_quantity <= low_stock_threshold` for tracked products. Hub: `/products/low-stock`. No auto-PO.

---

## Valuation

`GET /api/reports/inventory-valuation` — catalog `cost` × `stock_quantity`. Not WAC/FIFO/COGS.

---

## Stock count

Workflow: draft → lines (system snapshot + counted qty + variance) → submit → apply.

Apply uses `adjustProductStock` **set** with reason `count_variance` (ledger evidence). Never silent overwrite.

APIs under `/api/inventory/counts*`. UI: `/products/counts`.

---

## Ledger reconstruction (mandatory)

`reconstructQuantityFromLedger`:

- opening = first movement `stock_after - quantity_delta` (or current if empty)
- reconstructed = opening + Σ deltas
- must equal `products.stock_quantity`

`GET /api/inventory/products/:id/ledger-check`. Proven in S-INV-10 / `test:r4`.

---

## RBAC

| Action                                           | Roles             |
| ------------------------------------------------ | ----------------- |
| Adjust / wastage / count / valuation / movements | owner, manager    |
| Cashier / waiter / chef                          | no stock mutation |

---

## Offline / concurrency

Local SQLite mutations; no cloud gate. Concurrent adjusts with different keys both apply. Idempotent retries do not double-apply. SQLite txn boundaries.

---

## POS / KDS boundary

| Allowed today                              | Forbidden until R5             |
| ------------------------------------------ | ------------------------------ |
| Tracked SKU sale decrement on order create | Ingredient/BOM explode         |
| Cancel restore                             | Auto depletion from recipes    |
| Explicit adjust/wastage/count              | Hidden menu→inventory coupling |

---

## Tests

```sh
npm run test:r4
```

Covers units, reconstruct, idempotency, wastage, counts, RBAC, schema v78.  
Regression: `test:r1`–`test:r3`, `test:h1`–`test:h4`, `test:phase-4.15`, `test:inventory-ledger`.

---

## Remaining gaps

- Integer-only stock storage migration
- Ingredient inventory / BOM / recipes (R5)
- Purchasing / suppliers / PO (R6)
- Multi-location transfer (Frozen)
- Expiry tracking, food-cost %, auto-86-from-stock
- Full stocktake UX polish (foundation shipped)

---

## Out of scope

R5 BOM/recipes, R6 purchasing, multi-location, Retail, Phase 4.16, payment/tender mixing, cloud dependency.

---

## Key files

| Path                               | Role                            |
| ---------------------------------- | ------------------------------- |
| `main/services/inventory.ts`       | Stock writes + reconstruct      |
| `main/services/inventory-units.ts` | Unit conversion                 |
| `main/services/inventory-count.ts` | Count workflow                  |
| `main/routes/products.ts`          | Idempotent stock adjust         |
| `main/routes/inventory.ts`         | Movements, counts, ledger-check |
| `tests/r4-inventory-os.test.ts`    | S-INV suite                     |
