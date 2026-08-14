# Phase 3.6E — Soft-Reactivate / Inactive-Customer UX

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**

---

## Objective

Make existing inactive customers discoverable in the Customers admin workflow and allow safe reactivation without SQL, without changing loyalty/wallet/history, and without changing POS cashier search.

---

## Existing customer lifecycle representation

| Fact             | Detail                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Column           | `customers.is_active` INTEGER (`1` active default, `0` inactive)                                         |
| Soft-delete      | Flag only — no `deleted_at`                                                                              |
| Deactivate API   | **None** (historical `DELETE /:id` soft-delete removed; customers intentionally not deletable)           |
| Soft-reactivate  | `POST /api/customers` with same `phone_digits` as an inactive row → `UPDATE … is_active = 1` (same `id`) |
| Loyalty / wallet | **Not gated** on `is_active`; ledger keyed by `customer_id` only                                         |

Legacy inactive rows may exist from the former soft-delete path.

---

## Existing API contract

| Endpoint                    | Inactive behavior                                    |
| --------------------------- | ---------------------------------------------------- |
| `GET /api/customers`        | Hard `WHERE is_active = 1` — inactive never returned |
| `GET /api/customers-search` | Hard `WHERE is_active = 1` — POS excluded            |
| `GET /api/customers/:id`    | Returns inactive if id known                         |
| `GET /api/crm/lookup`       | By phone; does not filter active                     |
| `POST /api/customers`       | Soft-reactivates inactive phone collision            |
| `PUT /api/customers/:id`    | Contact fields only — **does not** write `is_active` |

Auth (unchanged baseline): list/search/get/create = owner|manager|cashier|waiter; PUT = owner|manager|cashier.

---

## Existing UI behavior

- Customers page / `CustomersTable`: no `is_active`, no badge, no show-inactive.
- POS `CustomerSearch`: uses `/customers-search` → inactive excluded (preserve).

---

## Selected UX (Phase 3.6E)

1. **List adapter (required):** `GET /api/customers?include_inactive=true`
   - Honored only for **owner|manager** (cashier/waiter still get active-only — deliberate locate workflow).
   - Default omitted → active-only (byte-compatible with today).
   - Response already includes `c.*` → `is_active` present when rows return.

2. **Reactivate adapter (required for id button / phoneless):** `POST /api/customers/:id/reactivate`
   - Sets **only** `is_active = 1` + `updated_at`.
   - No loyalty/wallet/order writes.
   - Auth: owner|manager|cashier|waiter (same as existing phone soft-reactivate via POST create — **no permission widening**).
   - Phone-collision soft-reactivate via `POST /` remains for create-flow parity.

3. **UI:** Customers page “Show inactive” toggle (owner/manager); inactive badge + muted row; Reactivate action waits for backend success then refreshes.

4. **POS:** unchanged — search stays active-only.

---

## Why backend changes are required

Without `include_inactive`, the Customers list **cannot** surface inactive rows (STOP if we refused any adapter).  
Without id reactivate, phoneless inactive rows and a one-click Reactivate button cannot safely reuse PUT (PUT ignores `is_active`) without forcing a create-form phone POST overwrite.

Both adapters are lifecycle **writes/reads of the existing `is_active` flag** — no new column, no schema, no money path.

---

## Vertical impact

`customers` is shared commerce. No tables/KDS/addons. Restaurant and Retail both get the same admin UX.

---

## Tests

- `npm run test:inactive-customer` — list filter, reactivate semantics, UI contracts, POS search exclusion preserved, loyalty untouched on reactivate
- Existing: `customer-soft-reactivate-bindings`, `customer-phone-search`, `phone-search-integration`, `customer-auth`, `flo-customers`

---

## Explicit non-goals

Deactivate UI · delete/merge · schema · loyalty/wallet redesign · POS picker include-inactive · CRM redesign · money path · P1.6 · 3.5B/3.5C
