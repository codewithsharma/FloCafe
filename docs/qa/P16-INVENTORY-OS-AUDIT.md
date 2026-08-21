# P16 — Inventory OS Audit

**Status:** COMPLETE (audit) · **Implementation:** COMPLETE — see `docs/qa/P16-INVENTORY-OS-IMPLEMENTATION-REPORT.md`  
**Date:** 2026-08-21  
**Baseline:** P15 COMPLETE (`40f5fb9` / hash note `e1be5f8`)  
**Branch:** `restaurant-vertical`  
**Schema tip:** **v88** (`inv_auto_86_availability_flags`)  
**Live pilot:** NO-GO (unchanged)

### Implementation status (2026-08-21)

| Gap                                  | Status                                    |
| ------------------------------------ | ----------------------------------------- |
| GAP-001 sale CAS floor               | **Fixed**                                 |
| GAP-002 cancel/void/refund policy    | **Encoded in tests** (behavior preserved) |
| GAP-003 PUT is_active ↔ 86 flags     | **Fixed**                                 |
| GAP-004/005 count + opening audits   | **Fixed**                                 |
| GAP-006 typed ledger                 | **Deferred** (documented)                 |
| GAP-007 REAL precision               | **Accepted** + CAS boundary tests         |
| GAP-008 reserved_qty                 | **Deferred**                              |
| GAP-009/010 export / ledger-check UI | **Deferred**                              |
| GAP-011 CI tier promote              | **Deferred** (p16 suite covers races)     |
| GAP-012 docs drift                   | **Addressed** in inventory notes          |

Suite: `npm run test:p16`.

---

## Executive Summary

Inventory OS is **largely already shipped** under R4 (stock/ledger/counts/wastage), R5 (BOM/recipes/consumption), R6 (suppliers/PO/receiving), P5 (auto-86), Phase 4.11 (valuation), and Phase 4.15 (wastage UX). The capability matrix already marks most Inventory rows **🟢 Existing**.

**P16 must not rebuild Inventory OS.** Treat P16 as a **hardening / gap-closure** wave against concrete integrity, audit, concurrency, and documentation gaps — while preserving P13–P15 controls and leaving Planned rows (stock transfer, expiry, deep consumption BI) out of scope unless explicitly authorized.

Highest-signal findings:

1. **Stock is reserved at order create/add-items**, not at payment. Payment never mutates inventory.
2. **Categorical accounting identity** (`Opening + Receipts − Consumption − Waste ± Adj = Stock`) is **not DB-guaranteed** — ledger has only three `movement_type` values; Opening/Receipt/Waste are `reason` conventions on `adjustment`.
3. **Sale decrement race:** `assertStockAvailable` then UPDATE **without** `stock_quantity >= ?` floor (unlike manual adjust) — concurrent oversell can go negative.
4. **Partial pending cancel does not restore stock** (documented asymmetry); void = write-off; restaurant refund restock is vertical-gated off.
5. **PUT `/api/products/:id` can set `is_active`** without updating P5 `manual_unavailable` / `auto_unavailable` flags.
6. Frontend inventory admin surfaces are **Owner/Manager production-ready**; chef has API read for recipes/purchasing but no GUI.

---

## Current Baseline

| Field            | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Git branch       | `restaurant-vertical`                                                                      |
| Working tree     | clean                                                                                      |
| Recent commits   | `e1be5f8` P15 hash note → `40f5fb9` P15 → `490df66`/`06d451d` P14                          |
| Schema           | **v88**                                                                                    |
| P15              | Sensitive-action controls COMPLETE — do not weaken                                         |
| Matrix Inventory | Mostly Existing; Planned: transfer, expiry, consumption reports; Later: demand forecasting |

---

## Inventory Capability Matrix

Legend: 🟢 EXISTING · 🟡 PARTIAL · 🔴 MISSING · ⚫ BROKEN · 🔵 OUT OF SCOPE (later phase / Planned)

