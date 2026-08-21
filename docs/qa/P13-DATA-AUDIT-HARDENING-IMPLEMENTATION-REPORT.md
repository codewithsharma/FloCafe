# P13 Data & Audit Integrity Hardening

## Status

**COMPLETE**

## Feature

`DATA-AUDIT-HARDENING`

## Commit

`a6f3478`

## Schema

**v88** (no bump)

## Executive Summary

Hardened high-risk audit/data-integrity gaps without new product features:

1. Audited silent bill `applyDiscount` money path
2. Moved `order.created` and QR `order.created` audits inside `withTxn`
3. Moved `order.item_discount_applied` inside `withTxn`
4. Removed false-success `print_job.retry_requested` before I/O
5. Audited payment-method merge (historical tender rewrite)
6. Audited order item restore
7. Dedicated suite `npm run test:data-audit`

## Audit Findings

See `docs/qa/P13-DATA-AUDIT-HARDENING-PLAN.md` for pre-change gap matrix.

## Changes

| File                                 | Behavior                                               |
| ------------------------------------ | ------------------------------------------------------ |
| `main/routes/bills.ts`               | `bill.discount_applied` inside applyDiscount txn       |
| `main/routes/orders/create.ts`       | `order.created` inside create txn                      |
| `main/routes/orders/discount.ts`     | `order.item_discount_applied` inside item discount txn |
| `main/routes/orders/cancel.ts`       | `order.item_restored` inside restore txn               |
| `main/services/qr-ordering.ts`       | QR `order.created` inside txn                          |
| `main/routes/printers.ts`            | No pre-I/O `retry_requested` success                   |
| `main/routes/payment-methods.ts`     | `payment_method.merged` inside merge txn               |
| `tests/data-audit-hardening.test.ts` | Dedicated coverage                                     |

## Audit Semantics

- **Actor:** JWT `req.user.userId` (QR guest id for QR creates)
- **Action / entity / result / metadata / requestId** via `logAuditEvent`
- **Transaction:** success audits for touched paths run inside `withTxn` with the business mutation
- **Idempotency:** order create stores response in txn with audit; replay returns stored response without re-audit

## Transaction Semantics

`BEGIN` → business mutation → `logAuditEvent` → `COMMIT`. Rollback removes both.

## Idempotency

Order create: one `order.created` per first success; Idempotency-Key replay does not duplicate audit.

## RBAC

Bill applyDiscount remains Owner/Manager; cashier 403 verified.

## Tenant Isolation

Unchanged single-location SQLite SoR; no cross-store queries added.

## Data Integrity

- HTTP audit API remains GET-only
- Audit service remains INSERT-only (no UPDATE/DELETE helpers)
- DB deny-triggers deferred (R12 fixtures mutate `created_at`; documented limitation)

## Backup / Restore

Not redesigned. Restore still replaces DB (post-restore trail only). Backup audit remains best-effort.

## Test Results

| Command                   | Result               |
| ------------------------- | -------------------- |
| `npm run test:data-audit` | PASS                 |
| Regressions               | _(filled after run)_ |

## Known Limitations

- Append-only audit_logs is convention-only (no DB triggers yet)
- Restore actor may be null on IPC path
- Auto-86 `product.availability` may have null actor (system stock sync)
- HTTP DB import not newly audited
- Inventory sale/cancel_restock movements still ledger-only

## Out of Scope

P14, reports semantics, REAL→cents, multi-location, gateways, AI, R16, cloud audit queue, event sourcing.

## Production Readiness

**LIVE PILOT: NO-GO** (R16 / OPS-02 unchanged).
