# Phase 4.6 — Retail Product Variants Discovery

**Date:** 2026-08-14  
**Status:** DISCOVERY COMPLETE — **ADR REQUIRED**  
**Baseline:** Phase 4.5 (`a42493a`) · schema **v75**  
**Production code:** None (discovery only)

**Related:** [ADR-013](../14-decisions/ADR-013-retail-product-variants-sku-identity.md) (**Proposed** — human Accept required) · [phase-4-product-completion-discovery.md](phase-4-product-completion-discovery.md) · [phase-4.1-retail-floor-usability.md](phase-4.1-retail-floor-usability.md) · [ADR-011](../14-decisions/ADR-011-refund-restock-policy.md) · [ADR-012](../14-decisions/ADR-012-retail-exchange-policy.md) · [feature-list.md](../00-product/feature-list.md)

---

## Executive summary

Operavia’s catalog today is **one `products` row = one sellable identity = one stock bucket = one optional barcode**. There is **no variant table**, no parent/child product model, and no SKU matrix. Typed frontend `Product.variants` and `order_items.variant_selection` are **unused stubs** — not a partial implementation.

**Sellable identity for money, inventory, refund restock, and exchange already works** if each size/color/SKU is its own `products` row: `order_items.product_id` survives the full lifecycle, and ADR-011 / ADR-012 remain valid.

A true **Variants / SKU Matrix product feature** (parent style + Size×Color matrix, shared image, bulk create, variant-aware Products UI) **requires schema and product-policy decisions**. Building that without an ADR would either:

- invent a second identity path that breaks stock/refund/exchange isolation, or
- add tables/columns without locked ownership rules.

**Verdict:** **ADR REQUIRED** before any Phase 4.6 implementation.

Operational note (not a software phase): merchants can already model variants as **separate products** (Option A identity) with today’s POS, inventory, refund, and exchange. That is **ops practice**, not Phase 4.6 code.

---

## Files inspected

| Area               | Paths                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Schema             | `main/db.ts` (`products`, `order_items`, `inventory_movements`, v75)                               |
| Products API       | `main/routes/products.ts`, `main/validation/` (inventory)                                          |
| Inventory          | `main/services/inventory.ts`                                                                       |
| Orders             | `main/routes/orders.ts`, `main/validation/orders.ts`                                               |
| Restock / exchange | `main/services/refund-restock.ts`, `frontend/src/lib/exchange/*`, ADR-011/012                      |
| POS search         | `frontend/src/lib/pos/product-search.ts`, `ProductGrid.tsx`                                        |
| Products UI        | `frontend/src/components/products/ProductFormDialog.tsx`, `ProductsTable.tsx`, `products/page.tsx` |
| Types / stubs      | `frontend/src/lib/types.ts` (`variants`/`modifiers`)                                               |
| Docs               | `feature-list.md`, `phase-4-product-completion-discovery.md`, STRATEGY                             |
| Tests              | `tests/issue-137-barcode.test.ts`, phase-4.2 / 4.5 suites                                          |

---

## 1. Current Product Model

| Fact           | Detail                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Grain          | One row in `products` = one sellable SKU                                                              |
| PK             | `id TEXT` (`generateShortId('products')`)                                                             |
| Soft delete    | `deleted_at`; reads filter `IS NULL`                                                                  |
| Active         | `is_active`                                                                                           |
| Price          | `price REAL` on the product row                                                                       |
| Cost           | `cost` (API often maps `cost_price`)                                                                  |
| Tax            | Authoritative: `tax_category_id`, `tax_behavior`; legacy `tax_type`/`tax_rate` forced none/0 on write |
| Inventory      | `track_inventory`, `stock_quantity` (cache), `low_stock_threshold`                                    |
| Tags           | JSON string on product                                                                                |
| Parent / child | **None** — no `parent_id`, no variant FK                                                              |
| Addons         | Separate restaurant-only module (`addon_groups` / `addons`); **not** variants                         |

**Uniqueness:** only `id` is UNIQUE. No DB UNIQUE on `sku`, `barcode`, or `name`.

---

## 2. Current SKU / Barcode Model

| Field     | DB                                 | Application                                                          |
| --------- | ---------------------------------- | -------------------------------------------------------------------- |
| `sku`     | nullable TEXT, **not unique**      | Informational; POS search/scan match                                 |
| `barcode` | nullable TEXT, **no unique index** | Create/update check among non-deleted rows; concurrent race possible |

POS Phase 4.1:

