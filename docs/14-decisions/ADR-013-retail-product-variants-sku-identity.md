# ADR-013: Retail product variants / SKU identity

**Status:** Proposed — awaiting human Accept  
**Date:** 2026-08-14  
**Deciders:** Product + CTO (human gate — **not self-accepted**)  
**Supersedes:** n/a  
**Amends:** none — **confirms** [ADR-011](ADR-011-refund-restock-policy.md) and [ADR-012](ADR-012-retail-exchange-policy.md) remain valid under Option A  
**Related:** [phase-4.6 discovery](../04-product/phase-4.6-retail-product-variants-discovery.md), [feature-list.md](../00-product/feature-list.md)

---

## 1. Context

Phase 4.6 discovery verified that Opervia’s catalog is:

```text
one products row = one sellable identity = one stock bucket = one optional barcode/SKU
```

There is **no** `product_variants` table, **no** `products.parent_id`, and **no** SKU matrix UI. Typed frontend `Product.variants` and `order_items.variant_selection` are **unused stubs**. Inventory, ADR-011 restock, and ADR-012 exchange all key on `order_items.product_id` → `products.id`.

Retail still lists variants as a product gap. This ADR locks **identity** so a future matrix cannot invent a second stock path.

**Baseline:** schema **v75** · Phase 4.5 (`a42493a`) · HEAD at draft `4c91553` (retail vertical + docs; **no identity change**). Re-verified 2026-08-14: discovery **MATCHES** current code.

---

## 2. Problem

Merchants need Size×Color (etc.) SKUs with isolated stock, barcodes, prices, refund restock, and exchange. Unsafe designs would:

- stock a **parent** while selling **options** (ambiguous bucket),
- treat Restaurant **addons** as variants (no per-option stock/barcode; module not on Retail),
- persist identity in `variant_selection` JSON that Inventory never reads.

This ADR defines **policy**. It does **not** authorize schema, APIs, or UI.

---

## 3. Decision (Proposed)

### 3.1 Sellable identity — Option A (LOCK)

**The only sellable / stock / restock / exchange identity is a `products` row.**

Each sellable variant (e.g. Tee / Red / M) **is** a normal product:

| Concern            | Rule                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| Primary key        | `products.id`                                                                                                  |
| Stock cache        | `products.stock_quantity`                                                                                      |
| Ledger             | `inventory_movements.product_id` = that id                                                                     |
| Scan               | Exact barcode, else exact SKU → **one** row                                                                    |
| Order line         | `order_items.product_id`                                                                                       |
| Restock (ADR-011)  | `order_item_id` → `order_items.product_id` → that bucket                                                       |
| Exchange (ADR-012) | Return restock uses original line’s `product_id`; replacement uses a (possibly different) catalog `product_id` |

**This identity does not require software.** Merchants can create separate products **today**.

### 3.2 Software SKU matrix — DEFERRED (not authorized)

A parent style + Size×Color matrix UI, shared merchandising image, or bulk combinatorial create is **not authorized** by this ADR.

If Product later wants that UX, a **new authorized implementation phase** (and likely an ADR amendment or ADR-013b) is required. Preferred future shape **if** that happens:

- **Hybrid parent grouping:** optional `products.parent_id` (or equivalent) where **every sellable child is still a `products` row** (Option A identity preserved).
- **Rejected even later unless a new ADR overturns this:** separate `product_variants` stock table; parent-only stock + option picker; combinatorial SKU generator (Option C); addons-as-variants (Option D); `variant_selection` JSON as identity (Option E).

**Accepting this ADR does not start matrix implementation.**

### 3.3 Barcode / SKU uniqueness — keep current policy

