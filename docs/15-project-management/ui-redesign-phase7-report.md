# UI Redesign Phase 7 Report — Orders/Bills Workspace

**Status:** Complete  
**Date:** 2026-08-12  
**Scope:** `/orders` Orders/Bills UI shell and cards — business logic, APIs, WebSocket, and polling unchanged.

## Goal

Redesign the Orders/Bills workspace with Flo design system components while preserving all checkout, cancel, void, print, WhatsApp, held-order, and discount behavior (~1690 LOC page orchestration retained).

## Deliverables

| Area | Change |
| --- | --- |
| **Page shell** | `PageHeader`, `LoadingState`, `EmptyState`; Flo-token tab filters |
| **OrdersFilterBar** | Search + table/type/status selects with Flo tokens |
| **OrderCard** | `Panel`, `StatusBadge`, `MoneyDisplay` (total), `orderStatusVariant` / `itemStatusVariant` |
| **HeldOrderCard** | `Panel` + `StatusBadge`; resume/delete actions preserved |
| **Dialogs** | Left in page (PaymentModal, print, cancel, void, discount, add-items) — Phase 3 modal migration deferred |
| **Tests** | `tests/flo-orders.test.ts` via `npm run test:flo-orders` in `test:security` |

## Preserved (unchanged)

- Orders polling `10000` ms; `now` snapshot `30000` ms; WebSocket reconnect `3000` ms
- `PaymentModal`, `useConfirm`, held-orders store, cart restore to POS
- Handlers: checkout, cancel, void, discount, print, WhatsApp/Flo send, add items, convert takeaway, link customer
- APIs: `GET /orders`, `POST /bills/generate`, bill print/print-history, order item cancel/restore, discount, convert-to-takeaway, customer link

## Out of scope

- Products, customers, staff, settings, reports, operations, dashboard analytics relocation
- Backend / schema changes
- Modal migration to Flo Dialog primitives (Phase 3 deferred)

## Verification

```sh
npm run test:flo-orders
cd frontend && npx cross-env NEXT_BUILD_MODE=desktop npm run build
```

## Next recommended phase

- **Phase 8:** Menu/Inventory (if not already claimed)
- **Phase 3 (deferred):** Modal migration to Flo primitives
- **Phase 12:** Responsive / a11y / performance pass