- Client filter: name / sku / barcode substring (`productMatchesPosSearch`)
- Scan: **exact barcode**, then **exact SKU** (`findProductByScanCode`)
- Catalog loaded once (`GET /products?active=1`); local match

A scan resolves to **exactly one product row**. There is no “parent then pick size” path.

---

## 3. Current Inventory Identity

```text
products.id  →  products.stock_quantity  →  inventory_movements.product_id
```

| Operation                      | Identity                                                |
| ------------------------------ | ------------------------------------------------------- |
| Sale decrement                 | `product.id`                                            |
| Cancel restore                 | `order_items.product_id` → product                      |
| Manual adjust                  | URL `:id` = `products.id`                               |
| Opening / product update stock | `productId`                                             |
| Refund restock                 | `order_items.product_id`                                |
| Low-stock                      | `p.stock_quantity <= p.low_stock_threshold` per product |

**Proven:** today **one `product_id` = one stock bucket**. No variant-level stock exists.

---

## 4. Current Order Item Identity

`order_items` (relevant):

| Column                                    | Role                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `id`                                      | Line identity (restock / exchange)                                      |
| `product_id`                              | Catalog key (**no FK** to `products`)                                   |
| `product_name`, `product_sku`             | Frozen snapshots                                                        |
| `quantity`, `total`, tax fields           | Line economics                                                          |
| `variant_selection`, `modifier_selection` | TEXT JSON — **written if present, never used by Inventory/POS/restock** |

POS cart / checkout send `{ product_id, quantity, addons? }` — **not** variant_selection.

**Identity for stock after sale:** `order_item_id` → `order_items.product_id` → `products` row.

---

## 5. Refund / Restock Identity

ADR-011:

```http
POST /api/refunds/:refundId/restock
{ "order_item_id", "quantity" }
```

Resolves:

```text
order_item_id → order_items.product_id → restockTrackedForRefund(product)
```

Money refund remains **bill-level** (no `order_item_id` on refund API).

**If each variant is its own product row:** restock already returns stock to the exact sellable SKU.  
**If variants were options on one parent stock row:** ADR-011 would restock the **wrong bucket** unless identity changed.

---

## 6. Exchange Identity

ADR-012 composition:

| Leg            | Identity                                                             |
| -------------- | -------------------------------------------------------------------- |
| Return money   | Coordinator computes from `order_items.total/qty`; bill-level refund |
| Return restock | Same ADR-011 `order_item_id` + qty                                   |
| Replacement    | **New** catalog `productId` (independent of return line)             |

Exchanging Red/M for Blue/L works today **only if** Red/M and Blue/L are **two products**. Same `product_id` in and out is the same stock bucket.

**ADR-012 remains valid** under Option A (product rows = variants). A parent+child variant model would need ADR amendment for replacement/restock identity.

---

## 7. Low-Stock Identity

`LOW_STOCK_SQL_FRAGMENT`:

```sql
track_inventory = 1 AND stock_quantity <= low_stock_threshold
```

Per **product row**. Hub `/products/low-stock` shows sku/barcode of that row.

Variant matrix without per-variant stock would make low-stock **ambiguous**.

---

## 8. Reporting / CSV Impact

| Surface              | Product identity                           |
| -------------------- | ------------------------------------------ |
| Top products         | `GROUP BY oi.product_id` (+ name snapshot) |
| Accounting CSV (4.4) | **Bill-level only** — no product columns   |
| Menu CSV             | Catalog `products.id` + sku                |

Money/FIN-01/day-close/accounting CSV **do not** depend on variant structure. Product-level sales reports would show each sellable row separately under Option A (correct for stock-backed SKUs).

---

## 9. Candidate Architectures

### A. Product rows represent variants

Each Size×Color (etc.) is a normal `products` row with its own sku, barcode, price, stock.

| Dimension          | Assessment                                                   |
| ------------------ | ------------------------------------------------------------ |
| Schema             | **v75 unchanged**                                            |
| API                | Unchanged                                                    |
| Inventory          | Already isolated per `product_id`                            |
| POS                | Existing scan/search works                                   |
| Refund / exchange  | ADR-011/012 unchanged                                        |
| Reporting          | One row per sellable SKU                                     |
| Complexity         | **Lowest**                                                   |
| Migration          | None                                                         |
| Vertical isolation | Restaurant unchanged; Retail uses same catalog               |
| Gap                | No parent grouping, no matrix UI, no shared image by default |

**Already available as ops practice.** Software “Phase 4.6” that only documents this is not a feature build.

### B. Parent product + variant rows

New table (e.g. `product_variants`) or child `products` with `parent_id`; stock/sku/barcode on child.