| Capability                               | Status | Evidence                                                                                      | Risk                          | Recommendation                                        |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Inventory items (SKU = `products`)       | 🟢     | `products.track_inventory`, `stock_quantity`, `inventory_unit`                                | Low                           | Reuse; do not invent second master table              |
| Categories                               | 🟢     | `categories` + product FK                                                                     | Low                           | Reuse                                                 |
| Units of measure                         | 🟡     | Free TEXT + app allowlist (`pcs\|box\|pack\|kg\|g\|L\|ml`); no UoM table                      | Med                           | Keep app allowlist; optional UoM table is later       |
| Unit conversions                         | 🟡     | App milli-unit convert then REAL (`inventory-units.ts`)                                       | Med                           | Harden precision only if in P16 scope                 |
| Cost price                               | 🟡     | `cost` REAL + `cost_cents` dual-write (v81)                                                   | Med                           | Prefer cents for valuation math; don’t redesign money |
| Stock thresholds / low-stock             | 🟢     | `low_stock_threshold` + `?low_stock=true` + `/products/low-stock`                             | Low                           | “Alerts” = hub/filter, not push notify                |
| Opening stock                            | 🟡     | Product create → `applyAbsoluteStockChange` reason `opening` (ledger yes, **no audit_logs**)  | Med                           | Audit + prefer `/stock` path                          |
| Stock receipt                            | 🟢     | R6 receive → `adjustment`/`purchase_receipt`                                                  | Low                           | Existing                                              |
| Stock issue / consumption (sale)         | 🟢     | Order create `sale` + R5 recipe consume                                                       | High residual race            | Floor UPDATE on sale                                  |
| Stock adjustment                         | 🟢     | `POST /products/:id/stock` + idempotency                                                      | Low                           | Existing                                              |
| Stock waste                              | 🟢     | `action=wastage` + reason allowlist                                                           | Low                           | SKU wastage, not ingredient waste OS                  |
| Stock return                             | 🟡     | Retail refund restock only; restaurant 403                                                    | Med                           | Document; don’t silently enable restaurant restock    |
| Stock transfer                           | 🔵     | Matrix Planned; no routes                                                                     | —                             | Out of P16 unless authorized                          |
| Stock count / reconcile                  | 🟢     | `inventory_counts` draft→submit→apply                                                         | Med                           | Audit lifecycle gaps                                  |
| Current quantity                         | 🟢     | `products.stock_quantity` cache                                                               | Med                           | Continuous ledger reconstruct exists                  |
| Reserved quantity                        | 🔴     | No reservation model (stock deducted at order open)                                           | High product semantics        | Explicit policy docs; optional reserve later          |
| Average cost / valuation                 | 🟢     | `/api/reports/inventory-valuation` + UI                                                       | Med                           | Catalog cost×qty, not moving-average ledger           |
| Movement history                         | 🟢     | `inventory_movements` + `/products/movements`                                                 | Low                           | Per-product UI                                        |
| Negative-stock rules                     | 🟡     | Check blocks; sale UPDATE race can go negative                                                | **P0**                        | CAS floor on sale decrement                           |
| Adjustment authorization                 | 🟢     | O/M `requireRole`; P15 patterns intact                                                        | Low                           | Preserve                                              |
| Audit trail                              | 🟡     | Adjust/wastage/count_apply/recipe/PO audited; openings/count draft/sale SKU not in audit_logs | Med                           | Close selective gaps                                  |
| Idempotency                              | 🟡     | Adjust + receive + recipe consume strong; SKU sale relies on order key                        | Med                           | Optional sale-line key later                          |
| Concurrency                              | 🟡     | Adjust has floor; sale does not                                                               | **P0**                        | Fix sale UPDATE                                       |
| Recipe / BOM                             | 🟢     | R5 tables + UI `/products/recipes`                                                            | Low                           | P17 deepen; P16 preserve boundary                     |
| Ingredient deduction                     | 🟢     | Consume at create; reverse on full cancel                                                     | High partial-cancel asymmetry | Document / optional restore policy                    |
| Suppliers / PO / receive                 | 🟢     | R6 `/api/purchasing`                                                                          | Low                           | Full procurement deepen later                         |
| Purchase returns                         | 🔴/🔵  | No return flow                                                                                | —                             | Later procurement                                     |
| Auto-86                                  | 🟢     | P5 v88 flags + `notifyStockChanged`                                                           | Med                           | Fix PUT `is_active` bypass                            |
| Manual 86                                | 🟢     | `POST …/availability`                                                                         | Med                           | Same PUT bypass                                       |
| Stock transfer / expiry / consumption BI | 🔵     | Planned                                                                                       | —                             | Not P16 rebuild                                       |
| Demand forecasting                       | 🔵     | Later                                                                                         | —                             | Frozen from P16                                       |
| Inventory CSV export                     | 🔴     | No export routes found                                                                        | Low                           | Optional thin export                                  |
| Ledger-check UI                          | 🟡     | API exists; no GUI                                                                            | Low                           | Optional FE                                           |
| Addon/modifier inventory                 | 🔴/🔵  | Explicit non-goal (R5/ADR-013)                                                                | —                             | P17+                                                  |

