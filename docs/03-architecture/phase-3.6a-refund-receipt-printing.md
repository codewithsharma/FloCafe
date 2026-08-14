# Phase 3.6A — Refund Receipt Printing

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **NO SCHEMA CHANGE**  
**Related:** ADR-009, M6 refund architecture, `main/services/refund.ts`, `main/services/receipt.ts`, `main/printers/thermal.ts`

---

## Objective

As a manager, print a refund receipt so the customer has proof of refund without a manual workaround.

Financial refund accounting is unchanged. Printing is a separate, best-effort operation.

---

## Current refund flow

```
UI RefundDialog → POST /api/bills/:id/refund (Idempotency-Key)
  → createBillRefund (withTxn) → { refund, bill }
  → toast success
  → best-effort POST /printers/print-refund (hardware)
  → on success POST /bills/:id/print { print_type: refund }  // audit only
```

Sale print pattern (unchanged): hardware / client printer store for bills; print failure never rolls back payment.

Refund print uses the **server default-printer** path (`printRefundReceipt` → `dispatchPrint`), mirroring `POST /printers/print-bill`. Browser/WebUSB client-mode refund slips are an explicit non-goal for 3.6A.

---

## Implementation

| Layer           | Change                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Thermal         | `formatRefundReceipt` / `printRefundReceipt` — `** REFUND **` slip              |
| API             | `POST /api/printers/print-refund` `{ refundId }` — hardware dispatch only       |
| Audit           | `print_type: 'refund'` via `receipt.ts` — **does not** set `bills.printed_at`   |
| Bills print API | Allow `print_type: 'refund'`                                                    |
| UI              | After refund success: best-effort print; OrderCard “Print refund receipt” retry |
| Client          | `frontend/src/lib/refund-receipt-print.ts`                                      |

Refund service / txn / FIN-01 / tax / inventory: **untouched** (money path has no print calls).

---

## Print flow

```
Successful refund (money committed)
  ↓
POST /printers/print-refund { refundId }
  ↓ success
POST /bills/:billId/print { print_type: 'refund' }  // audit log only
```

Manual retry: OrderCard → latest refund for bill → same print flow.

---

## Failure semantics

| Case                  | Result                                                            |
| --------------------- | ----------------------------------------------------------------- |
| Refund OK, print OK   | Toast refund success + print success                              |
| Refund OK, print fail | Toast refund success + print failure (refund **not** rolled back) |
| Manual reprint fail   | Toast reprint failure (does not claim refund just completed)      |
| Refund fail           | Toast refund failure; no print                                    |

No distributed transaction. No money reverse on print failure. Print API returns 502 on hardware failure without mutating refund rows.

---

## Tests

- Focused: `npm run test:refund-receipt-print` (wired into `test:security` / `npm test`)
- Existing: `integration-refunds`, `flo-refund-ui`, `bills-print-api`, `receipt-printing`
- Restaurant / Retail isolation remain green

---

## Vertical safety

`refund` is a shared commerce module (Restaurant + Retail). Print path does not import tables/KDS or change vertical composition. No Retail-specific behavior changes.

---

## Explicit non-goals

Schema, migration, REAL→cents, tax cleanup, service/package extraction, inventory restock, payment processor, redesign refund dialog, browser/WebUSB refund print parity, Retail-only changes, KDS/tables/vertical composition changes.

---

## Rollback

Revert the Phase 3.6A commit. Refund money path unchanged; print endpoints and UI affordances disappear.