| Dimension          | Assessment                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Schema             | **v76+ required**                                                                        |
| API                | Product CRUD + variant CRUD; POS resolve scan → variant                                  |
| Inventory          | Must key movements on **variant/child id**                                               |
| POS                | Must add variant picker or scan-to-variant                                               |
| Refund / exchange  | Must persist child id on `order_items` (likely new column or require child `product_id`) |
| Reporting          | Group-by child id; optional parent rollup                                                |
| Complexity         | **High**                                                                                 |
| Migration          | Existing products become parents or leave as leaf SKUs                                   |
| Vertical isolation | Gate UI to Retail; services shared — policy needed                                       |

### C. Product options / generated combinations

Option axes (Size, Color) generate combinatorial SKUs.

| Dimension         | Assessment                                   |
| ----------------- | -------------------------------------------- |
| Schema            | Options + generated rows (or virtual SKUs)   |
| Inventory         | Dangerous if stock is on parent              |
| POS               | Complex picker                               |
| Refund / exchange | Same identity problem as B                   |
| Complexity        | **Highest** — ERP-shaped                     |
| Risk              | Generated SKU explosion; orphan combinations |

**Reject for v1 Lego block.**

### D. Reuse Restaurant addons as “variants”

| Dimension | Assessment                                                                                    |
| --------- | --------------------------------------------------------------------------------------------- |
| Fit       | **Wrong model** — addons are additive modifiers, restaurant-only, no per-option stock/barcode |
| Stock     | Parent stock only                                                                             |
| Retail    | Addons module **not** composed into Retail                                                    |

**Reject.**

### E. Revive `order_items.variant_selection` JSON as identity

| Dimension | Assessment                            |
| --------- | ------------------------------------- |
| Inventory | **Never reads it**                    |
| Restock   | Uses `product_id` only                |
| Risk      | Silent identity loss; stock ambiguity |

**Reject.** Do not treat stubs as a model.

---

## 10. Recommended Architecture

**For sellable / stock / refund / exchange identity:**

→ **Option A — each sellable variant is a `products` row.**

This is the only architecture that **preserves ADR-011, ADR-012, InventoryService ownership, FIN-01, and schema v75 without redesign**.

**For a Retail “Variants / SKU Matrix” software feature** (parent style, matrix create, shared merchandising):

→ **Requires Option B (or equivalent) + ADR** — schema, identity on order lines, POS resolution, inactive/delete rules, Restaurant visibility.

**Do not** implement Option B without ADR.  
**Do not** pretend Option C/D/E are safe.

Discovery does **not** authorize implementation of a matrix UI that invents stock identity outside `products.id`.

---

## 11. Schema Impact

**Discovery:** schema **v75 unchanged**.

If a future ADR chooses Option B, minimum migration candidates (illustrative — **not approved**):

| Candidate                                   | Purpose                                 | Risk                                                  |
| ------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| `products.parent_id TEXT NULL`              | Soft family grouping among product rows | Orphans; cascade inactive                             |
| `product_variants` table                    | Child sku/barcode/price/stock           | Dual stock caches; order_items must reference variant |
| UNIQUE INDEX on `barcode` WHERE not deleted | Close race                              | Soft-delete reuse policy                              |
| UNIQUE on `sku` WHERE not null              | Policy change — today SKU is non-unique | Breaks existing duplicate SKUs                        |
| `order_items.variant_id`                    | Survive lifecycle                       | Backfill; exchange/restock updates                    |

Exact table/column/constraint set is an **ADR decision**, not this discovery’s implementation plan.

---

## 12. API Impact

**Option A (ops-only):** no API changes.

**Option B (future):** proposed surfaces only (not implemented):

- CRUD for variants under a parent
- `GET /products?barcode=` / search must resolve **sellable** id (child)
- Stock adjust / low-stock keyed to sellable id
- Order create already takes `product_id` — child id can work **if** child is the `products.id` (hybrid B-as-A) or `order_items` gains `variant_id`

Prefer **child rows that are still `products` rows** (parent_id grouping) over a second stock table — keeps InventoryService contracts stable. That preference must be confirmed in ADR.

---

## 13. Inventory Impact

| Question                                                        | Answer                                           |
| --------------------------------------------------------------- | ------------------------------------------------ |
| Can variant stock stay isolated today?                          | **Yes**, if each variant is its own `product_id` |
| Can parent stock + option selection stay isolated?              | **No** — single bucket                           |
| InventoryService change for Option A?                           | **None**                                         |
| InventoryService change for Option B with separate stock table? | **Yes** — high risk                              |