---

## Database Audit

### Schema tip

- Last migration: **v88** `inv_auto_86_availability_flags` (`main/database/migrations.ts`)
- `getSupportedSchemaVersion()` → last `MIGRATIONS` entry → **88**

### Inventory-related tables

| Table                                                                    | Introduced                                | Role                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------- |
| `products` stock columns                                                 | v1 (+ `inventory_unit` v78; 86 flags v88) | On-hand **cache**                                               |
| `inventory_movements`                                                    | **v75**                                   | Append-only ledger (`sale` \| `cancel_restore` \| `adjustment`) |
| `stock_adjust_idempotency`                                               | v78                                       | Adjust idempotency                                              |
| `inventory_counts` / `_lines`                                            | v78                                       | Physical counts                                                 |
| `recipes` / `recipe_ingredients` / `recipe_consumptions` / `_lines`      | v79                                       | BOM + consume snapshots                                         |
| `suppliers` / `supplier_products` / `purchase_orders` / lines / receipts | v80                                       | Procurement                                                     |
| `purchase_receive_idempotency`                                           | v80                                       | Receive idempotency                                             |
| Wastage / UoM                                                            | —                                         | **Not tables** (app conventions)                                |

### Integrity notes

- Single-store SQLite; **no tenant/location** columns on inventory tables (correct for current product; unsafe for multi-location without redesign).
- Incomplete FKs on some count/recipe/receipt cross-refs.
- Ledger **not** in `createSchema()`; depends on migration replay through v75 (fresh installs still migrate).
- Soft-delete: products `deleted_at`; counts via status; movements append-only by convention.

### Stock equation guarantee

**Can `Opening + Receipts − Consumption − Waste ± Adjustments = Current Stock` be DB-guaranteed?**

**NO.**

Reasons:

1. CHECK allows only `sale | cancel_restore | adjustment`.
2. Opening / purchase_receipt / wastage / count_variance / recipe_* are **`reason` strings** on `adjustment` (or separate `sale`).
3. `stock_quantity` is a mutable cache; no trigger forces every UPDATE through the ledger.
4. Pre-v75 history is empty by design.
5. Continuous reconstruct (`opening_inferred + ΣΔ ≈ stock_quantity` to ~6 dp) can hold **if** all writers use Inventory services — different from the named categorical equation.

### Quantity / cost precision

| Domain           | Representation                   | Risk                                   |
| ---------------- | -------------------------------- | -------------------------------------- |
| Qty              | **REAL** end-to-end              | Float drift; equality via `toFixed(6)` |
| Money (product)  | REAL + optional INTEGER cents    | Dual-write incomplete cutover          |
| Purchasing costs | INTEGER cents                    | Safer                                  |
| Unit convert     | Integer milli-units → REAL again | Bounded but not eliminated             |

---

## Backend Audit

### Core modules

| Area                    | Path                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory service       | `main/services/inventory.ts`                                                                                                             |
| Units / wastage reasons | `main/services/inventory-units.ts`                                                                                                       |
| Counts                  | `main/services/inventory-count.ts`                                                                                                       |
| Availability / auto-86  | `main/services/product-availability.ts`                                                                                                  |
| Recipes                 | `main/services/recipe.ts`, `recipe-consumption.ts`                                                                                       |
| Purchasing              | `main/services/purchasing.ts`                                                                                                            |
| Routes                  | `main/routes/inventory.ts`, `products.ts` (`/stock`, `/availability`), `recipes.ts`, `purchasing.ts`, `reports.ts` (valuation/food-cost) |
| Mount                   | Module `inventory` in `main/routes/index.ts`                                                                                             |

### Mutation patterns (summary)

