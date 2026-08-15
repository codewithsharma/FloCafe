# OPS-02 — Real-Site Drill Checklist

**Purpose:** Operational drills that **cannot** be claimed PASS from CI, Chromium-against-e2e-as-node, or engineering suites alone.  
**Rule:** Leave every drill **unchecked / blank** until executed on a real café host with physical/LAN conditions.  
**Companion docs:** [`docs/13-operations/ops-02-site-readiness-checklist.md`](../13-operations/ops-02-site-readiness-checklist.md), [`docs/05-production/ops-02-live-pilot-rc-site-readiness.md`](../05-production/ops-02-live-pilot-rc-site-readiness.md)

**Status values:** `PASS` · `FAIL` · `BLOCKED` · `N/A`  
**Do not mark PASS without evidence** (photo, receipt, log path, signed worksheet).

| Field                      | Value |
| -------------------------- | ----- |
| Site                       |       |
| Date                       |       |
| RC artifact version / path |       |
| Operator                   |       |
| Witness                    |       |

---

## 1. Printer test

|                   |                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Preconditions** | Signed RC installed; thermal printer powered; paper loaded; printer selected in Settings   |
| **Steps**         | 1) Open Settings → Printers 2) Run Test Print 3) Confirm paper ejects with readable header |
| **Expected**      | Test page prints; no app crash; order flow still usable                                    |
| **Evidence**      | Photo of printed test page + Settings screenshot                                           |
| **PASS/FAIL**     |                                                                                            |
| **Owner**         | Café ops / installer                                                                       |

---

## 2. Receipt reprint

|                   |                                                                         |
| ----------------- | ----------------------------------------------------------------------- |
| **Preconditions** | At least one paid order today; printer working (drill 1)                |
| **Steps**         | 1) Open Orders 2) Select paid order 3) Reprint receipt                  |
| **Expected**      | Duplicate receipt prints; totals match original; order status unchanged |
| **Evidence**      | Original + reprint photos; order id                                     |
| **PASS/FAIL**     |                                                                         |
| **Owner**         | Cashier lead                                                            |

---

## 3. KDS LAN test

|                   |                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **Preconditions** | Second device on staff LAN; `network_mode` allows KDS LAN; ports 3001–3002 reachable from kitchen host only |
| **Steps**         | 1) Open KDS URL from kitchen device 2) Confirm auth/kiosk path per site policy 3) Refresh / reconnect       |
| **Expected**      | KDS UI loads; connection indicator healthy; guest Wi‑Fi cannot reach ports                                  |
| **Evidence**      | Screenshot of KDS on kitchen device + network note                                                          |
| **PASS/FAIL**     |                                                                                                             |
| **Owner**         | Installer / IT                                                                                              |

---

## 4. POS → KDS order propagation

|                   |                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| **Preconditions** | Drill 3 PASS; kitchen station staffed                                                              |
| **Steps**         | 1) POS place dine-in/takeaway ticket 2) Observe KDS ticket appear 3) Move Preparing → Ready on KDS |
| **Expected**      | Ticket appears within site SLA; status syncs; no duplicate tickets for single send                 |
| **Evidence**      | POS order id + KDS screenshot timestamps                                                           |
| **PASS/FAIL**     |                                                                                                    |
| **Owner**         | Chef + cashier                                                                                     |

---

## 5. Internet loss

|                   |                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **Preconditions** | Café can cut WAN without cutting staff LAN (router test mode)                            |
| **Steps**         | 1) Confirm online 2) Disconnect WAN uplink 3) Place cash sale 4) Open reports/local sale |
| **Expected**      | Local POS continues (SQLite); no dependency on cloud; sale completes                     |
| **Evidence**      | Order id + note “WAN down”; offline badge if shown                                       |
| **PASS/FAIL**     |                                                                                          |
| **Owner**         | Installer                                                                                |

---

## 6. LAN-only operation

|                   |                                                           |
| ----------------- | --------------------------------------------------------- |
| **Preconditions** | Staff LAN up; WAN optional off                            |
| **Steps**         | 1) POS + KDS on LAN 2) Place order 3) Print if configured |
| **Expected**      | Full ticket path works without internet                   |
| **Evidence**      | Same as drills 3–4 under WAN-down                         |
| **PASS/FAIL**     |                                                           |
| **Owner**         | Installer                                                 |

---

## 7. Restore test

|                   |                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Preconditions** | Master PIN known/escrowed; recent encrypted backup; **training** copy of DB or after-hours window          |
| **Steps**         | 1) Create fresh backup 2) Restore from known-good backup with Master PIN 3) Confirm app returns to service |
| **Expected**      | Restore succeeds; schema compatible; login works; recent training data as expected                         |
| **Evidence**      | Backup filename, restore success dialog, post-restore order count note                                     |
| **PASS/FAIL**     |                                                                                                            |
| **Owner**         | Owner + installer                                                                                          |
| **Note**          | BLOCKED on e2e-as-node / CI — requires real desktop `safeStorage`                                          |

