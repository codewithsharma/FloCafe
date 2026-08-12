# UI Redesign Phase 9 Report — Customers / Team

**Status:** Complete  
**Date:** 2026-08-12  
**Scope:** `/customers` and `/staff` UI only — API contracts and business rules unchanged.

## Goal

Redesign Customers and Team workspaces with Flo design system primitives (PageHeader, Panel, LoadingState, EmptyState, StatusBadge, MoneyDisplay, shadcn Dialog) while preserving phone validation, search debounce, sort, ledger, PIN rules, and role guards.

## Deliverables

| Area | Change |
| --- | --- |
| **Customers page** | Flo `PageHeader` + `LoadingState`; invalid-phone filter badge; orchestration only |
| **CustomersTable** | Search + sortable table in `Panel`; `MoneyDisplay` for spend; `EmptyState` |
| **CustomerFormDialog** | shadcn `Dialog` for add/edit; phone/email fields preserved |
| **CustomerLedgerDialog** | shadcn `Dialog` for loyalty ledger; `LoadingState` / `EmptyState` |
| **Staff page** | Flo `PageHeader` + `LoadingState`; role/PIN/password logic preserved |
| **StaffGrid** | `Panel` cards with `StatusBadge` via `staffRoleVariant` |
| **StaffFormDialog** | shadcn `Dialog`; PIN digit filter + owner/manager gate; last-active-owner role lock |
| **StaffResetPasswordDialog** | shadcn `Dialog` for password reset |
| **flo-display.ts** | `staffRoleVariant()` helper |
| **Tests** | `tests/flo-customers.test.ts`, `tests/flo-staff.test.ts` via `test:flo-customers` / `test:flo-staff` in `test:security` |

## Preserved (unchanged)

### Customers
- `parsePhone` validation before save
- 250ms debounced search + `AbortController`
- Sort field/order query params
- `filter=invalid_phones` URL filter
- APIs: `GET/POST /customers`, `PUT /customers/:id`, `GET /customers/:id/wallet`
- First-200 notice

### Team
- Role list: owner, manager, cashier, waiter, chef
- Password confirm mismatch checks
- PIN: digits only, max 6, owner/manager only
- Last active owner cannot change role away from owner
- APIs: `GET/POST /staff`, `PUT /staff/:id`, deactivate/reactivate

## Out of scope

- Orders, products, settings, dashboard, reports, operations
- Backend/API changes
- Shift history deep-link from Team (audit suggestion; deferred)

## Verification

```sh
npm run test:flo-customers
npm run test:flo-staff
npm run build:frontend
```

## Next recommended phase

- **Phase 7:** Orders/Bills workspace (`/orders`) — or Phase 8 Menu/Inventory if preferred
- **Phase 3 (deferred):** Broader modal migration to Flo primitives
