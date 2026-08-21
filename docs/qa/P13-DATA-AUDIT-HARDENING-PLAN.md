# P13 — Data & Audit Integrity Hardening Plan

**Feature ID:** `DATA-AUDIT-HARDENING`  
**Date:** 2026-08-21  
**Schema decision:** **Remain v88** (no bump)  
**Status:** PLAN COMPLETE — ready for minimal implementation

---

## Current-state findings (code evidence)

### Audit SoR

| Fact                                                          | Evidence                         |
| ------------------------------------------------------------- | -------------------------------- |
| Append-only by convention (`INSERT` only via `logAuditEvent`) | `main/services/audit-log.ts`     |
| Docs require call inside `withTxn`                            | same file header                 |
| HTTP audit API is GET (+ CSV export) only                     | `main/routes/audit-logs.ts`      |
| Immutability **not** DB-enforced (tests can UPDATE/DELETE)    | `tests/audit-log.test.ts`        |
| Actor normally from JWT, not body                             | payment/refund/discount patterns |
| Schema tip                                                    | **v88**                          |

### Mutation matrix (high-value paths)

| Mutation               | Audit event                              | Actor | Transactional                                  | Status                          |
| ---------------------- | ---------------------------------------- | ----- | ---------------------------------------------- | ------------------------------- |
| Bill payment           | `payment.received`                       | JWT   | Y                                              | OK                              |
| Refund                 | `payment.refunded`                       | JWT   | Y                                              | OK                              |
| Order-level discount   | `order.discount_applied`                 | JWT   | Y                                              | OK                              |
| Item discount          | `order.item_discount_applied`            | JWT   | **N (after commit)**                           | **GAP**                         |
| Order create           | `order.created`                          | JWT   | **N (after commit + after idempotency store)** | **GAP**                         |
| QR order create        | `order.created` (similar)                | JWT   | Post-commit risk                               | **GAP**                         |
| Bill `applyDiscount`   | **MISSING**                              | —     | Y mutation, no audit                           | **GAP Critical**                |
| Order/item cancel/void | audited                                  | JWT   | Y                                              | OK                              |
| Item restore           | **MISSING**                              | —     | Y                                              | GAP Med                         |
| Shift open/close       | audited                                  | JWT   | Y                                              | OK                              |
| Stock adjust           | audited                                  | JWT   | Y                                              | OK                              |
| Purchase receive       | audited                                  | JWT   | Y                                              | OK                              |
| Payment-method merge   | **MISSING**                              | —     | rewrites `payment_details`                     | **GAP High**                    |
| Print job retry        | `retry_requested` **success before I/O** | JWT   | N                                              | **GAP High (false success)**    |
| Backup                 | `backup.created` best-effort             | JWT   | N                                              | Document / leave                |
| Restore IPC            | `restore.*` actor **null**               | null  | After DB replace                               | Document / leave (architecture) |

---

## Exact gaps (authorized for P13)

### P0 — Critical / High (implement)

1. **`POST /bills/:id/applyDiscount`** mutates bill+order money with **zero** `logAuditEvent` (`main/routes/bills.ts` ~800–1035).
2. **`order.created` audited after `withTxn` + after idempotency store** (`main/routes/orders/create.ts` ~427–451) → retry can permanently skip audit.
3. **`order.item_discount_applied` after commit** (`main/routes/orders/discount.ts` ~780) → money can commit without audit.
4. **Print retry logs `print_job.retry_requested` with `result: 'success'` before `retryPrintJob`** (`main/routes/printers.ts` ~183–192) → false success audit if retry fails.
5. **Payment-method merge** rewrites historical `bills.payment_details` with no audit (`main/routes/payment-methods.ts` ~96–138).

### P1 — Medium (implement if small)

6. **Item restore** changes totals without audit (`main/routes/orders/cancel.ts` restore path).
7. **QR order create** same post-commit audit pattern as POS create (`main/services/qr-ordering.ts`).
8. **Runtime append-only protection** via DB triggers — **DEFERRED** (would break R12/audit fixture UPDATE/DELETE patterns). Remain convention-only; HTTP mutate routes absent; service has INSERT only.

### P2 — Out of scope / document only

