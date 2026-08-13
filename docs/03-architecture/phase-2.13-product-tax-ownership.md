# Phase 2.13 — Product ↔ Tax Ownership Boundary

**Status:** IMPLEMENTED  
**Date:** 2026-08-13  
**Branch:** `modular-verticles`  
**Prior:** Phase 2.12 (`70e4b93`)

## 1. Purpose

Architecture hardening only. Clarify who owns product tax **config references** vs tax **calculation** vs **historical snapshots** — without schema migration, money-math changes, or API shape changes.

## 2. Product ownership

Product owns catalog metadata and **persistence** of Tax config references on the product row:

| Field | Role |
| --- | --- |
| `tax_category_id` | PRODUCT_OWNED persistence of TAX config reference |
| `tax_behavior` | PRODUCT_OWNED persistence of TAX config |

Product does **not** calculate tax, build `EngineTaxSnapshot`, or import `tax-engine`.

## 3. Tax ownership

Tax owns packs resolution for compute, `calculateTax` / adapters, discount item-tax scaling, payable rounding helpers, and the frozen `EngineTaxSnapshot` contract. Tax HTTP under `/api/tax/*` remains Tax-owned (Phase 2.10).

| Concern | Owner |
| --- | --- |
| Tax packs / `calculateTax` | TAX_OWNED |
| EngineTaxSnapshot shape | TAX_OWNED |

## 4. Tax references on products

`products.tax_category_id` and `products.tax_behavior` are **config references** into the active country pack — not computed tax amounts. Product validates unknown categories via Tax facade helpers (`getActiveCountryPack`, `hasConfiguredTaxCategories`) only.

## 5. Config vs calculation vs snapshot vs historical

| Layer | Meaning | Owner |
| --- | --- | --- |
| Config | Category + behavior on product (and charge category IDs on open orders) | Product hosts refs; Tax defines valid categories |
| Calculation | Live `calculateTax` / adapters at order/bill time | Tax |
| Snapshot | `EngineTaxSnapshot` (+ wrappers) produced by Tax | Tax |
| Historical | Persisted `tax_amount` / `tax_snapshot` on order/bill rows | Order/Bill storage; Tax+Order co-own semantics |

Changing product tax config must **not** rewrite paid/finalized bill tax columns.

## 6. Tax packs

Pack install/activate remains `tax-packs.ts`. Product create/update only checks that `tax_category_id` exists on the active pack for the merchant country. Packs are TAX_OWNED; Product consumes them as validation input.

## 7. Order / billing relationship

```
Product (tax refs) → Tax facade → tax-engine
Order/Bill → Tax facade / persisted snapshot
```

Order/Bill call Tax at money-path time and persist SNAPSHOT_DATA (`tax_*` columns). Reports and refunds read stored bill values; they do not recompute from live product tax config for historical documents.

## 8. API compatibility

`POST /api/products` and `PUT /api/products/:id` still accept `tax_category_id` / `tax_behavior`. Request/response shapes unchanged. No frontend changes.

## 9. Database fields

| Field | Classification |
| --- | --- |
| `products.tax_category_id` | PRODUCT_OWNED persistence of TAX config reference |
| `products.tax_behavior` | PRODUCT_OWNED persistence of TAX config |
| `products.tax_type` | LEGACY_COMPATIBILITY (forced `none`; not authoritative) |
| `products.tax_rate` | LEGACY_COMPATIBILITY (forced `0`; not authoritative) |
| Order/bill `tax_amount` / `tax_snapshot` / `tax_breakdown` | SNAPSHOT_DATA (Tax + Order/Bill) |

**No migration.** Schema remains **v75**.

## 10. Legacy fields

`tax_type` / `tax_rate` stay on the row for compatibility but are forced to `none` / `0` on create/update. Authoritative config is category + behavior; calculation uses Tax packs.

## 11. Direct engine imports

`main/routes/products.ts` must not import `tax-engine` and must not call `calculateTax` / `calculateItemTax`. Money-path routes continue to use the Tax facade (Phase 2.11).

## 12. Desired dependency graph

```
Product ──(config refs)──► Tax facade ──► tax-engine
Order / Bill ──► Tax facade / persisted snapshot
```

Forbidden: Product → tax-engine; Product calculating tax; rewriting historical bill tax from product edits.

## 13. Vertical neutrality

Boundary has no table/KOT/KDS/waiter/kitchen concepts. Shared Product + Tax modules compose in Restaurant and synthetic retail-test.

## 14. retail-test composition

`retail-test` enabled modules already include `product` and `tax`. Phase 2.13 characterization asserts that composition; no fixture redesign.

## 15. Remaining coupling

- Tax config columns still physically on `products`
- Order/Bill still orchestrate Tax at money-path time
- Open-order charge tax may recompute from live pack rates using frozen category IDs (documented nuance from 2.11)
- Menu CSV / addons still assign categories via Tax validation helpers
- Legacy `tax_type` / `tax_rate` columns remain until a future removal milestone

## 16. Future removal candidates

- Drop or stop returning legacy `tax_type` / `tax_rate` after consumers prove unused
- Optional digest-in-snapshot (deferred from 2.11)
- Physical split of tax config columns off `products` only if extraction demands it
- Fail-closed module dependency enforcement (after pilots)

## 17. Extraction readiness

| Module | Before | After 2.13 |
| --- | --- | --- |
| Product | HIGH | **HIGH** (clearer map; columns still colocated) |
| Tax | MEDIUM | **MEDIUM** (clearer ownership; not package-ready) |

This phase clarifies the map — it does **not** make either module package-extractable.

## 18. Characterization tests

`tests/product-tax-boundary.test.ts` (`npm run test:product-tax-boundary`) locks metadata persistence, no product→engine import, facade goldens, snapshot keys, API compatibility, historical bill immutability, category validation, vertical composition, and schema v75.

## Schema

**No migration.** Still schema **v75**.

## Related

- [phase-2.11-tax-snapshot-contract.md](phase-2.11-tax-snapshot-contract.md)
- [phase-2.9-product-inventory-boundary.md](phase-2.9-product-inventory-boundary.md)
- [module-ownership.md](module-ownership.md)
- [extraction-readiness.md](extraction-readiness.md)
