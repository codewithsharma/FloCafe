# P16 — Inventory OS Hardening Implementation Report

**Status:** COMPLETE  
**Feature:** Inventory OS Hardening  
**Feature ID:** `INV-OS-HARDENING`  
**Date:** 2026-08-21  
**Commit:** `3cb3806` (`3cb3806badb2adbe4305094fdbd0c997d990dcd9`)  
**Schema:** **v88** (no bump)  
**Live pilot:** NO-GO

---

## Executive Summary

P16 hardens the existing Inventory OS (R4/R5/R6/P5) without rebuilding it. Sale and recipe consumption now use atomic `stock_quantity >= ?` CAS floors; cancel/void/refund stock policy is encoded in tests as current product behavior; PUT `is_active` routes through availability flags; opening stock and count lifecycle emit durable audits. Typed ledger / reserved_qty / transfers / CSV export remain deferred.

---

## Implemented Changes

| Area                       | Change                                                          |
| -------------------------- | --------------------------------------------------------------- |
| Sale decrement             | CAS floor UPDATE + `changes === 0` → Insufficient stock         |
| Recipe consume             | Same CAS floor for negative deltas                              |
| PUT is_active              | `setManualAvailability` — no raw `is_active` write              |
| Opening stock              | `inventory.opening_stock` audit (JWT actor)                     |
| Product absolute set       | `inventory.stock_set` audit when changed                        |
| Count create/submit/cancel | Audits in `withTxn` with actor                                  |
| Tests                      | `tests/p16-inventory-os-hardening.test.ts` + `npm run test:p16` |
| Docs                       | Audit updated; this report; FEATURE-INVENTORY / .ai             |

---

## P0 Fixes

### Sale oversell race (GAP-001)

`decrementTrackedStock` and recipe consume UPDATEs require `stock_quantity >= qty` atomically. Stale in-memory checks cannot oversell.

### Cancel / void / refund policy (GAP-002) — encoded, not reinvented

| Event                       | Inventory                                                             |
| --------------------------- | --------------------------------------------------------------------- |
| Order create / add-items    | Consume (SKU sale + recipe)                                           |
| Payment                     | No inventory effect                                                   |
| Partial pending item cancel | **No** restock                                                        |
| Full order cancel           | Restores **all non-void** lines (including earlier cancelled pending) |
| Void preparing/ready        | **No** restock (write-off)                                            |
| Restaurant refund restock   | **403** vertical gate                                                 |
| Replay cancel at cancelled  | No double restock                                                     |

---

## P1 Fixes

- **GAP-003:** PUT `is_active` → availability service
- **GAP-004/005:** Count create/submit/cancel + opening/`stock_set` audits
- **GAP-006:** Documented/enforced reason taxonomy; no typed ledger migration
- **GAP-007:** CAS rejects float oversell; REAL retained on v88
- **GAP-008:** reserved_qty deferred; reserve-by-deduct at order create documented

---

## Optional P2 Changes

- CSV export / ledger-check UI: **deferred** (not blocking P0/P1)
- CI tier promotion of r4/r5/r6: deferred (p16 suite covers critical races)

---

## Database / Schema Impact

**v88 unchanged.** No migration.

---

## Security / Authorization

Reused `requireRole` O/M for inventory admin; JWT actors for audits; no client actor spoofing; P15 sanitizer unaffected (no new `pin_*` metadata keys).

---

## Audit Behavior

| Action                                                               | When                      |
| -------------------------------------------------------------------- | ------------------------- |
| `inventory.opening_stock`                                            | Product create opening    |
| `inventory.stock_set`                                                | PUT absolute stock change |
| `inventory.count_created` / `_submitted` / `_cancelled` / `_applied` | Count lifecycle           |
| Existing adjust/wastage/recipe/PO                                    | Unchanged                 |

Success audits share `withTxn` with mutations where applicable.

---

## Concurrency Guarantees

Two competing decrements for the last unit: exactly one succeeds; final stock 0; one sale movement.

---

## Cancel / Void / Refund Policy

See P0 table above. Matches `order-boundary` characterization + refund-restock vertical gate.

---

## Test Results

| Suite              | Result    |
| ------------------ | --------- |
| `npm run test:p16` | PASS (47) |
| Schema tip v88     | PASS      |

---

## Regression Results

| Suite                   | Result                           |
| ----------------------- | -------------------------------- |
| test:p15                | PASS                             |
| test:p14                | PASS                             |
| test:data-audit (P13)   | PASS                             |
| test:inv-auto-86        | PASS                             |
| test:inventory-boundary | PASS                             |
| test:inventory-ledger   | PASS                             |
| test:critical           | PASS                             |
| order-void-cancel-stock | PASS                             |
| npm run build           | PASS                             |
| npm run build:frontend  | PASS                             |
| Lint (touched files)    | 0 new errors (baseline warnings) |

---

## Known Limitations

- REAL quantities retained
- Partial cancel alone still does not restock until full order cancel catch-up
- Restaurant refund restock remains disabled
- No typed movement ledger / reserved_qty / transfer / export

---

## Deferred Items

GAP-006 typed ledger, GAP-008 reserved_qty, GAP-009/010 export/UI, GAP-011 CI tier promote, Planned matrix rows (transfer/expiry/consumption BI), P17

---

## Production Gate

**LIVE PILOT: NO-GO** — R16 / OPS-02 unchanged.

---

## Stop Condition

Stopped at P16 hardening complete. **P17 NOT STARTED.**