**Proof:** all decrement/restore/adjust/restock paths key on `products.id`.

---

## 14. Refund / Restock Impact

**ADR-011 remains valid** under Option A.

Restock already:

- requires `order_item_id` + `quantity`
- loads `order_items.product_id`
- restocks that product only
- caps by line qty − prior restock movements

No ADR-011 change needed for Option A. Option B with a new identity column **amends** ADR-011.

---

## 15. Exchange Impact

**ADR-012 remains valid** under Option A.

Return restock uses ADR-011 identity; replacement picks a (possibly different) catalog product. Equal/cheaper/more expensive economics unchanged.

Option B matrix UX must still produce a concrete sellable id for replacement cart lines.

---

## 16. Restaurant Impact

| Topic       | Finding                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| Variants UI | Must not appear on Restaurant unless explicitly shared                                   |
| Addons      | Remain restaurant-only; **not** variants                                                 |
| Catalog     | Shared `products` table — Option A rows are visible to Restaurant if created             |
| Isolation   | Soft-gate Products UI “matrix” to Retail; do not mount restaurant-only modules on Retail |

**Risk:** Option A variants created while `ACTIVE_VERTICAL_ID=retail` still exist in DB when switching vertical — same as any product. Acceptable; document ops.

Restaurant refund remains money-only; restock stays 403.

---

## 17. Retail Impact — minimum useful UX (future, post-ADR)

If ADR accepts **parent_id grouping of product rows** (recommended hybrid):

1. Products list: optional “Family” / parent filter
2. Create variant: duplicate product or “Add size/color” → new row with own sku/barcode/price/stock
3. Edit each sellable row independently
4. POS: unchanged scan-to-row; optional family picker later
5. Low-stock / adjust: per sellable row (existing)

Avoid ERP: no combinatorial generator, no multi-location, no PO.

If ADR accepts **ops-only Option A**: Phase 4.6 software is **empty** — ship a short merchant guide, not code. That would be **DEFER** as an engineering phase.

---

## 18. Money / Tax / FIN-01

| Topic                           | Requirement                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Gross / Net / Payments Received | Unchanged                                                                                        |
| FIN-01                          | Unchanged                                                                                        |
| Day-close                       | Unchanged                                                                                        |
| Accounting CSV                  | Unchanged (bill-level)                                                                           |
| Variant price                   | Must use existing product `price` (or child product price) — **no new pricing engine**           |
| Tax                             | Existing `tax_category_id` / `tax_behavior` on sellable row; historical bill snapshots immutable |

Variant work **must not** change money semantics. Discovery finds **no need** to touch them under Option A.

---

## 19. Test Requirements (before future implementation)

### Characterization (existing — run first)

| Suite                                                           | Proves                                    |
| --------------------------------------------------------------- | ----------------------------------------- |
| `tests/issue-137-barcode.test.ts`                               | Barcode uniqueness (app-level)            |
| `tests/phase-4.2-refund-restock.test.ts`                        | Restock by `order_item_id` → `product_id` |
| `tests/phase-4.5-retail-exchange.test.ts`                       | Exchange legs + identity                  |
| `tests/inventory-boundary.test.ts`                              | Inventory ownership                       |
| Financial / day-close / restaurant-isolation / synthetic-retail | Money + vertical                          |

### Future implementation tests (post-ADR)

| Area               | Cases                                                       |
| ------------------ | ----------------------------------------------------------- |
| SKU / barcode      | Uniqueness policy as ADR defines; scan resolves sellable id |
| Stock              | Sale decrements only that sellable bucket                   |
| Adjust / low-stock | Per sellable row                                            |
| Refund restock     | Returns stock to original sellable id                       |
| Exchange           | Return + replacement different sellable ids                 |
| Void/cancel        | Restore correct bucket                                      |
| Restaurant         | No matrix UI; addons unchanged                              |
| Retail             | Matrix/family UI gated                                      |
| Reporting / CSV    | No money regression; top products by sellable id            |

Do **not** add these tests during discovery.

---

## 20. Risks

| Risk                                                | Severity               | Mitigation                                 |
| --------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Treating `variant_selection` JSON as stock identity | **Critical**           | Explicit reject                            |
| Parent stock + options (ambiguous bucket)           | **Critical**           | Forbid without ADR                         |
| Duplicate barcodes (no DB UNIQUE)                   | High                   | ADR: unique index + soft-delete policy     |
| Duplicate SKUs (allowed today)                      | Medium                 | ADR: whether SKU becomes unique            |
| Identity loss on refund/exchange                    | High if Option B wrong | Keep sellable id = `products.id`           |
| Migrating existing products into parents            | High                   | Leaf SKUs remain sellable; optional attach |
| Orphan / inactive variants                          | Medium                 | Cascade rules in ADR                       |
| Restaurant seeing Retail matrix chrome              | Medium                 | UI module/vertical gate                    |
| Confusing addons with variants                      | Medium                 | Naming discipline                          |
| Scope creep to PO/receiving/ERP                     | High                   | Explicit non-goals                         |

