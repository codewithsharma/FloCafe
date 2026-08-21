# OPS-02 — Manual Test Matrix

**Phase:** R16 / OPS-02  
**Date:** 2026-08-21  
**Schema tip:** **v88**  
**Artifact under test:** _fill — commit SHA + signed/unsigned identity_
**Rule:** Do not mark PASS without evidence. Statuses: **PASS · FAIL · BLOCKED · NOT TESTED**.

Prior GUI evidence (2026-08-15) may be cited as **historical** but must be re-run on the RC cut for Live GO.

---

## How to record a row

| Field    | Content                                                         |
| -------- | --------------------------------------------------------------- |
| Expected | Contract from release gates / offline contract                  |
| Actual   | What happened on this run                                       |
| Evidence | Log path, screenshot, DB query, Playwright trace, checklist row |
| Status   | PASS / FAIL / BLOCKED / NOT TESTED                              |

---

## POS

| ID     | Scenario                 | Expected                                          | Actual | Evidence | Status     |
| ------ | ------------------------ | ------------------------------------------------- | ------ | -------- | ---------- |
| POS-01 | Login (Owner)            | Authenticated session                             |        |          | NOT TESTED |
| POS-02 | Open table / order       | Order created with Idempotency-Key                |        |          | NOT TESTED |
| POS-03 | Add item                 | Item persisted                                    |        |          | NOT TESTED |
| POS-04 | Modifier / addon         | Line reflects addon                               |        |          | NOT TESTED |
| POS-05 | Discount                 | Discount applied; audited                         |        |          | NOT TESTED |
| POS-06 | Tax                      | Tax matches pack                                  |        |          | NOT TESTED |
| POS-07 | Payment                  | Tender recorded; no duplicate on retry            |        |          | NOT TESTED |
| POS-08 | Refund                   | Money path via refunds; stock policy per vertical |        |          | NOT TESTED |
| POS-09 | Receipt print            | Print success or failed job queued (R13)          |        |          | NOT TESTED |
| POS-10 | Restart after paid order | Order/bill remain; re-tender rejected             |        |          | NOT TESTED |

---

## KDS

| ID     | Scenario                | Expected                             | Actual | Evidence | Status     |
| ------ | ----------------------- | ------------------------------------ | ------ | -------- | ---------- |
| KDS-01 | Ticket creation visible | New order appears (WS or REST)       |        |          | NOT TESTED |
| KDS-02 | Ticket update (bump)    | Status CAS; board updates            |        |          | NOT TESTED |
| KDS-03 | Completion / served     | Item leaves active board per rules   |        |          | NOT TESTED |
| KDS-04 | Restart recovery        | Board from SQLite; outbox drain      |        |          | NOT TESTED |
| KDS-05 | Reconnection            | Stale cleared; full refresh          |        |          | NOT TESTED |
| KDS-06 | Companion down          | kds-info 503; no false LAN advertise |        |          | NOT TESTED |

---

## Shifts

| ID    | Scenario                 | Expected                            | Actual | Evidence | Status     |
| ----- | ------------------------ | ----------------------------------- | ------ | -------- | ---------- |
| SH-01 | Open shift               | Open row for terminal               |        |          | NOT TESTED |
| SH-02 | Cash transaction         | Cash gate enforced when required    |        |          | NOT TESTED |
| SH-03 | Close/reopen application | Open shift survives                 |        |          | NOT TESTED |
| SH-04 | Close shift              | Closed with reconciliation fields   |        |          | NOT TESTED |
| SH-05 | Day-close / Z            | Confirm + frozen Z; no double close |        |          | NOT TESTED |

---

## Backup / Restore

| ID    | Scenario              | Expected                              | Actual | Evidence | Status     |
| ----- | --------------------- | ------------------------------------- | ------ | -------- | ---------- |
| BR-01 | Backup (Master PIN)   | Integrity-checked artifact            |        |          | NOT TESTED |
| BR-02 | Restore               | Data verified; latch clear if healthy |        |          | NOT TESTED |
| BR-03 | Restart after restore | App healthy; money APIs open          |        |          | NOT TESTED |
| BR-04 | Corrupt DB path       | Recovery UI; money 503                |        |          | NOT TESTED |

---

## Roles (critical workflows)

| Role    | Critical path                      | Expected | Actual | Evidence | Status     |
| ------- | ---------------------------------- | -------- | ------ | -------- | ---------- |
| Owner   | Settings, backup, reports, staff   | Allowed  |        |          | NOT TESTED |
| Manager | POS, discounts, day-close, reports | Allowed  |        |          | NOT TESTED |
| Cashier | POS pay; no Settings deep admin    | Gated    |        |          | NOT TESTED |
| Waiter  | Tables/orders; limited Settings    | Gated    |        |          | NOT TESTED |
| Chef    | KDS bump; cancel PIN rules         | Gated    |        |          | NOT TESTED |

Historical RBAC GUI: `docs/qa/evidence/gui/full/FINAL-RBAC-AUDIT.md` — **re-validate on RC**.

---

## Offline / restart (Gate G)

| ID     | Scenario                        | Expected                                   | Actual | Evidence | Status     |
| ------ | ------------------------------- | ------------------------------------------ | ------ | -------- | ---------- |
| OFF-01 | Close during active order       | Committed order persists; cart may be lost |        |          | NOT TESTED |
| OFF-02 | Close after add item            | Item persists if HTTP committed            |        |          | NOT TESTED |
| OFF-03 | Close during checkout           | Sticky prepaid may resume; no double pay   |        |          | NOT TESTED |
| OFF-04 | Backend restart                 | Health ok; DB intact                       |        |          | NOT TESTED |
| OFF-05 | KDS disconnect                  | Stale UX + REST                            |        |          | NOT TESTED |
| OFF-06 | WS reconnect                    | Board refresh                              |        |          | NOT TESTED |
| OFF-07 | Restart with pending KDS outbox | Outbox reclaim/drain                       |        |          | NOT TESTED |
| OFF-08 | Restart mid-shift               | Shift remains open                         |        |          | NOT TESTED |

---

## Site drill cross-reference

Execute full café checklist: [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md).

Until site rows are filled on a **signed** RC: Live Go-Live remains **NO-GO**.
