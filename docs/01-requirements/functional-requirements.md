# Functional Requirements

## Convention
- **FR-C-xx** = CURRENT (implemented in FloCafe)
- **FR-T-xx** = TARGET (RestaurantOS planned)

## POS & Orders

| ID | Requirement | State | Evidence |
|----|-------------|-------|----------|
| FR-C-01 | System shall create orders with line items and addons | CURRENT | `main/routes/orders.ts` |
| FR-C-02 | System shall support dine-in, takeaway, delivery types | CURRENT | `orders.type` |
| FR-C-03 | System shall hold orders per table | CURRENT | `held_orders` |
| FR-C-04 | System shall enforce manager PIN for in-progress cancellation | CURRENT | `cancel-override.test.ts` |
| FR-C-05 | System shall generate bills from orders | CURRENT | `main/routes/bills.ts` |
| FR-C-06 | System shall support split checks and split payments | CURRENT | `bill_items`, payment tests |
| FR-T-01 | System shall support shift open/close with cash reconciliation | TARGET | NOT IMPLEMENTED |
| FR-T-02 | System shall process payment refunds with audit trail | TARGET | NOT IMPLEMENTED |

## Kitchen

| ID | Requirement | State | Evidence |
|----|-------------|-------|----------|
| FR-C-10 | System shall display kitchen orders via WebSocket | CURRENT | `main/services/kds.ts` |
| FR-C-11 | System shall route items to kitchen stations by category | CURRENT | issue-134 tests |
| FR-C-12 | System shall print KOT to configured printers | CURRENT | `thermal.ts` |

## Inventory

| ID | Requirement | State | Evidence |
|----|-------------|-------|----------|
| FR-C-20 | System shall optionally track product stock quantity | CURRENT | `products.track_inventory` |
| FR-C-21 | System shall decrement stock on order placement | CURRENT | `orders.ts` |
| FR-T-20 | System shall maintain ingredient-level stock ledger | TARGET | NOT IMPLEMENTED |

## Auth & Staff

| ID | Requirement | State | Evidence |
|----|-------------|-------|----------|
| FR-C-30 | System shall authenticate via JWT | CURRENT | `auth.ts` |
| FR-C-31 | System shall enforce role-based route access | CURRENT | `requireRole()` |
| FR-C-32 | System shall support master PIN for destructive ops | CURRENT | `master-pin.ts` |
