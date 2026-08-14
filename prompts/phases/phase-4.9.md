# Phase 4.9 — Customer Deactivate Lifecycle

## Status

PENDING

## Objective

Complete the customer `is_active` lifecycle started in Phase 3.6E by adding an explicit **deactivate** adapter and Customers-admin action. Flag only. No loyalty, wallet, or POS search changes.

## User Story

As an owner/manager, I need to deactivate a customer from the Customers list so they no longer appear in POS search, and later reactivate them with the existing Reactivate action.

## Why This Phase

- 3.6E: `GET /customers?include_inactive=true`, `POST /customers/:id/reactivate`, POS search stays active-only.
- 3.6E doc: **Deactivate API = None**. Historical `DELETE /:id` soft-delete was removed. `PUT` does not write `is_active`.
- Phase 4 discovery listed “Customer deactivate API” as lifecycle completeness.

## Existing System Evidence

| Area       | Evidence                                                  |
| ---------- | --------------------------------------------------------- |
| Flag       | `customers.is_active` INTEGER 1/0                         |
| Reactivate | `POST /api/customers/:id/reactivate`                      |
| List       | `GET /api/customers?include_inactive=true` owner/manager  |
| POS        | `GET /api/customers-search` active-only                   |
| PUT        | Contact fields only — ignores `is_active`                 |
| Create     | Phone collision with inactive row soft-reactivates        |
| UI         | `frontend/src/components/customers/CustomersTable.tsx`    |
| Doc        | `docs/03-architecture/phase-3.6e-inactive-customer-ux.md` |

## Existing APIs / Services

- `POST /api/customers/:id/reactivate`
- `GET /api/customers`, `GET /api/customers-search`
- `main/routes/customers.ts`

## Existing Schema

**v75.** No new column. No `deleted_at` on customers.

## Vertical Impact

### Restaurant

Shared `customer` module — same admin UX.

### Retail

Same. No vertical-specific CRM.

## Dependencies

- Phase 3.6E complete.
- Do not change loyalty ledger or wallet APIs.

## Explicit Non-Goals

- Hard delete
- GDPR purge / anonymization
- Loyalty clawback / wallet freeze
- POS search of inactive (must stay excluded)
- Widening reactivate/deactivate to cashier if 3.6E reactivate roles differ — **match reactivate auth** (inspect route: 3.6E said owner|manager|cashier|waiter for reactivate; deactivate should be **owner|manager only** unless tests prove reactivate is already tighter — prefer owner/manager for deactivate)
- Schema, money, inventory

## Implementation Strategy

1. Characterize reactivate + include_inactive + POS search tests (`tests/` customer / 3.6E).
2. Add `POST /api/customers/:id/deactivate` — set `is_active = 0`, `updated_at` only.
3. 400 if already inactive; 404 if missing.
4. Customers table: Deactivate on active rows (owner/manager); keep Reactivate on inactive.
5. Confirm POS search excludes the row without client changes.
6. Docs + feature-list.

## TDD REQUIREMENTS

Before implementation:

- inspect 3.6E / customer tests
- add characterization if deactivate is untested (it will fail until implemented — that’s RED)
- define acceptance tests
- implement smallest safe change
- run focused tests

## SUBAGENT PLAN

| Subagent            | Responsibility                                            | Allowed files                                  | Forbidden files             | Expected output     |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------- | --------------------------- | ------------------- |
| Discovery Agent     | Confirm PUT cannot set is_active; confirm reactivate auth | `main/routes/customers.ts` (read)              | loyalty, wallet, bills      | Auth recommendation |
| Backend Agent       | deactivate route + audit if peers audit reactivate        | `main/routes/customers.ts`, validation if used | `main/db.ts`, loyalty       | Endpoint            |
| Frontend Agent      | Deactivate action + i18n                                  | customers components/page                      | POS CustomerSearch behavior | UI                  |
| Test Agent          | phase-4.9 suite                                           | `tests/phase-4.9*.ts` or extend 3.6E tests     | money tests rewrite         | Tests               |
| Isolation Agent     | Shared module; both verticals                             | composition if needed                          | schema                      | Isolation           |
| Documentation Agent | phase-4.9 + 3.6E pointer + `.ai`                          | docs, `.ai`, feature-list                      | unrelated                   | Docs                |
| Reviewer Agent      | Diff                                                      | phase files                                    | STATE dirty tree            | Review              |

## TRANSACTION / MONEY SAFETY

| Surface                                            | Touched?      |
| -------------------------------------------------- | ------------- |
| orders / bills / payments / refunds / tax / FIN-01 | **NO**        |
| loyalty / wallet                                   | **NO writes** |
| inventory / shifts / day-close                     | **NO**        |

If deactivate starts zeroing wallet or blocking historical bills: **STOP**.

## SCHEMA SAFETY

- schema change: **NO**
- migration required: **NO**

If schema change is required: **STOP**.

## API CONTRACT

**Existing reused:** reactivate, include_inactive list, customers-search.

**Proposed:**

```http
POST /api/customers/:id/deactivate
Authorization: Bearer <owner|manager JWT>
→ 200 { customer }
→ 400 Already inactive
→ 404 not found
```

- Idempotency: not money; 400 on repeat is acceptable (mirrors reactivate “Already active”).
- No body required.

## VERTICAL ISOLATION

Shared customer module. Restaurant and Retail both get the admin action. POS search remains active-only on both.

## TEST MATRIX

- Focused 4.9 (deactivate, already inactive, 403 cashier, POS search exclusion, reactivate still works)
- 3.6E regression
- Restaurant / Retail (shared)
- `npm test` · lint · builds

## BUILD GATES

Focused phase test · `npm test` · `npm run lint` · `npm run build` · `npm run build:frontend`

## DOCUMENTATION

- `docs/04-product/phase-4.9-customer-deactivate.md` (or `docs/03-architecture/` if matching 3.6E location — prefer `docs/04-product/` for Phase 4 numbering)
- feature-list Customers
- `.ai/context.md`, `.ai/tasks.md`, `.ai/patterns.md`

## COMMIT

Phase-only. Suggested: `feat: add customer deactivate lifecycle`

## COMPLETION CRITERIA

- implementation finished
- focused + 3.6E regression pass
- isolation pass
- lint + builds pass
- documentation updated
- git commit created
- no blocker
- schema v75
