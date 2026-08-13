# DR Drill Worksheet — Controlled Pilot

**Purpose:** Prove same-machine recovery under REC-01 without silent first-install.  
**When:** Before first live pilot day (mandatory). Optionally after major upgrades.  
**Companion:** `pilot-runbook.md` · `disaster-recovery.md`  
**Environment:** Training / spare machine preferred. Packaged build only.

Print or copy this sheet. Fill every blank. Mark Pass/Fail.

---

## 1. Drill metadata

| Field | Value |
|-------|-------|
| Café / site | |
| Terminal / host name | |
| Operator (name) | |
| Owner present (Y/N) | |
| Date | |
| Application version | |
| OS | |
| `network_mode` | |
| Database backup filename | |
| Backup full path | |
| Drill start (timestamp) | |
| Drill end (timestamp) | |
| RTO (minutes: start failure → usable POS) | |
| RPO (age of backup used / data-loss window) | |

**Pass criteria (pilot):** Recovery UI (not setup); financial baselines restored; FIN-01 checks pass; same-machine login works; controlled test sale OK; RTO recorded. Target RTO ≤ 30 minutes for pilot drills.

---

## 2. Seed known state

Create the following **before** backup. Record IDs/totals.

| Seed item | Done | Notes / IDs / amounts |
|-----------|:----:|------------------------|
| Catalog usable (products) | ☐ | |
| Open shift (if shifts enabled) with known float | ☐ | |
| Order A — **full payment** | ☐ | |
| Order B — **partial payment** (leave outstanding) | ☐ | Prefer FIN-01 fixture below |
| **Refund** on a paid/partial bill | ☐ | |
| Day close (if in scope for drill day) | ☐ | |
| Confirm audit events exist (payment/refund/day.closed as applicable) | ☐ | |

### FIN-01 fixture (required)

Use amounts matching continuity / FIN-01 tests (currency units as shown in UI; example uses ₹):

| Field | Expected |
|-------|----------|
| Bill total | **1000** |
| Gross successful tender (before final collect) | **600** |
| Completed refunds | **200** |
| Net paid (`paid_amount`) | **400** |
| Collectible outstanding (`total − gross`) | **400** |

Record bill id: ____________________

---

## 3. Backup

| Step | Done | Record |
|------|:----:|--------|
| Create local backup (Master PIN) | ☐ | |
| Filename | ☐ | |
| File exists; size non-trivial | ☐ | bytes: ________ |
| Optional: Drive copy confirmed | ☐ | N/A if deferred |

---

## 4. Failure simulation (same-machine missing DB)

| Step | Done | Observed |
|------|:----:|----------|
| Stop application cleanly | ☐ | |
| Move/rename `flo.db` (+ `-wal`/`-shm` if present) | ☐ | **Keep** `install-state.json` and `jwt-secret.enc` |
| Start application | ☐ | |
| Screen shows **DATABASE RECOVERY REQUIRED** / recovery UI | ☐ | |
| First-time **setup is NOT** offered as the path forward | ☐ | |
| Cannot take payments / money APIs unavailable | ☐ | |
| KDS / Server App / mDNS **not** operational in recovery | ☐ | |

**Fail immediately if** the app offers first-time setup and you could create a new owner.

---

## 5. Restore

| Step | Done | Observed |
|------|:----:|----------|
| Restore backup with **Master PIN** (recovery UI / Database Tools) | ☐ | |
| Restore reports success | ☐ | |
| Restart / return to normal UI as prompted | ☐ | |
| Install state **ACTIVE** (login / normal POS, not recovery) | ☐ | |

---

## 6. Financial verification

| Check | Expected | Actual | Pass |
|-------|----------|--------|:----:|
| Orders present | Seeded orders exist | | ☐ |
| Bills present | Seeded bills exist | | ☐ |
| Gross tender | Matches seed (600 on FIN-01 bill before final collect) | | ☐ |
| Refunds | 200 completed on fixture | | ☐ |
| Net paid | 400 | | ☐ |
| Outstanding | 400 | | ☐ |
| **Non-cash** payment of **401** (card/UPI/wallet) | **Rejected** (FIN-01 / non-cash over remaining) | | ☐ |
| **Cash** tender of **401** when remaining is **400** | **Accepted as change-on-cash** — applied **400**, change **1** (not a FIN-01 reject) | | ☐ Optional confirm |
| Payment of **400** (exact remaining; cash or non-cash) | **Accepted** | | ☐ |
| After accept: gross | **1000** | | ☐ |
| After accept: net | **800** | | ☐ |
| After accept: outstanding | **0** | | ☐ |

---

## 7. Operational verification

| Check | Pass |
|-------|:----:|
| Shift state matches seed (open/closed; expected cash if closed) | ☐ |
| Day-close summary present if seeded | ☐ |
| Payment / refund audit events present if seeded | ☐ |
| Printer smoke test (if available) | ☐ |
| KDS reconnects only on staff LAN (if used); OPS-01 still holds | ☐ |
| `network_mode` unchanged / correct | ☐ |
| Staff/owner **login** works | ☐ |

---

## 8. JWT verification

### Same-machine (this drill’s primary path)

| Check | Pass |
|-------|:----:|
| `jwt-secret.enc` still present under `userData` | ☐ |
| Authentication usable (login succeeds) | ☐ |
| No forced silent “new install” secret mint | ☐ |

### New-machine (optional second drill / tabletop)

Perform only if approved and on a spare host:

| Check | Pass |
|-------|:----:|
| Restore `.db` without copying `.enc` | ☐ |
| Status / behavior indicates JWT **recovery_required** | ☐ |
| Recover with **owner email/password + Master PIN** via `POST /api/auth/jwt-secret/recover` (or support-guided UI) | ☐ |
| Staff must sign in again after recover | ☐ |

---

## 9. Controlled test sale

| Step | Pass |
|------|:----:|
| New order → pay successfully | ☐ |
| Receipt/KDS/printer behavior acceptable for pilot | ☐ |

---

## 10. Results

| Item | Notes |
|------|-------|
| RTO | |
| RPO | |
| Failures / defects | |
| Operator confusion | |
| Corrective actions | |
| Overall | ☐ **PASS** · ☐ **FAIL** |

**Sign-off**

| Role | Name | Signature / date |
|------|------|------------------|
| Operator | | |
| Owner | | |

Attach this sheet to the pilot go-live packet. Do not open live service on FAIL without CEO/CTO waiver.
