# R7 — Customer & CRM OS

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v82  
**Suite:** `npm run test:r7`  
**Baseline:** Foundation Phase 2 `318b008`

---

## Purpose

Production-quality Customer & CRM OS for Operavia Restaurant / café:

Customer → Visits → Orders → Preferences → Loyalty → Retention

Deepens the **existing** customer + loyalty stack. Does **not** create a second customer model. Does **not** implement gift cards, marketing campaigns, WhatsApp/email delivery, or full BI (R12).

---

## Scope

| Area          | Delivered                                                  |
| ------------- | ---------------------------------------------------------- |
| Profile       | Create/update/archive, E.164 phone, search, Zod            |
| Order history | Derived from `orders` (SoR); cents-preferred spend         |
| Customer 360  | `GET /api/customers/:id/crm` + UI `/customers/detail/?id=` |
| Segments      | Central `crm_segment_rules` + explainable multi-labels     |
| Preferences   | Derived from order items / categories / `tag_counts`       |
| Notes         | Audited `customer_notes` with RBAC                         |
| Loyalty       | Existing wallet ledger integrated into 360 (no rebuild)    |
| Metrics       | `GET /api/customers/metrics` (owner/manager)               |
| Offline       | SQLite-only; no cloud dependency                           |

---

## Architecture

- HTTP: `main/routes/customers.ts` (expanded) + existing POS `/api/customers-search`
- Domain: `main/services/customer-crm.ts`, `main/services/customer-segments.ts`
- Validation: `main/validation/customers.ts`
- Money: `preferCents` / integer cents for CRM spend metrics
- Audit: existing `audit_logs` via `logAuditEvent`
- UI: list deepen + Customer 360 detail page

Orders / bills / loyalty_ledger remain the financial and loyalty sources of truth.

---

## Data model

| Table / setting              | Role                                          |
| ---------------------------- | --------------------------------------------- |
| `customers`                  | Unchanged profile model (`is_active` archive) |
| `customer_notes` (v82)       | Controlled notes with actor + soft delete     |
| `settings.crm_segment_rules` | JSON thresholds for segments                  |
| `orders` / `order_items`     | History + preferences                         |
| `loyalty_ledger`             | Wallet balance / history (existing)           |
| `refunds`                    | Refunded amount via bill `customer_id`        |

---

## APIs

| Method     | Path                                         | Roles                                       |
| ---------- | -------------------------------------------- | ------------------------------------------- |
| GET        | `/api/customers` (+ `segment`, search)       | owner/manager/cashier/waiter                |
| GET        | `/api/customers/metrics`                     | owner/manager                               |
| GET        | `/api/customers/:id/crm`                     | owner/manager/cashier/waiter                |
| GET/POST   | `/api/customers/:id/notes`                   | read: +waiter; write: owner/manager/cashier |
| PUT/DELETE | `/api/customers/:id/notes/:noteId`           | owner/manager                               |
| POST       | `/api/customers`, PUT, deactivate/reactivate | existing RBAC preserved                     |

---

## UI

- `/customers` — search, segment filter, inactive toggle, CRM metrics strip (owner/manager), 360 link
- `/customers/detail/?id=` — Customer 360 (static-export safe query route)
- POS customer search unchanged (`/api/customers-search`)

---

## RBAC

| Role            | Access                                                      |
| --------------- | ----------------------------------------------------------- |
| Owner / Manager | Full CRM + metrics + note manage                            |
| Cashier         | Lookup, create/update profile, create notes                 |
| Waiter          | Lookup, create, reactivate; no profile update / notes write |
| Chef            | No CRM routes                                               |

---

## Audit

- `customer.created` / `customer.updated` / `customer.archived`
- `customer.note_created` / `customer.note_updated` / `customer.note_deleted`
- `customer.loyalty_changed` on wallet debit (payment), cashback credit, and wallet refund credit (alongside existing `payment.received` / `payment.refunded`)

---

## Offline / financial behavior

- All CRM reads/writes are local SQLite.
- Spend metrics use `COALESCE(total_cents, ROUND(total*100))` / `preferCents`.
- FIN-01 and tender semantics unchanged.
- REAL columns not dropped.

---

## Tests

`npm run test:r7` — S-CRM-01 … S-CRM-20 (create/update/archive, phone, duplicates, order link, 360, cents, segments, preferences, notes RBAC/audit, loyalty visibility, offline, search, history preserve, unauthorized, regression).

---

## Capability matrix impact

Promoted to Existing (tested): visit frequency, customer segmentation, customer preferences, customer lifetime value (spend/AOV/net metrics in CRM).  
Loyalty points/wallet/cashback remain Existing (integrated, not rebuilt).  
Rewards / gift cards / coupons / marketing stay Planned/Later.

---

## Remaining gaps

- Gift cards / rewards catalog / campaigns (out of scope)
- Marketing delivery (R11)
- Advanced BI cohorts (R12)
- Fuzzy full-text search
- Dynamic `/customers/:id` path (static export uses `detail/?id=`)
