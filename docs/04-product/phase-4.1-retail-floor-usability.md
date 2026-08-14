# Phase 4.1 — Retail Floor Usability

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 unchanged  
**Money path:** UNCHANGED  
**Inventory mutations:** UNCHANGED

**Discovery:** [phase-4-product-completion-discovery.md](phase-4-product-completion-discovery.md)

---

## 1. Problem

Retail (and any composition without the `tables` module) previously felt like Restaurant chrome with nav items hidden:

- Settings still showed **Tables required**
- Direct `/tables` still rendered the restaurant floor and polled `/api/tables`
- POS search filtered by **product name only** (SKU ignored; barcode only on exact Enter / wedge)
- Successful wedge scans added items with little feedback; unknown codes already toasted, but success was silent

## 2. Changes

| Area              | Change                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Settings**      | `showTablesBusinessControls = isModuleEnabled('tables', settingsVerticalId)`; wrap `tablesRequired` UI                        |
| **`/tables`**     | Fail-closed via `isFeatureAvailable('tables', tables_required, composition.verticalId)` + EmptyState (same pattern as `/kds`) |
| **POS search**    | Shared helpers match name **or** SKU **or** barcode; Enter exact-matches barcode/SKU                                          |
| **Scan feedback** | Success toast `pos.barcodeAdded`; unknown code toast retained; focused-search Enter does not double-fire with wedge           |
| **API**           | `GET /api/products?search=` also LIKE-matches `barcode` (exact `?barcode=` unchanged)                                         |

## 3. Existing architecture reused

- Module registry: `isModuleEnabled` / `isFeatureAvailable`
- Platform composition: `usePlatformComposition` → `verticalId` (no second vertical detector)
- KDS fail-closed EmptyState / LoadingState pattern
- Existing `useBarcodeScanner` wedge hook
- Existing product list on POS (`GET /products?active=1`) — client filter + optional API search enrichment

## 4. API

**Reused:** `GET /api/products`, `GET /api/products?barcode=`, `GET /api/settings/business`, `GET /api/platform/composition`

**Minimal change:** `search` query now:

```sql
AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
```

No new endpoints. No schema. Result shape unchanged.

## 5. Schema

**v75 unchanged.** No migration.

## 6. Money Path

**UNCHANGED.** Search only selects products into the existing cart/checkout path.

## 7. Inventory

**UNCHANGED.** No stock mutation, reservation, restock, or adjust paths touched.

## 8. Restaurant

**PASS.** Tables module on → Settings tables control visible; `/tables` loads floor when `tables_required`; POS search improvements are additive for Restaurant too.

## 9. Retail / tables-off compositions

**PASS.** When `tables` module is off (production `retail` or synthetic `retail-test`):

- Settings does not show tables required
- `/tables` shows unavailable EmptyState (no floor poll)
- Nav already hid Tables; route is now fail-closed
- Name / SKU / barcode POS search works

## 10. Tests

| Suite                                              | Result                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `npm run test:retail` / `test:phase-4.1`           | PASS                                                   |
| `tests/phase-4.1-retail-floor-usability.test.ts`   | PASS                                                   |
| `test:flo-settings-module-gating`                  | PASS                                                   |
| `test:flo-tables`                                  | PASS                                                   |
| `test:issue-137-barcode` (incl. Scenario G search) | PASS                                                   |
| `test:restaurant-isolation`                        | PASS                                                   |
| `test:order-boundary`                              | PASS                                                   |
| `test:inventory-boundary`                          | PASS                                                   |
| `test:flo-pos`                                     | PASS                                                   |
| `npm test`                                         | PASS (0 failed; ports cleared of conflicting Electron) |
| `npm run lint`                                     | 0 errors                                               |
| `npm run build`                                    | PASS                                                   |
| `npm run build:frontend`                           | PASS                                                   |

## 11. Non-goals (explicit)

- returns / restock / exchanges
- suppliers / PO / receiving
- variants
- low-stock hub
- accounting export
- schema changes / barcode UNIQUE
- tax cleanup (3.5B)
- service / package extraction
- P1.6

## Unrelated discoveries (not implemented)

- Working tree still has uncommitted Phase 3.3 production-`retail` module files; 4.1 gates by **tables module**, so they work once that composition is present/committed.
- Settings “Server App” / tableside tab remains restaurant-oriented chrome (out of 4.1 scope).
- Held-orders remain mounted under shared `order` but table-scoped (documented earlier).

## Next recommended (do not auto-implement)

1. Low-stock attention hub (SAFE)
2. Return/restock policy + implementation
3. Accounting CSV
4. Exchanges (after restock)