| Mutation                      | Roles             | withTxn                    | Audit                                                           | Idempotency                 |
| ----------------------------- | ----------------- | -------------------------- | --------------------------------------------------------------- | --------------------------- |
| Stock adjust / wastage        | O/M               | Yes                        | `inventory.stock_adjusted` / `.wastage`                         | Required key                |
| Count apply                   | O/M               | Yes                        | `inventory.count_applied`                                       | No                          |
| Count create/submit/cancel    | O/M               | Partial                    | **None**                                                        | No                          |
| Manual availability           | O/M               | Yes                        | `product.availability`                                          | No                          |
| Recipe CRUD / consume         | O/M (+ chef read) | Yes (consume in order txn) | recipe + `inventory.recipe_*`                                   | Consume per `order_item_id` |
| PO receive                    | O/M               | Yes                        | receipt events                                                  | Required key                |
| Sale decrement                | Order roles       | Order txn                  | Ledger only (no audit_logs for SKU sale)                        | Order key optional          |
| Product PUT stock / is_active | O/M               | Yes                        | Ledger for stock; **no** inventory audit; is_active bypass risk | No                          |

Server is authoritative for adjust/receive/count/availability. Client actor spoofing is not used for inventory audits (JWT).

---

## POS → Inventory Flow

```text
Cart / held order     → NO stock mutation
Order create/add-items → YES: SKU sale + R5 recipe consume (same withTxn)
Payment (incl. fail/partial) → NO stock mutation
Status → completed     → NO stock mutation
Full cancel / last-item collapse → YES restore SKU + reverse recipe
Partial pending cancel → NO restore (stock stays reserved)
Void preparing/ready   → NO restore (write-off)
Refund money           → NO restock
Refund restock API     → retail/retail-test only; SKU only; not recipe
```

Evidence anchors:

- Decrement at create: `main/routes/orders/create.ts` (~351–362)
- Payment owns no inventory: `main/services/payment-tender.ts`
- Sale UPDATE without floor: `main/services/inventory.ts` `decrementTrackedStock` (~272–288)
- Adjust WITH floor: same file (~489–492)
- Restaurant restock gated: `main/routes/refund-restock.ts`

| Question                     | Verdict                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| Selling affects inventory?   | **YES** — at order create/add-items                              |
| Transactional with payment?  | **NO** — with order write only                                   |
| Failed payment consume?      | **NO additional** — already consumed                             |
| Retry double-consume?        | **PARTIAL** — recipe + order idempotency; SKU not per-line keyed |
| Refund restore (restaurant)? | **NO**                                                           |
| Cancel restore?              | **PARTIAL** — full/last-item yes; partial/void no                |
| Insufficient stock?          | **BLOCK 400** (pre-check)                                        |
| Negative allowed?            | **Intent NO**; race can still go negative                        |
| Audit trail?                 | Ledger yes; recipe audit_logs yes; SKU sale audit_logs no        |

---

## Product / Ingredient Architecture

```text
categories
   └── products (sellable SKU and/or ingredient SKU — same table)
         ├── track_inventory + stock_quantity (optional)
         ├── optional active recipe (recipes.product_id, one active)
         │     └── recipe_ingredients → ingredient_product_id → products
         └── order_items
               ├── decrementTrackedStock (if tracked) → movement sale
               └── consumeRecipeForOrderItem → adjustment / recipe_consumption
```

| Concept                   | Model                                          |
| ------------------------- | ---------------------------------------------- |
| Sellable item             | `products`                                     |
| Stock-tracked item        | `products.track_inventory=1`                   |
| Ingredient                | Also `products` (no separate inventory entity) |
| Composite / recipe-driven | Active `recipes` row                           |
| Addon / modifier stock    | **Not modeled** (price only)                   |

P17 may deepen recipe/food-cost; P16 must preserve this boundary and not invent a parallel ingredient master.

---

## Frontend / UX Audit

| Surface                         | Route                  | Readiness                                        |
| ------------------------------- | ---------------------- | ------------------------------------------------ |
| Products + stock adjust/wastage | `/products`            | Production-ready (O/M)                           |
| Low-stock hub                   | `/products/low-stock`  | Production-ready                                 |
| Movements                       | `/products/movements`  | Production-ready (per product; no CSV)           |
| Counts                          | `/products/counts`     | Production-ready                                 |
| Recipes                         | `/products/recipes`    | Production-ready (O/M GUI)                       |
| Purchasing                      | `/products/purchasing` | Production-ready (O/M GUI)                       |
| Valuation                       | `/products/valuation`  | Thin but usable (not on `/reports`)              |
| Dedicated waste report          | —                      | Missing (wastage via adjust dialog)              |
| Ledger-check UI                 | —                      | API only                                         |
| Chef inventory GUI              | —                      | Missing (API read exists for recipes/purchasing) |

