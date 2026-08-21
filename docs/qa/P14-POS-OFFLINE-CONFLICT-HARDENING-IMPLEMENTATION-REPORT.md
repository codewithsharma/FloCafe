# P14 POS / Offline Conflict & Recovery Hardening

## Status

COMPLETE

## Feature ID

POS-OFFLINE-CONFLICT-HARDENING

## Commit

`06d451d`

## Schema

v88 (no bump)

## Executive Summary

- Audited order-status, stock-adjust, and FE offline/reconnect paths before coding.
- Closed order-level stale-write gap with CAS (`expected_status`) + monotonicity fallback → `409 ORDER_STATUS_CONFLICT`.
- Hardened payment settle so `completed` cannot overwrite `cancelled`.
- Re-verified R4 stock Idempotency-Key; added FE stable key across retry/double-click.
- POS sticky `localStorage` attempts clear on conflict/auth/permanent errors (409 not blindly retried).
- KDS pending clears on permanent non-409 4xx (backoff unchanged).
- P13 transactional audit semantics preserved; stale paths create no false success audits.
- Suite `npm run test:p14` green; P4–P13 regressions + critical/phase2 + `tsc` green.
- LIVE PILOT remains **NO-GO** (R16 / OPS-02).

## Audit Findings

| Area                  | Finding                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| Order `PATCH /status` | Pre-P14: `WHERE id=?` only → stale clients could overwrite newer non-terminal status |
| Kitchen item status   | Already CAS via `expected_status` (R3) — left alone                                  |
| Stock adjust API      | R4 closed server double-apply; FE generated new UUID per call                        |
| POS offline           | No sync queue; sticky prepaid/postpaid attempts on all errors                        |
| KDS pending           | Already drops on 409; permanent other 4xx could linger                               |

## Order Status CAS

- Optional `expected_status` on `orderStatusBodySchema`.
- Inside `withTxn`: re-read; idempotent early return at target; CAS `UPDATE … WHERE id=? AND status=?`.
- Without `expected_status`, reject reverse lifecycle transitions (monotonicity).
- Conflict → `409` + `ORDER_STATUS_CONFLICT` (no state overwrite, no success audit).
- Terminals → existing `ILLEGAL_STATUS_TRANSITION`.
- Payment complete: `WHERE status NOT IN ('cancelled','completed')`.

## Stock Adjustment Idempotency

- Server unchanged (v78 `stock_adjust_idempotency`).
- Products + low-stock UI hold one Idempotency-Key per dialog attempt (`useRef`); reuse on retry; clear on success/close.
- P14 tests: replay, payload conflict, concurrent same/different keys, rollback.

## Offline / Reconnect Semantics

- `frontend/src/lib/mutation-errors.ts` classifies retryable vs conflict/auth/permanent.
- POS prepaid/postpaid catch clears sticky attempts when not retryable.
- KDS: clear pending on permanent 4xx; leave P4 reconnect backoff alone.
- No new sync engine; SQLite remains SoR.

## Restart Recovery

- Server commit authoritative.
- POS attempts survive Electron relaunch in `localStorage` but permanent/409 clears them so they are not blindly re-fired.
- KDS pending is session-scoped (sessionStorage).
- Stock key is in-memory per dialog (retry within session).

## Audit Integration

- Cancel success audit remains inside txn (P13/H1).
- Stale/conflict paths do not insert success audits.
- Stock idempotent replay does not re-audit (R4).

## RBAC

- Status roles unchanged (owner/manager/cashier/chef/waiter + waiter ownership).
- Stock adjust owner/manager only (re-asserted).

## Tenant Isolation

- Single-store; mutations scoped by order/product id; no cross-store invent.

## Test Results

| Suite                       | Result                             |
| --------------------------- | ---------------------------------- |
| `npm run test:p14`          | PASS                               |
| `npm run test:data-audit`   | PASS                               |
| `npm run test:critical`     | PASS                               |
| `npm run test:phase2`       | PASS                               |
| `npm run test:kds-h-outbox` | PASS                               |
| `npm run test:inv-auto-86`  | PASS                               |
| `npm run test:rpt-pay`      | PASS                               |
| `npm run test:rpt-disc`     | PASS                               |
| `npm run test:kds-alerts`   | PASS                               |
| `npm run test:rpt-staff`    | PASS                               |
| `npm run test:print-health` | PASS                               |
| `npm run test:rpt-product`  | PASS                               |
| `npm run test:rpt-category` | PASS                               |
| `npm run build`             | PASS                               |
| `npm run build:frontend`    | _(see final)_                      |
| Lint                        | baseline vs P14 — see Lint section |

## Regression Results

P4–P13 feature suites green. Critical + Phase 2 green. TypeScript build green.

## Lint

Separate baseline frontend React Compiler debt from any new P14 errors (requirement: 0 new P14 lint errors).

## Known Limitations

- Clients that omit `expected_status` and only move **forward** can still last-writer-win among active statuses (monotonicity blocks reverse only). Prefer sending `expected_status`.
- No general offline mutation sync queue.
- Not full device-failure or disaster recovery.
- Drive/KDS outbox/print recovery not reopened.

## Out of Scope

- P15+
- Schema v89
- Money/report semantic changes
- P4 KDS outbox rebuild
- Multi-location / payroll / AI / gateways
- DB audit deny-triggers (P13 deferred)

## Production Readiness

**LIVE PILOT: NO-GO**

R16 / OPS-02 remain blocking (signed RC + site gates).
