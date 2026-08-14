# Phase 4.7 — Restaurant 86 (Sold-Out) Workflow

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**  
**Baseline:** Phase 4.6 ADR-013 Accepted (identity lock; no matrix)

**Related:** [feature-list.md](../00-product/feature-list.md) · [ADR-013](../14-decisions/ADR-013-retail-product-variants-sku-identity.md)

---

## Summary

Restaurant owners and managers can **86** a menu item from POS in one action. That toggles existing `products.is_active` through a narrow availability adapter. The item disappears from `GET /api/products?active=1`. Restore from the POS 86'd strip (or Products admin). Stock is never written.

Retail POS has **no** 86 chrome. The HTTP adapter is on the shared Product module and remains callable; UI is Restaurant-first.

---

## Discovery

| Question                  | Verdict                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ADR required?             | **No** — reuses `products.is_active`; no schema; no money path                                               |
| PUT `{ is_active }` only? | **COALESCE-safe** (name/price/stock preserved) but **no Zod, no audit**, and a full PUT body can write stock |
| Adapter?                  | **Yes** — `POST /api/products/:id/availability`                                                              |
| Cashier 86?               | **Non-goal** (403)                                                                                           |
| Stock=0 as 86?            | **No** — inventory badges stay inventory                                                                     |

---

## API

```http
POST /api/products/:id/availability
Authorization: Bearer <owner|manager JWT>
{ "is_active": false }
→ 200 { product }
```

| Rule              | Detail                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| Auth              | `requireRole('owner','manager')` — cashier **403**                     |
| Body              | Zod `{ is_active: boolean }` — missing/invalid **400**                 |
| Missing / deleted | **404** `{ error: 'Product not found' }`                               |
| Stock             | **Unchanged.** No `inventory_movements` row                            |
| Audit             | `product.availability`, `entityType=product`, metadata `{ is_active }` |
| Idempotency       | Repeat toggle OK; last write wins                                      |

Existing: `GET /api/products?active=1` continues to hide inactive products.

---

## UI

| Surface  | Behavior                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gate     | `canShowRestaurantEightySix(verticalId, role)` — `verticalId === 'restaurant'` **and** owner/manager. Fail closed while composition is undefined |
| Grid     | Overflow kebab on the product tile (`data-testid="pos-product-86"`), not nested inside the add-to-cart control                                   |
| After 86 | Catalog refresh; tile removed                                                                                                                    |
| Restore  | Restaurant POS strip (`pos-86-restore-strip`) lists inactive products; Products admin Active checkbox unchanged                                  |
| Retail   | No 86 control on POS                                                                                                                             |

---

## Tests

`npm run test:phase-4.7` → `tests/phase-4.7-menu-86.test.ts`

- Characterization: PUT `{ is_active }` keeps name/price/stock; `?active=1` hides inactive
- Adapter: 86 / un-86, stock unchanged, 404, cashier 403, Zod 400, audit, last-write-wins
- Source-scan: Restaurant gate; Retail POS has no 86 chrome
- Isolation: shared adapter remains callable on retail; schema stays v75

---

## Explicit non-goals (unchanged)

Schema / 86 history / timed auto-un-86 · station-level 86 · recipes/BOM · stock writes · cashier 86 · Retail POS 86 button · money path