No stub placeholder pages found for core inventory admin. Gaps are missing secondary surfaces, not empty shells.

---

## RBAC Audit

| Capability                               | Owner | Manager | Cashier | Waiter | Chef       |
| ---------------------------------------- | ----- | ------- | ------- | ------ | ---------- |
| View inventory admin UI                  | Y     | Y       | N       | N      | N          |
| View products API (POS)                  | Y     | Y       | Y       | Y      | Y          |
| Adjust / wastage                         | Y     | Y       | N       | N      | N          |
| Counts / receive / valuation / food-cost | Y     | Y       | N       | N      | N          |
| Recipes/purchasing **API read**          | Y     | Y       | N       | N      | **Y**      |
| Recipes/purchasing **GUI**               | Y     | Y       | N       | N      | **N**      |
| Export inventory CSV                     | —     | —       | —       | —      | — (absent) |

**Mismatch:** Chef API read without GUI (documented in FEATURE-INVENTORY as API-true). Not a security hole (mutate still O/M).

Server `requireRole` remains authoritative; GUI hide is not security.

---

## Audit Logging Audit

| Event                       | Audited?                                  | In txn with mutation?              |
| --------------------------- | ----------------------------------------- | ---------------------------------- |
| Stock adjust / wastage      | Yes                                       | Yes                                |
| Count applied               | Yes                                       | Yes                                |
| Count create/submit/cancel  | **No**                                    | —                                  |
| Recipe consume/restore      | Yes                                       | Yes (order txn)                    |
| PO create/status/receive    | Yes                                       | Yes (mutations)                    |
| Supplier CRUD               | Yes                                       | Best-effort (no outer txn on some) |
| Product opening / PUT stock | Ledger only                               | —                                  |
| SKU sale / cancel_restore   | Ledger only                               | Order txn                          |
| Auto-86                     | `product.availability` (actor often null) | Caller txn                         |
| Inventory export            | N/A (no export)                           | —                                  |

**P15 sanitizer lesson:** Inventory metadata keys used today (`wastage_reason`, `product_id`, `quantity`, etc.) are **not** stripped. Only keys matching `/pin|token|…/` are removed (with `pin_approved_by` allowlisted). Future inventory keys must avoid sensitive substrings or be allowlisted.

---

## Test Coverage

| Area                                    | Suites                                                                                            | Class                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Boundary / ledger / void-cancel stock   | `inventory-boundary`, `inventory-ledger`, `order-void-cancel-stock`, `product-inventory-boundary` | PASS (merge/critical)                            |
| Adjust / wastage / counts               | `test:r4`, `phase-4.15-wastage`, UI contract tests                                                | PASS API; GUI mostly static (**PARTIAL**)        |
| Auto-86                                 | `test:inv-auto-86`                                                                                | PASS (merge)                                     |
| Recipes / purchasing                    | `test:r5`, `test:r6`                                                                              | PASS API (**extended** tier — not default merge) |
| Valuation / low-stock / food-cost       | phase-4.11, 4.3, r9.6                                                                             | PASS/PARTIAL; often **extended**                 |
| Inventory CSV / waste report / chef GUI | —                                                                                                 | NOT TESTED / absent                              |
| Sale UPDATE race (negative stock)       | —                                                                                                 | **NOT TESTED** as concurrent CAS                 |

**Risk:** Deep R4/R5/R6 proofs live largely in **extended** CI; merge still covers boundary/ledger/auto-86.

---

## Reliability / Offline Audit

| Scenario                 | Current behavior                                    | Gap                                                                                         |
| ------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Duplicate adjust/receive | Idempotency keys prevent double apply               | Sale SKU relies on order idempotency                                                        |
| Concurrent adjust        | Floor `stock_quantity >= ?`                         | Sale path lacks floor                                                                       |
| Concurrent sale oversell | Pre-check then non-CAS UPDATE                       | **P0 race**                                                                                 |
| Crash mid-txn            | SQLite `withTxn` rolls back                         | OK for in-txn writers                                                                       |
| Offline POS              | Electron local SQLite SoR; no remote inventory sync | Offline “sync conflict” N/A for single-node; multi-device LAN shares one DB when configured |
| Recovery                 | Reconstruct helpers + ledger-check API              | No FE; continuous not categorical                                                           |