| Field     | Today                                                                                             | This ADR                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `barcode` | App-level uniqueness among non-deleted rows (`tests/issue-137-barcode.test.ts`); **no** DB UNIQUE | **Unchanged.** DB UNIQUE is a future integrity nicety (soft-delete reuse policy required). **Not** part of this decision’s implementation (there is none). |
| `sku`     | Nullable TEXT, **not** unique                                                                     | **Unchanged.** Making SKU unique would break existing duplicate SKUs.                                                                                      |

Scan still resolves to **exactly one** product row (first exact barcode, then exact SKU). No fuzzy parent match.

### 3.4 Restaurant visibility

- **No** variants / SKU matrix chrome on Restaurant POS or Products.
- **Addons remain restaurant-only modifiers** — not variants, no per-option stock/barcode.
- Shared `products` table: Option A rows created under Retail **remain in the same SQLite file** if later opened as Restaurant (ops fact; same as any product).

### 3.5 Migration stance

- **No migration.** Schema **v75** unchanged.
- Existing catalog rows stay **leaf sellable SKUs**.
- Do **not** convert sellable rows into non-stock “parent only” records without a future ADR + data plan + upgrade tests.

---

## 4. Alternatives considered

| Option                                        | Summary                       | Verdict                                                                                                                      |
| --------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **A — Product rows are variants**             | Each SKU is a `products` row  | **Accepted (identity)**                                                                                                      |
| **B — Parent + variant table / parent stock** | Child stock or parent+options | **Rejected as identity.** Hybrid parent_id grouping of **product rows** may be proposed later; dual stock table is high risk |
| **C — Generated combinations**                | Axes explode SKUs             | **Rejected** (ERP-shaped)                                                                                                    |
| **D — Addons as variants**                    | Restaurant modifiers          | **Rejected**                                                                                                                 |
| **E — `variant_selection` JSON**              | Stub as identity              | **Rejected** (Inventory never reads it)                                                                                      |

---

## 5. Merchant ops (available today — not a software phase)

To sell two sizes or colors:

1. Create **two products** (or duplicate one).
2. Give each its own **name** (e.g. `Tee — Red / M`), **SKU**, **barcode**, **price**, **cost**, **stock**.
3. POS scan and search already resolve to that row (Phase 4.1).
4. Refund restock and exchange already isolate stock per `product_id` (ADR-011 / ADR-012).

There is no parent grouping in the UI. That is acceptable until a later matrix phase is explicitly authorized.

---

## 6. Vertical isolation

**Retail** (`ACTIVE_VERTICAL_ID=retail`) composes shared commerce only — **excludes** `tables`, `kitchen`, `kds`, `menu`, `addons`.

**Restaurant** adds those five modules, including **addons**. Addon options have name/price/tax only — **no** `stock_quantity`, `track_inventory`, or `barcode`.

Fail-closed composition (Phase 3.1): disabled modules do not mount HTTP (`/api/addon-groups`, `/api/tables`, `/api/kds`, …).

| Concern            | Restaurant                              | Retail                                  | Shared                                          |
| ------------------ | --------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Composition        | Shared + tables/kitchen/kds/menu/addons | Shared only                             | Unknown vertical → `CompositionValidationError` |
| Catalog identity   | Products + addons (modifiers)           | Products as SKUs (Option A)             | One `products` table                            |
| Addons vs variants | Addons ON; not stock identity           | Addons OFF                              | Do not map addons → variants                    |
| Matrix UI          | Must not appear                         | Only after a **later** authorized phase | None in this ADR                                |
| ADR-011 restock    | **403 / money-only**                    | Optional (`retail` / `retail-test`)     | Restock keys `order_item_id` → `product_id`     |
| ADR-012 exchange   | No exchange UI                          | Coordinator + UI                        | Replacement `product_id` is a catalog row       |

---

## 7. ADR-011 / ADR-012 validity

**Both remain valid under Option A.** No amendment required.

- Restock still: explicit `order_item_id` + `quantity` → `order_items.product_id`.
- Exchange still: refund → replacement sale → optional restock; no exchange table; no store credit.
- Restaurant restock remains **403**.