---

## 8. Backup verification

|                   |                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **Preconditions** | Master PIN set; writable backup destination                                                |
| **Steps**         | 1) Trigger backup 2) Verify file exists + size 3) Optional: verify metadata/schema version |
| **Expected**      | Backup created; integrity metadata present; destination documented                         |
| **Evidence**      | Backup path + file listing                                                                 |
| **PASS/FAIL**     |                                                                                            |
| **Owner**         | Owner                                                                                      |

---

## 9. Master PIN recovery

|                   |                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Preconditions** | Escrow sealed; second trusted person present                                                                              |
| **Steps**         | 1) Simulate forgotten Master PIN process per policy 2) Use escrow to unlock backup/restore gate 3) Rotate PIN after drill |
| **Expected**      | Escrow works; PIN rotated; escrow updated offline (not in chat/git)                                                       |
| **Evidence**      | Signed escrow acknowledgment (no PIN written in evidence)                                                                 |
| **PASS/FAIL**     |                                                                                                                           |
| **Owner**         | Owner / executive                                                                                                         |

---

## 10. Force-close / day-close

|                   |                                                                                |
| ----------------- | ------------------------------------------------------------------------------ |
| **Preconditions** | `shifts_enabled` per site policy; open shift if required; day’s training sales |
| **Steps**         | 1) Run day-close / Z 2) Attempt duplicate close 3) Confirm cash worksheet      |
| **Expected**      | First close succeeds; duplicate rejected; Z totals match expected shift policy |
| **Evidence**      | Z print or Reports screenshot + API/UI confirmation                            |
| **PASS/FAIL**     |                                                                                |
| **Owner**         | Manager                                                                        |

---

## 11. Cash reconciliation

|                   |                                                                        |
| ----------------- | ---------------------------------------------------------------------- |
| **Preconditions** | Drill 10; counted drawer                                               |
| **Steps**         | 1) Count cash 2) Compare to Z / Reports cash tender 3) Record variance |
| **Expected**      | Variance within site tolerance or explained                            |
| **Evidence**      | Cash count worksheet                                                   |
| **PASS/FAIL**     |                                                                        |
| **Owner**         | Manager                                                                |

---

## 12. Power-loss recovery

|                   |                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Preconditions** | UPS optional; after-hours                                                             |
| **Steps**         | 1) Place mid-order or mid-pay 2) Hard power-off host 3) Restore power 4) Relaunch app |
| **Expected**      | DB opens; no silent corruption; recovery UI if latch set; last committed sale intact  |
| **Evidence**      | Boot log / recovery reason if any + order id check                                    |
| **PASS/FAIL**     |                                                                                       |
| **Owner**         | Installer                                                                             |

---

## 13. Restart recovery

|                   |                                                                                  |
| ----------------- | -------------------------------------------------------------------------------- |
| **Preconditions** | App healthy                                                                      |
| **Steps**         | 1) Quit app cleanly 2) Relaunch 3) Login 4) Confirm open tickets / KDS reconnect |
| **Expected**      | Clean relaunch; session policy as configured; no data loss                       |
| **Evidence**      | Screenshot post-relaunch Orders/KDS                                              |
| **PASS/FAIL**     |                                                                                  |
| **Owner**         | Cashier                                                                          |

---

## 14. Duplicate order protection

|                   |                                                                                   |
| ----------------- | --------------------------------------------------------------------------------- |
| **Preconditions** | Unstable network or intentional double-tap simulation                             |
| **Steps**         | 1) Place order 2) Immediately double-submit payment/send 3) Inspect Orders + KDS  |
| **Expected**      | No duplicate paid tickets for one cart intent (or documented idempotent behavior) |
| **Evidence**      | Order ids before/after                                                            |
| **PASS/FAIL**     |                                                                                   |
| **Owner**         | Cashier + engineer on site                                                        |

---

## 15. Staff role verification

|                   |                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Preconditions** | Owner, Manager, Cashier, Waiter, Chef accounts live                                   |
| **Steps**         | 1) Login each role 2) Confirm landing + denied deep-links 3) Confirm POS/KDS per role |
| **Expected**      | Matches RBAC matrix (Waiter/Chef no POS; Chef Kitchen works)                          |
| **Evidence**      | Checklist initials per role                                                           |
| **PASS/FAIL**     |                                                                                       |
| **Owner**         | Manager                                                                               |

---

## Sign-off

| Role              | Name | Date | Signature |
| ----------------- | ---- | ---- | --------- |
| Site operator     |      |      |           |
| Owner             |      |      |           |
| Executive / pilot |      |      |           |

**Engineering suites alone do not complete this checklist.**
