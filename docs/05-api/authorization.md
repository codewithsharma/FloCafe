# Authorization

## CURRENT STATE

### Roles
`owner | manager | cashier | waiter | chef`

### Enforcement
`requireRole(...roles)` middleware per route.

### Notable rules
- Staff management: managers cannot modify owner/manager (except owner)
- KDS: chef, manager, owner — station/category scoped
- Server App: waiter, manager, owner
- Database tools: owner + master PIN
- Tax config: owner, manager
- Product/stock changes: owner, manager

### Manager PIN
Required for:
- Cancelling in-progress orders
- Voiding in-progress items

### Master PIN
Required for:
- Database initialize/wipe
- Master PIN reset
- Password recovery

**Evidence:** `tests/authz-matrix-phase3.test.ts`, `tests/staff-authz.test.ts`
