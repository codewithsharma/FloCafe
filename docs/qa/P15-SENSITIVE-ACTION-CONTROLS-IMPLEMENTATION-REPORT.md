# P15 Sensitive-Action Controls Hardening

## Status

COMPLETE

## Feature ID

SEC-SENSITIVE-ACTIONS

## Commit

_(filled after commit)_

## Schema

v88 (no bump)

## Executive Summary

P15 deepens existing Security / Authorization with concrete sensitive-action controls—no new RBAC framework, no schema bump, no money/report redesign. Gaps closed: bill discount after successful tender (H1 parity), order-cancel PIN approver + failed-PIN audits, item-void failed-PIN audit, `pin_approved_by` sanitizer allowlist, Drive backup-now audit, LAN `network_mode` owner+Master PIN + audit, Master PIN reset audit, DB export/import audit + Master PIN on schema-mismatch wipe. LIVE PILOT remains NO-GO.

## Audit Performed Before Implementation

See `docs/qa/P15-SENSITIVE-ACTION-CONTROLS-PLAN.md`. Money paths post-P13 were largely closed; remaining gaps were accountability and LAN/data-protection controls.

## Exact Gaps Discovered

1. Bill `applyDiscount` only blocked fully `paid`, not partial tender
2. Order cancel PIN success lacked durable `pin_approved_by` (and sanitizer stripped it)
3. Failed manager PIN on cancel/void unaudited
4. Drive `backup-now` unaudited despite Master PIN
5. `network_mode` → LAN by manager without PIN/audit
6. Master PIN reset unaudited
7. JSON export/import unaudited; import wipe on schema mismatch without Master PIN

## Exact Gaps Fixed

All seven above.

## Existing Architecture Reused

`requireAuth` / `requireRole` / `requireMasterPin` / `authorizeMasterPin` / `logAuditEvent` / `withTxn` / `orderHasSuccessfulTender` / JWT actor identity.

## Authorization Matrix

| Action                           | Owner         | Manager       | Cashier       | Waiter | Chef  |
| -------------------------------- | ------------- | ------------- | ------------- | ------ | ----- |
| Bill applyDiscount               | Y (no tender) | Y (no tender) | N             | N      | N     |
| Bill discount after tender       | 409           | 409           | 403           | 403    | 403   |
| Order cancel + PIN (in progress) | Y             | Y             | Y+PIN         | Y+PIN* | Y+PIN |
| Failed cancel PIN                | failure audit | —             | failure audit | —      | —     |
| Item void failed PIN             | —             | —             | failure audit | —      | —     |
| network_mode → lan/kds_lan       | Y+Master PIN  | 403           | 403           | 403    | 403   |
| network_mode → localhost         | Y             | Y             | 403           | 403    | 403   |
| Master PIN reset                 | Y             | 403           | 403           | 403    | 403   |
| DB export                        | Y             | 403           | 403           | 403    | 403   |
| Drive backup-now                 | Y+Master PIN  | 403           | 403           | 403    | 403   |

\*Waiter ownership rules still apply for order cancel.

## Audit / Transaction / Idempotency / Conflict

- Success cancel/discount audits remain in-txn where applicable
- Failure PIN audits are non-mutating
- Drive/export/network/master-pin audits after successful op
- `pin_approved_by` allowlisted in audit sanitizer
- P14 `ORDER_STATUS_CONFLICT` preserved
- No new idempotency framework

## Tenant Isolation

Single-store; no cross-store invent. Actor from JWT/DB role only.

## Test / Build / Lint

| Suite                      | Result                                             |
| -------------------------- | -------------------------------------------------- |
| test:p15                   | PASS                                               |
| test:data-audit / test:p14 | PASS (regression run)                              |
| critical / phase2 / P4–P12 | PASS (regression run)                              |
| build / build:frontend     | _(final)_                                          |
| Lint                       | 0 new P15 errors; baseline frontend debt unchanged |

## Files Changed

`main/routes/bills.ts`, `orders/status.ts`, `orders/cancel.ts`, `settings.ts`, `database.ts`, `database-tools.ts`, `main/services/audit-log.ts`, tests + package.json + docs + `.ai/*` + matrix/inventory

## Known Limitations

- Served-item soft-cancel vs void+PIN not changed (UX)
- Cashier/waiter void UI not deepened
- IPC backup/restore null-actor unchanged
- Not penetration-tested; not live-pilot ready
- Authz-denial flood still deferred

## Out of Scope

P16, Frozen features, new auth/RBAC, schema bump, report/money redesign, DR product

## Production Readiness

**LIVE PILOT: NO-GO** — R16 / OPS-02 unchanged.
