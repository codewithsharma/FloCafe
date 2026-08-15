<!-- Last updated: 2026-08-15, schema v83 -->

# R9 Slice 1 — Expenses OS

**Status:** COMPLETE (Slice 1 only)  
**Schema:** **v83** (`r9_expenses_os`)  
**Suite:** `npm run test:r9`  
**Authorization:** Engineering/Product development waiver — **does not** authorize live go-live, signed RC claims, or OPS-02 site PASS.

## Scope delivered

| Area      | Delivered                                                                                 |
| --------- | ----------------------------------------------------------------------------------------- |
| Migration | v82 → v83 `expenses` table; fresh + upgrade; deterministic                                |
| Money     | `amount_cents INTEGER` only (`CHECK > 0`); no REAL expense amount; no REAL drop elsewhere |
| API       | `GET/POST /api/expenses`, `GET/PATCH /api/expenses/:id`, `POST /api/expenses/:id/void`    |
| RBAC      | Owner/Manager only; Cashier/Waiter/Chef 403                                               |
| Audit     | `expense.created` / `expense.updated` / `expense.voided` via `audit_logs`                 |
| UI        | `/expenses` Owner/Manager list + create + void                                            |
| Offline   | Local SQLite SoR; no cloud dependency                                                     |

## Expense columns (v83)

`id`, `amount_cents`, `category`, `description`, `notes`, `expense_date`, `status` (`posted`\|`voided`), `created_by_user_id`, `updated_by_user_id`, `voided_by_user_id`, `voided_at`, `void_reason`, `created_at`, `updated_at`

Categories: supplies, rent, utilities, wages, maintenance, marketing, transport, other.

## Explicitly not in Slice 1

Tax export depth · audit-trail product polish · day-close/Z polish · ops finance reports · food-cost report · service charge (ADR-014) · all R9 exclusions (QR, gift cards, tips, payroll, AI, Retail, Phase 4.16, REAL cutover, …).

## OPS-02 truth

Live café validation: **DEFERRED**  
Live Go-Live: **NO-GO**  
Signing/notarization: **BLOCKED**  
Engineering waiver: **development only**
