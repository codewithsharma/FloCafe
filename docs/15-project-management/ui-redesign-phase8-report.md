# UI Redesign Phase 8 Report — Menu / Inventory (Products)

**Status:** Complete  
**Date:** 2026-08-12  
**Scope:** `/products` menu inventory workspace and `/addon-groups` redirect only.

## Goal

Redesign the Products / Categories / Add-on Groups workspace with Flo design tokens and extracted table components while preserving all CRUD, tax, loyalty, inventory, CSV, bulk tax, and role-gate behavior in `products/page.tsx`.

## Deliverables

| Area | Change |
| --- | --- |
| **PageHeader** | Replaces legacy `h1` title block |
| **LoadingState** | Replaces inline spinner during initial fetch |
| **ProductsTabBar** | Flo-styled tab bar (Products \| Categories \| Add-on Groups) |
| **ProductsTable** | Panel wrapper, StatusBadge for active/inactive, EmptyState |
| **CategoriesTable** | Panel wrapper, StatusBadge for active/inactive, EmptyState |
| **AddonGroupsTable** | Panel wrapper, StatusBadge for required/optional, EmptyState |
| **activeStatusVariant** | New helper in `lib/flo-display.ts` |
| **Tab URL param** | `?tab=addons` opens add-on groups tab (supports redirect) |
| **addon-groups/page.tsx** | Client `router.replace('/products?tab=addons')` |
| **Tests** | `tests/flo-products.test.ts` via `npm run test:flo-products` in `test:security` |

## Preserved (unchanged)

- All product/category/addon-group CRUD API calls
- Tax category assignment, tax behavior, bulk tax modal
- Loyalty cashback fields and validation
- Inventory tracking and low-stock display
- CSV import/export for products, categories, add-ons
- Owner/manager role gates on edit/delete actions
- Restaurant-only add-on groups tab visibility
- Product form modals (image upload, tags, addon group checkboxes)

## Verification

```sh
npm run test:flo-products
npm run build:frontend
npm run lint
```

## Next recommended phase

- **Phase 7:** Orders/Bills workspace
- **Phase 3 (deferred):** Modal migration to Flo primitives
