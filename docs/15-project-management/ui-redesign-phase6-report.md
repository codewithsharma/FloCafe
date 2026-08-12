# UI Redesign Phase 6 Report — Tables Workspace

**Status:** Complete  
**Date:** 2026-08-12  
**Scope:** `/tables` floor management UI — API contracts and polling unchanged.

## Goal

Redesign the tables workspace as an operational floor view using Flo design system components while preserving all table/order management behavior.

## Deliverables

| Area | Change |
| --- | --- |
| **Page shell** | `PageHeader`, `LoadingState`, `EmptyState` on tables page |
| **TablesGrid** | Responsive grid; detailed (1/2/3-col) vs compact (2/4/6-col) modes |
| **TableDetailCard** | `Panel` with 4px status left border, `StatusBadge`, nested order details |
| **TableCompactCard** | Min 100×100px touch targets, status badge + tint |
| **TableOrderDetail** | Order header + line items via `StatusBadge` |
| **ReserveTableDialog** | shadcn `Dialog`; customer search/create logic preserved |
| **AddTableDialog** | shadcn `Dialog`; create form preserved |
| **flo-display.ts** | `tableStatusVariant`, `tableStatusAccentClass`, `orderStatusVariant`, `itemStatusVariant` |
| **tables-orders.ts** | Pure `buildOrdersByTable()` helper |
| **Tests** | `tests/flo-tables.test.ts` wired via `npm run test:flo-tables` |

## Preserved (unchanged)

- 10s polling for tables; orders polled only when `showDetails` is true
- `localStorage` key `tables_showDetails`
- Status actions: mark available, reserve, deactivate/reactivate
- All API endpoints (`GET/POST/PATCH /tables`, customer search/create for reservations)
- Dual view modes (compact vs detailed with order breakdown)
- POS `TablePickerModal` / `TableCheckoutModal` — out of scope

## Verification

```sh
npm run test:flo-tables
npm run build:frontend
npm run lint
```

## Next recommended phase

- **Phase 7:** Orders/Bills workspace (`/orders`)
- **Phase 3 (deferred):** Modal migration to Flo primitives
