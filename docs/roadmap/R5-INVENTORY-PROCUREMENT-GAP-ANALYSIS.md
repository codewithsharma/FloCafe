# R5 Inventory & Procurement — Gap Analysis

**Date:** 2026-08-21  
**Product brand:** Operavia (not “Opervia”)  
**Audit type:** Code-as-truth (roadmap is secondary)  
**Scope name clash:** User program “R5 Inventory & Procurement” maps to already-shipped waves **R4 Inventory + R5 BOM/Recipes + R6 Purchasing**, plus P5/P16/P17 hardenings.

---

## Baseline

| Field                   | Value                                           |
| ----------------------- | ----------------------------------------------- |
| Branch                  | `restaurant-vertical`                           |
| Product eng tip         | **`b236ef0`**                                   |
| Current HEAD (docs tip) | `c5b5225` (docs-only; product code ≡ `b236ef0`) |
| Schema                  | **v88**                                         |
| Package                 | **3.0.5**                                       |
| Working tree at audit   | Clean vs origin                                 |

**Protected:** OPS-02 / P13–P18 hardening, order/payment idempotency, KDS outbox, recovery, RBAC, SQLite SoR.  
**Deferred:** Apple signing, QR-ORD-IDEM, multi-location (Frozen).

---

## Naming map

| User / 405-roadmap label         | Operavia wave / code    | Status                |
| -------------------------------- | ----------------------- | --------------------- |
| Inventory OS / stock ledger      | R4 + P16                | **COMPLETE**          |
| Recipes / ingredient consumption | R5 + P17                | **COMPLETE**          |
| Procurement / PO / receiving     | R6                      | **COMPLETE**          |
| Auto-86                          | P5 INV-AUTO-86          | **COMPLETE**          |
| Stock transfer / multi-location  | Matrix Planned / Frozen | **DEFERRED / FROZEN** |

**Do not rebuild** R4/R5/R6. Prefer thin deepen of PARTIAL / MISSING rows whose dependencies are satisfied.

---

## Feature gap matrix

| Feature                                    | ID        | Current State         | Existing Code                                                          | Gap                                               | Priority        | Dependencies     |
| ------------------------------------------ | --------- | --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- | --------------- | ---------------- |
| SKU on-hand qty + track flag               | INV-01    | **COMPLETE**          | `products.stock_quantity`, `track_inventory`; Inventory service        | —                                                 | —               | —                |
| Append-only stock ledger                   | INV-02    | **COMPLETE**          | `inventory_movements` v75; all stock writers in `inventory.ts`         | Typed `movement_type` expansion deferred          | P3              | —                |
| Manual stock adjust + Idempotency-Key      | INV-03    | **COMPLETE**          | `POST /products/:id/stock`; `stock_adjust_idempotency`                 | —                                                 | —               | —                |
| Wastage decrease                           | INV-WASTE | **COMPLETE**          | `action=wastage` / `wastage:*` reasons; phase-4.15                     | Dedicated waste report UI/CSV                     | P3              | INV-02           |
| Units allowlist + convert                  | INV-UNITS | **COMPLETE**          | `inventory-units.ts`                                                   | Cross-family convert; UoM table                   | P3              | —                |
| Physical counts                            | INV-05/06 | **COMPLETE**          | `inventory_counts*`; apply via `count_variance`                        | Count apply Idempotency-Key                       | P3              | INV-03           |
| Low-stock hub                              | INV-LOW   | **COMPLETE**          | `?low_stock=true`; `/products/low-stock`                               | —                                                 | —               | —                |
| On-hand valuation                          | INV-07    | **COMPLETE**          | Valuation report; catalog cost×qty                                     | WAC/FIFO                                          | DEFERRED        | Catalog cost     |
| Movements UI                               | INV-MOV   | **COMPLETE**          | `/products/movements`                                                  | CSV export                                        | P2              | INV-02           |
| Ledger reconstruct API                     | INV-CHECK | **COMPLETE**          | `GET …/ledger-check`                                                   | UI surface                                        | P2              | INV-02           |
| Auto-86 from stock/recipe                  | INV-09    | **COMPLETE**          | v88 flags; `notifyStockChanged`                                        | Catalog WS push; modifier 86                      | P3              | INV + recipes    |
| Manual 86                                  | INV-86    | **COMPLETE**          | `POST …/availability`; PUT `is_active` via availability (P16)          | Matrix POS/Menu rows still say Planned (doc lag)  | Doc             | —                |
| Sale decrement CAS                         | INV-SALE  | **COMPLETE**          | P16 CAS floor                                                          | Relies on order idempotency (P18)                 | —               | Orders           |
| Cancel / void / refund stock policy        | INV-POL   | **COMPLETE** (policy) | Full cancel restore; partial/void/restaurant refund asymmetries tested | Policy change only if authorized                  | —               | Orders           |
| Recipe/BOM CRUD                            | RCP-01    | **COMPLETE**          | `recipes`, `recipe_ingredients` v79                                    | Soft FK ingredient→products                       | P2              | Products         |
| Recipe consume on create/add/QR            | RCP-03    | **COMPLETE**          | In order `withTxn`; ledger `recipe_consumption`                        | Inactive ingredient consume vs cost inconsistency | P2              | INV + orders     |
| Cancel recipe reverse                      | RCP-REV   | **COMPLETE**          | Idempotent reverse                                                     | Partial cancel / refund reverse = policy          | —               | —                |
| Food cost cents + prefer cost_cents        | RCP-04    | **COMPLETE**          | `recipe-cost.ts`; P17                                                  | WAC/FIFO                                          | DEFERRED        | —                |
| Food-cost period report                    | RPT-FC    | **COMPLETE**          | R9.6 theoretical COGS                                                  | Actual vs theoretical BI                          | DEFERRED        | RCP              |
| Consumptions API                           | RCP-05a   | **COMPLETE**          | `GET /api/recipes/consumptions`                                        | —                                                 | —               | —                |
| Consumptions list UI / consumption reports | RCP-05    | **COMPLETE**          | `/products/recipes/consumptions`; O/M + inventory gate                 | Advanced actual-vs-theoretical BI still Later     | —               | RCP-05a          |
| Addon/modifier BOM                         | RCP-ADDON | **MISSING**           | Price-only addons                                                      | New design                                        | DEFERRED        | Auth required    |
| Suppliers CRUD                             | PRC-01    | **COMPLETE**          | `suppliers`; API + UI create/deactivate                                | Edit/reactivate UI                                | P2              | —                |
| Supplier↔SKU mappings                      | PRC-02    | **COMPLETE**          | `supplier_products`                                                    | Mapping deactivate API/UI                         | P3              | —                |
| Purchase orders lifecycle                  | PRC-03    | **COMPLETE**          | draft→ordered→partial→received; cancel rules                           | Draft line amend                                  | **P1 deepen**   | Suppliers        |
| Partial/full receive → stock               | PRC-04    | **COMPLETE**          | `applyPurchaseReceiptStock`; idempotency                               | Reject non-tracked at PO create                   | P2              | INV              |
| Last purchase cost update                  | PRC-05    | **COMPLETE**          | REAL + cost_cents on receive                                           | WAC/FIFO                                          | DEFERRED        | —                |
| Draft PO line edit                         | PRC-DRAFT | **MISSING**           | Create-only lines                                                      | PATCH lines before ordered                        | **P1 deepen**   | PRC-03           |
| Purchase returns                           | PRC-RET   | **MISSING**           | —                                                                      | Thin return slice                                 | DEFERRED        | Auth             |
| Auto-reorder                               | PRC-REO   | **DEFERRED**          | —                                                                      | Later                                             | Later           | Demand data      |
| Stock transfer                             | INV-XFER  | **DEFERRED**          | Matrix Planned                                                         | Single-location only                              | Frozen-adjacent | Multi-loc Frozen |
| Expiry tracking                            | INV-EXP   | **DEFERRED**          | Matrix Planned                                                         | —                                                 | Later           | —                |
| Multi-location inventory                   | INV-ML    | **DEFERRED**          | Capability Frozen                                                      | Do not start                                      | Frozen          | —                |