---

## 21. Acceptance Criteria For Future Implementation

Phase 4.6 implementation may be declared COMPLETE only if:

1. Accepted ADR defines architecture (A ops-only vs B/hybrid)
2. Sellable stock identity remains a single unambiguous bucket per sale line
3. Barcode scan resolves to exact sellable id (no fuzzy parent match)
4. ADR-011 restock still uses explicit `order_item_id` + qty and correct product bucket
5. ADR-012 exchange still composes without net-settlement
6. FIN-01 / tax / day-close / accounting CSV unchanged
7. Restaurant: no unwanted variant chrome; addons unchanged
8. Retail: UX matches ADR minimum
9. Schema migration (if any) has fresh + upgrade tests and data plan
10. Characterization + new suites PASS; lint 0 errors; builds PASS
11. No suppliers/PO/BOM/multi-location scope

---

## 22. Final Verdict

### ADR REQUIRED

**Rationale:**

- **Identity-safe path (Option A)** already exists without code — each variant as a product row. That does not need a Phase 4.6 engineering project.
- A **real Variants / SKU Matrix Lego** (parent family, matrix create, shared merchandising) needs **schema + policy** (Option B or hybrid parent_id).
- Ambiguous designs (parent stock, addon-as-variant, `variant_selection` JSON) would break inventory / refund / exchange isolation.
- Product decisions remain open: uniqueness, parent cascade, Restaurant visibility, migration of existing catalog.

**Not READY FOR IMPLEMENTATION** — policy/architecture incomplete for a software matrix.  
**Not DEFER** as a product need — Retail still lists variants as a gap; ADR is the next step.  
**Not NO SAFE ARCHITECTURE FOUND** — Option A is safe for identity; Option B can be safe **after** ADR locks child = sellable `products.id` (or equivalent).

### Proposed next action

1. Draft **ADR-013 — Retail product variants / SKU identity** covering:
   - Confirm Option A as the **only** sellable stock identity
   - Choose: ops guide only vs parent_id hybrid vs full variant table
   - Barcode/SKU uniqueness
   - Restaurant visibility
   - Migration stance for existing products
2. Do **not** start implementation until ADR is Accepted **and** an implementation slice is explicitly authorized.
3. Do **not** reopen 3.5B / 3.5C / REAL→cents / P1.6.

**ADR-013 drafted 2026-08-14:** [ADR-013-retail-product-variants-sku-identity.md](../14-decisions/ADR-013-retail-product-variants-sku-identity.md) — **Proposed**. Identity = Option A. Matrix software **deferred**. Production code unchanged.

---

## Phase 4.6 Discovery Report

| Field                         | Value                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| **Status**                    | DISCOVERY COMPLETE — **ADR REQUIRED**                                                        |
| **Discovery document**        | `docs/04-product/phase-4.6-retail-product-variants-discovery.md`                             |
| **Production code**           | None                                                                                         |
| **Schema**                    | v75 unchanged                                                                                |
| **Current architecture**      | 1 product = 1 SKU = 1 stock bucket; stubs unused                                             |
| **Recommended identity**      | Option A — sellable variant = `products` row                                                 |
| **Recommended software path** | Parent/family matrix only via **ADR** (hybrid parent_id preferred over separate stock table) |
| **Schema/API impact**         | None now; Option B needs migration + APIs later                                              |
| **Inventory**                 | Safe under Option A; unsafe under parent+options                                             |
| **Refund (ADR-011)**          | Remains valid under Option A                                                                 |
| **Exchange (ADR-012)**        | Remains valid under Option A                                                                 |
| **Restaurant**                | Unchanged; do not overload addons                                                            |
| **Retail**                    | Gap remains until ADR + implementation                                                       |
| **Money / FIN-01**            | Unchanged                                                                                    |
| **Tests required**            | §19 characterization + future suite                                                          |
| **Risks**                     | §20                                                                                          |
| **Final verdict**             | **ADR REQUIRED**                                                                             |
| **Next action**               | Draft ADR-013; no implementation                                                             |

**STOP — discovery only. No production implementation.**