P14 conflict hardening applies to **order status / payment complete**, not inventory qty CAS on sale.

---

## Reporting Audit

| Report              | Exists?                                                      | Notes                           |
| ------------------- | ------------------------------------------------------------ | ------------------------------- |
| On-hand / low-stock | Yes                                                          | Ops UIs                         |
| Movements           | Yes                                                          | Per product; no CSV             |
| Valuation           | Yes                                                          | Catalog cost×qty                |
| Food-cost %         | Yes                                                          | R9.6 theoretical COGS           |
| Waste report        | No dedicated                                                 | Filter movements by reason only |
| Variance report     | Count UI only                                                | No BI report                    |
| Consumption BI      | API consumptions list; matrix **Planned** for deeper reports | Out of scope rebuild            |
| Inventory export    | No                                                           | Gap                             |

Do not duplicate settlement/reporting engines; extend existing report patterns if authorized.

---

## Architectural Risks

| ID     | Risk                                                                                | Rank                  |
| ------ | ----------------------------------------------------------------------------------- | --------------------- |
| R-P0-1 | Sale decrement UPDATE without stock floor → concurrent negative stock               | **P0**                |
| R-P0-2 | Partial cancel / void / unpaid-open stock reservation semantics opaque to operators | **P0** (product/ops)  |
| R-P1-1 | PUT product `is_active` bypasses P5 availability flags                              | **P1**                |
| R-P1-2 | Categorical ledger not queryable; reason-string accounting                          | **P1** (architecture) |
| R-P1-3 | REAL qty precision drift                                                            | **P1**                |
| R-P2-1 | Count lifecycle / opening stock missing audit_logs                                  | **P2**                |
| R-P2-2 | R4/R5/R6 deep suites extended-tier only                                             | **P2**                |
| R-P2-3 | Chef API/GUI mismatch                                                               | **P2**                |
| R-P2-4 | Stale feature-list “no recipes/BOM” under Menu                                      | **P2** (docs)         |
| R-P2-5 | Nested `withTxn` savepoints on adjust/count (works; complexity)                     | **P2**                |
| R-P3-1 | No inventory CSV export / ledger-check UI                                           | **P3**                |
| R-P3-2 | Incomplete FKs on some inventory satellite tables                                   | **P3**                |

No duplicate parallel Inventory OS found. Stock mutation must stay in Inventory services (orders already call them).

---

## Schema Impact

### Can P16 be implemented using schema v88?

**PARTIALLY — default YES for hardening; NO only if categorical ledger types are required.**

| Work                                                          | v88 OK?                   |
| ------------------------------------------------------------- | ------------------------- |
| Sale UPDATE CAS floor                                         | **YES** (SQL change only) |
| Availability PUT integrity                                    | **YES**                   |
| Count/opening audit_logs                                      | **YES**                   |
| Docs / matrix / feature-list sync                             | **YES**                   |
| Concurrent sale tests                                         | **YES**                   |
| Expand `movement_type` CHECK (opening/receipt/waste/transfer) | **NO** — needs migration  |
| Separate reserved_qty column                                  | **NO** — needs migration  |
| UoM table / multi-location                                    | **NO** — later            |

**Recommendation:** Prefer **no schema bump** for first P16 implementation slice. If categorical movements become a hard requirement, stop and propose a migration explicitly.

---

## Concrete P16 Gaps

```text
P16-GAP-001 … P16-GAP-012
```

See next section.

---

## Out-of-Scope Items

- Full recipe OS redesign / P17 food-cost deepen beyond existing R5/R9.6
- Full procurement OS beyond R6 (returns, RFQ, multi-supplier optimization)
- Stock transfer, expiry tracking, demand forecasting (matrix Planned/Later)
- Multi-location / central inventory
- Addon/modifier BOM
- Online ordering inventory sync
- Payment reconciliation / CRM / loyalty
- Disaster recovery / offline multi-master sync
- Weakening or rewriting P13–P15

---

## Recommended P16 Implementation Scope

**Name:** Inventory OS Hardening (not greenfield)

**In scope (proposed):**