---

## Dependency map

```text
products (catalog + stock cache)
    ↑
inventory.ts (sole stock writer) → inventory_movements
    ↑                    ↑                    ↑
sale/cancel          recipe consume        PO receive
(orders P18)         (R5 + P17)            (R6)
    ↑
auto-86 (P5) ← notifyStockChanged

UI hubs: /products/{low-stock,counts,movements,valuation,recipes,purchasing}
```

**Satisfied for next deepen:** Inventory SoR, recipe consumptions API, purchasing PO create/receive.

**Blocked without authorization:** multi-location, transfers, WAC engine, addon BOM, QR-ORD-IDEM, signing.

---

## Architecture findings

1. **SQLite SoR** — All inventory mutations go through `main/services/inventory.ts`; ledger append-only.
2. **Atomicity** — Order create/add/QR: menu decrement + recipe consume in same `withTxn`. Receive: stock + ledger + cost update in purchasing/inventory path.
3. **Idempotency** — Adjust + receive keyed; recipe per `order_item_id`; sale via order keys (P18).
4. **RBAC** — Owner/Manager mutate; chef often API-read only; FE redirects.
5. **CI gap** — Deep `test:r4` / `test:r5` / `test:r6` largely **extended**; P16/P17/inv-auto-86 in merge.
6. **Doc lag** — POS/Menu 86 still Planned in matrix; Inventory Auto-86 Existing. R4 “remaining gaps” doc stale vs R5/R6/P5.

---

## Critical gaps (not rebuilds)

| Priority         | Gap                                            | Why it matters                                           |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------- |
| **P1**           | Draft PO line amend                            | Forces cancel+recreate; ops friction on core procurement |
| **P2**           | Movements CSV / ledger-check UI                | Ops/audit export                                         |
| **P2**           | Soft FK on recipe ingredients                  | Integrity                                                |
| **P2**           | Supplier edit/reactivate UI                    | API ahead of UI                                          |
| **P3**           | Promote r4/r5/r6 suites to merge               | Regression signal                                        |
| **Frozen/Later** | Transfer, expiry, multi-loc, WAC, auto-reorder | Do not start                                             |

No inventory **P0** integrity hole found post-P16/P17 for the shipped core paths.

---

## Recommended first feature

### Feature: Recipe consumptions list UI (RCP-05 thin) — **SHIPPED**

| Field            | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| **Status**       | **COMPLETE** — `/products/recipes/consumptions`; `listRecipeConsumptions`; filters `order_id` + `limit` |
| **Out of scope** | Actual-vs-theoretical BI, addon BOM, WAC, transfers, QR-ORD-IDEM                                        |

### Next deepen candidate

**Draft PO line amend (PRC-DRAFT)** — procurement UX; draft lines still cancel+recreate.

---

## Proposed implementation (recommendation only — not started)

Superseded by RCP-05 ship: FE at `/products/recipes/consumptions`; API unchanged; schema still v88.

---

## Recommendation

```text
PROCEED — authorize next deepen (draft PO line amend) when ready
```

**Do not** start multi-location, transfers, signing, or QR-ORD-IDEM.  
**Do not** rebuild Inventory/Recipe/Purchasing OS — deepen only.