- Redesign backup/restore audit continuity across DB replace
- Cloud/async audit queue
- Event sourcing
- REAL→cents
- Report semantic changes (P6–P12)
- Auto-86 null actor (document; stock path is system)
- HTTP `/import` missing audit (document; deeper restore redesign)
- Integrity checker full money↔audit reconciliation warehouse

---

## Risk ranking

| Rank | Gap                             | Risk                                           |
| ---- | ------------------------------- | ---------------------------------------------- |
| 1    | Bill applyDiscount no audit     | Silent money trail hole                        |
| 2    | Order create post-commit audit  | Permanent missing audit under idempotent retry |
| 3    | Item discount post-commit audit | Mutation without audit                         |
| 4    | Print retry false success       | Misleading accountability                      |
| 5    | Payment-method merge no audit   | Historical tender rewrite unaccountable        |
| 6    | Item restore / QR create        | Same class, smaller surface                    |
| 7    | No DB deny triggers             | Convention-only immutability                   |

---

## Proposed minimal fixes

1. Inside bill `applyDiscount` `withTxn`: `logAuditEvent({ action: 'bill.discount_applied', ... })` with JWT actor.
2. Move `order.created` `logAuditEvent` **inside** create `withTxn` (before return); skip on idempotent replay path already handled.
3. Move `order.item_discount_applied` **inside** item-discount `withTxn`.
4. Remove preemptive `print_job.retry_requested` success audit **or** emit only after successful claim with non-misleading semantics; keep `retry_succeeded` / `retry_failed`. Prefer: log `retry_requested` only when claim succeeds inside service, **or** delete premature route-level success and rely on succeeded/failed (plus `_rejected` for busy). Check P10 tests — may assert `retry_requested`; adjust to post-claim or change result semantics carefully.
5. Inside payment-method merge txn: `payment_method.merged` audit with source/target/affected count + JWT actor.
6. Item restore: `order.item_restored` inside existing txn.
7. QR create: move audit inside txn if structure allows.
8. `ensureAuditLogImmutabilityTriggers(db)` called from DB open path after migrations; triggers RAISE on UPDATE/DELETE.

**Schema:** v88 unchanged.

---

## Files expected to change

- `main/routes/bills.ts`
- `main/routes/orders/create.ts`
- `main/routes/orders/discount.ts`
- `main/routes/printers.ts` (+ possibly `main/services/print-queue.ts`)
- `main/routes/payment-methods.ts`
- `main/routes/orders/cancel.ts` (restore)
- `main/services/qr-ordering.ts`
- `main/services/audit-log.ts` (immutability triggers helper)
- `main/db.ts` or open path (call ensure triggers)
- `tests/data-audit-hardening.test.ts` (**new**)
- `package.json`, `tests/test-tiers.json`
- Docs / matrix / inventory / `.ai/*`

---

## Test plan

`npm run test:data-audit`:

- Bill applyDiscount → `bill.discount_applied` present; actor = JWT user
- Failed bill discount (paid bill) → no success audit
- Item discount audit rolls with txn (simulate by asserting audit count after success; rollback path via forced error if feasible)
- Order create + idempotent replay → exactly one `order.created` success
- Print retry failure → no false `retry_requested` success (or no orphan success-before-I/O)
- Payment merge → `payment_method.merged`
- UPDATE/DELETE on `audit_logs` blocked by trigger
- Client cannot set actor via body (bill discount uses JWT)
- Unauthorized cashier still 403 on sensitive paths
- P10 print-health still passes after retry audit change

Regression: critical, phase2, kds-h-outbox, inv-auto-86, rpt-*, kds-alerts, print-health, build, frontend build, lint baseline.

---

## Explicit out of scope

- P14 / new reports / profitability / BI / AI
- Multi-location, gateways, terminals, aggregators, payroll
- R16 / OPS-02 live gates
- REAL→cents migration
- Changing P6–P12 report money semantics
- Async/cloud audit pipeline
- Full event-sourcing immutability redesign
- Promoting entire Security/Data cluster to Existing

---

## Matrix promotion policy (conservative)

After evidence:

- **Audit logging** → remain **🟡 Hardening** (deepened; not full Existing claim across all mutations)
- **Data integrity validation / checks** → remain **🟡 Hardening** (triggers + targeted gaps; not full warehouse)
- Do **not** promote unrelated rows

---

## Production readiness

P13 COMPLETE ≠ live pilot GO.  
**LIVE PILOT: NO-GO** (R16 / OPS-02 unchanged).