1. **P16-A** — Sale stock CAS floor + concurrent oversell tests (P0)
2. **P16-B** — Document + optionally tighten cancel/void/refund stock policy (explicit acceptance; no silent restaurant restock)
3. **P16-C** — Close PUT `is_active` vs availability-flag desync (P1)
4. **P16-D** — Audit gaps: count create/submit/cancel; product opening/`product_update` stock (P2)
5. **P16-E** — Docs sync: feature-list BOM stale row; matrix “Low-stock alerts” nuance; FEATURE-INVENTORY accuracy
6. **P16-F** — Promote critical inventory race/integrity tests into merge/critical tier where appropriate
7. **P16-G** — Optional thin: inventory movements CSV export **or** ledger-check UI (pick one if capacity)

**Out of first P16 slice:** movement_type enum expansion, reserved_qty, transfers, expiry, chef GUI, restaurant refund restock enablement.

---

## Acceptance Criteria (for future implementation)

- Inventory mutations remain server-authoritative (`requireRole` + JWT actor).
- Sale decrement cannot drive stock negative under concurrency (CAS/floor).
- Adjust/receive idempotency preserved.
- Stock movements remain ledgered; new audits do not emit false success outside txn.
- P5 auto-86 flags cannot be desynced via product PUT.
- Cancel/void/refund inventory behavior is **documented and tested** as intentional policy.
- P13/P14/P15 suites remain green; schema remains **v88** unless a migration is proven necessary and authorized.
- No client actor spoofing; P15 sanitizer allowlist rules respected.
- Dedicated `test:p16` (or equivalent) covers new gaps; R4/R5/R6 regressions still pass.

---

## Test Plan (for future implementation)

1. Concurrent double-sale on last unit → one success, one 400; stock never &lt; 0.
2. Adjust/receive idempotent replay unchanged.
3. PUT `is_active` cannot clear manual/auto unavailable inconsistently.
4. Count lifecycle audits present; no success audit on failed apply.
5. Full cancel restores; void does not; restaurant restock still gated (unless product decision changes).
6. Regression: `test:inv-auto-86`, `test:inventory-boundary`, `test:inventory-ledger`, `test:r4`, `test:r5`, `test:r6`, `test:p14`, `test:p15`, `test:critical`.

---

## Concrete Gap List

### P16-GAP-001 — Sale decrement race (negative stock)

- **Problem:** Concurrent orders can oversell.
- **Current:** `assertStockAvailable` then `UPDATE … stock_quantity = stock_quantity - ?` without floor.
- **Expected:** UPDATE rejects when insufficient (`stock_quantity >= ?` or equivalent CAS).
- **Evidence:** `main/services/inventory.ts` `decrementTrackedStock`; contrast adjust floor ~489.
- **Severity:** P0
- **Proposed:** Add floor/CAS; return 400 on 0 rows; tests for concurrency.
- **Files:** `inventory.ts`, order create/items paths (error mapping), new tests
- **Schema:** none
- **Dependency:** none

### P16-GAP-002 — Partial cancel / void stock policy opacity

- **Problem:** Operators may expect line cancel/void to restock; restaurant refund does not restock.
- **Current:** Full/last-item restore yes; partial pending cancel no; void write-off; restaurant restock 403.
- **Expected:** Explicit documented + tested product policy (change only if authorized).
- **Evidence:** `order-boundary.test.ts`, `orders/cancel.ts`, `refund-restock.ts`, R5 docs
- **Severity:** P0 (ops) / P1 (if behavior change requested)
- **Proposed:** Docs + acceptance tests encoding current policy; optional later restore-on-partial as separate decision.
- **Schema:** none
- **Dependency:** product decision for any behavior change

### P16-GAP-003 — Product PUT bypasses availability flags

- **Problem:** `is_active` can desync from `manual_unavailable` / `auto_unavailable`.
- **Current:** Dedicated `/availability` is correct; PUT can set `is_active` directly.
- **Expected:** PUT rejects or routes through availability service.
- **Evidence:** `main/routes/products.ts` PUT vs `product-availability.ts`
- **Severity:** P1
- **Proposed:** Disallow raw `is_active` on PUT or sync flags.
- **Schema:** none
- **Dependency:** P5 auto-86

### P16-GAP-004 — Count lifecycle unaudited

- **Problem:** create/submit/cancel leave no audit_logs (only apply).
- **Expected:** Sensitive count state changes audited with JWT actor.
- **Evidence:** `inventory-count.ts` vs apply audit
- **Severity:** P2
- **Proposed:** Add audits inside txns; no PIN invent.
- **Schema:** none