A future identity column (e.g. `order_items.variant_id`) **would** amend ADR-011/012. This ADR forbids that unless a later ADR Accepts it **and** children remain `products.id`.

---

## 8. Money / tax / FIN-01 / inventory

| Topic                           | Policy                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Gross / Net / Payments Received | Unchanged                                                                           |
| FIN-01                          | Unchanged                                                                           |
| Day-close / accounting CSV      | Unchanged (bill-level)                                                              |
| Variant price                   | Existing `products.price` on the sellable row — **no new pricing engine**           |
| Tax                             | `tax_category_id` / `tax_behavior` on that row; historical bill snapshots immutable |
| InventoryService                | Unchanged; all writes stay on `products.id`                                         |

**No money-path or schema change in Phase 4.6.**

---

## 9. Schema / API impact (this phase)

| Change               | Phase 4.6         |
| -------------------- | ----------------- |
| Schema               | **v75 unchanged** |
| New tables / columns | **None**          |
| New HTTP             | **None**          |
| Production code      | **None**          |

Illustrative **future** (not approved): `products.parent_id`, barcode UNIQUE with soft-delete rules. Exact DDL is **not** this ADR’s implementation plan.

---

## 10. Characterization (before any future implementation)

Run existing suites first — **do not add failing matrix tests now:**

```sh
npm run test:phase-4.2
npm run test:phase-4.5
node --test tests/issue-137-barcode.test.ts
node --test tests/inventory-boundary.test.ts
# plus financial-reporting-semantics, day-close, restaurant-isolation, synthetic-retail / production-retail
```

Future implementation tests (post-Accept **and** explicit implementation task): scan → sellable id; sale/adjust/restock/exchange isolate the bucket; Restaurant has no matrix UI; no money regression.

---

## 11. Risks

| Risk                                  | Severity | Mitigation                                                 |
| ------------------------------------- | -------- | ---------------------------------------------------------- |
| `variant_selection` as stock identity | Critical | **Rejected**                                               |
| Parent stock + options                | Critical | **Forbidden**                                              |
| Duplicate barcodes (no DB UNIQUE)     | High     | Keep app-level check; UNIQUE later with soft-delete policy |
| Duplicate SKUs                        | Medium   | Remain allowed                                             |
| Restaurant matrix chrome              | Medium   | Vertical/module gate if UI is ever built                   |
| Addons confused with variants         | Medium   | This ADR                                                   |
| Scope creep to PO/BOM                 | High     | Explicit non-goals                                         |

---

## 12. Consequences

**Positive**

- Identity locked without schema or money-path change.
- ADR-011/012/FIN-01 preserved.
- Merchants can model variants as products **now**.

**Negative**

- No parent/family UI until a later authorized phase.
- Catalog can look “flat” (many similar names).
- Barcode uniqueness remains application-enforced.

**Out of scope:** matrix UI, `parent_id` migration, UNIQUE indexes, suppliers/PO/BOM, store credit, multi-location, REAL→cents, 3.5B/C, P1.6, Nest/Prisma/extraction.

---

## 13. Implementation gate

### NOT READY FOR IMPLEMENTATION

This ADR is **Proposed**. Human Accept is required.

| After human…                            | What happens                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reject**                              | Revise ADR; still no code                                                                                                                                                    |
| **Accept as written**                   | Identity lock + matrix **deferred**. Phase 4.6 paper work may complete. **No** matrix code. Prompt pipeline may then activate **4.7** (86) — 4.7 does not depend on a matrix |
| **Accept + authorize a software slice** | Requires a **new** phase prompt (not automatic). Child identity must remain `products.id`. Schema change → separate migration ADR + v76                                      |

**Do not** treat silence as Accept. **Do not** start variant implementation from `npm run prompt:run` or auto-advance.

**Phase 4.6 (this pipeline slice) ships only this document + pointers.** Production code unchanged.