### P16-GAP-005 — Opening / product_update stock unaudited

- **Problem:** Ledger written; audit_logs missing for opening/`product_update`.
- **Expected:** Success audit or force audited `/stock` path only.
- **Evidence:** `products.ts` create/update stock side-effects
- **Severity:** P2
- **Proposed:** `logAuditEvent` or deprecate absolute stock on PUT.
- **Schema:** none

### P16-GAP-006 — Categorical ledger not enforceable

- **Problem:** Opening/receipt/waste not first-class movement types.
- **Current:** reason strings on `adjustment`.
- **Expected (if required):** Typed movements or reporting views.
- **Evidence:** `inventory_movements` CHECK; inventory service comments
- **Severity:** P1 architecture / **OUT OF SCOPE** for no-migration harden
- **Proposed:** Defer typed expansion unless authorized migration; document reason taxonomy.
- **Schema:** migration if CHECK expanded
- **Dependency:** reporting design

### P16-GAP-007 — REAL quantity precision

- **Problem:** Float qty drift.
- **Expected:** Document tolerance; optional later fixed-point qty.
- **Evidence:** REAL columns; `toFixed(6)` reconstruct
- **Severity:** P1
- **Proposed:** Keep v88; document; no silent money redesign.
- **Schema:** later if fixed-point qty

### P16-GAP-008 — No reserved_qty model

- **Problem:** Open unpaid orders hold deducted stock (looks like consumption).
- **Expected:** Either document as “reserve-by-deduct” or introduce reserved bucket.
- **Severity:** P1 product
- **Proposed:** Document in P16; reserved column = migration → stop if required.
- **Schema:** none for docs-only

### P16-GAP-009 — Inventory export / waste report missing

- **Problem:** No CSV/export; no dedicated waste report.
- **Expected (optional):** Thin export or report using existing movements.
- **Severity:** P3
- **Proposed:** Optional thin slice; reuse report patterns.
- **Schema:** none

### P16-GAP-010 — Ledger-check API without UI

- **Problem:** Reconstruct/compare API unused by operators.
- **Severity:** P3
- **Proposed:** Optional FE or Settings diagnostic.
- **Schema:** none

### P16-GAP-011 — Extended-tier inventory suite gap in merge CI

- **Problem:** R4/R5/R6 deep coverage not in default merge.
- **Severity:** P2
- **Proposed:** Promote race/integrity subsets to critical/merge.
- **Schema:** none

### P16-GAP-012 — Docs drift (feature-list BOM; alerts wording)

- **Problem:** Menu feature-list still says no recipes/BOM; “Low-stock alerts” overstates push alerts.
- **Severity:** P2 docs
- **Proposed:** Align feature-list + inventory notes with matrix/code.
- **Schema:** none

---

## Proposed Implementation Order

```text
P16-A — Sale stock CAS / floor + concurrency tests          (GAP-001)
P16-B — Encode cancel/void/refund stock policy in docs+tests (GAP-002, GAP-008)
P16-C — Product PUT ↔ availability integrity                 (GAP-003)
P16-D — Audit depth for counts + opening stock               (GAP-004, GAP-005)
P16-E — Docs / matrix / feature-list sync                    (GAP-012)
P16-F — CI tier promotion for integrity suites               (GAP-011)
P16-G — Optional: movements CSV or ledger-check UI           (GAP-009/010)
P16-H — Explicit STOP before typed ledger migration          (GAP-006)
P16-I — Regression: p15/p14/inv-auto-86/r4/r5/r6/critical
```

Do **not** start P17 from this audit.

---

## Stop Condition

This audit is complete. **Implementation is NOT STARTED.**

Next authorized task should consume this document as the sole scope authority for **P16 — Inventory OS Implementation** (hardening), after human review of:

1. Whether GAP-002 behavior changes are desired, and
2. Whether GAP-006 typed ledger (schema bump) is in or out.

---

## Appendix — Baseline Commands Recorded

```text
git status          → clean; up to date with origin/restaurant-vertical
git branch          → restaurant-vertical
git log -5          → e1be5f8, 40f5fb9, 490df66, 06d451d, b57791b
schema tip          → v88
```

**Production code was not modified for this audit.**
