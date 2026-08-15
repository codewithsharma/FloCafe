<!-- Last updated: 2026-08-15, schema v75 -->

# OPS-02 — Site readiness checklist (live café)

**Purpose:** Convert engineering readiness into **on-site** PASS evidence before first live transaction.  
**Engineering tree:** `24966ba7272aa4e0e6650796ec469a3cd60ed423`  
**Docs:** OPS-01 `d3322a4` + [`../05-production/ops-02-live-pilot-rc-site-readiness.md`](../05-production/ops-02-live-pilot-rc-site-readiness.md)  
**Rule:** Do **not** mark PASS without artifact path, worksheet, screenshot, or signed acknowledgment. Suites alone ≠ site PASS.

Status: `PASS` · `FAIL` · `PENDING` · `N/A`

---

## A. Release candidate

- [ ] Signed/notarized PILOT/PRODUCTION artifact built from `24966ba` (or approved clean descendant)
- [ ] Artifact path / URL recorded on [`pilot-signoff.md`](./pilot-signoff.md)
- [ ] Codesign / notarization evidence attached (not adhoc)
- [ ] App opens; schema **v75**; vertical Restaurant
- [ ] **Not** using `npm run dev` or adhoc `Nexora.app` / TRAINING pack for live service

---

## B. POS / hardware

- [ ] Café POS host ready (power, storage, display)
- [ ] Local staff network available
- [ ] Thermal printer connected + Test Print — or **N/A**
- [ ] Paper width confirmed (58 or 80) — or **N/A**
- [ ] KDS display reaches companion `:3002` — or **N/A**
- [ ] Cash drawer (if used) kick tested — or **N/A**

---

## C. Configuration

- [ ] `shifts_enabled` = true
- [ ] `require_open_shift_for_cash` = true
- [ ] `network_mode` set (`localhost` or staff-only `kds_lan`/`lan`)
- [ ] Guest Wi‑Fi cannot reach ports 3001–3003 (OPS-01)
- [ ] Printer / KDS / KOT toggles match café workflow

---

## D. Staff / security

- [ ] Owner, Manager, Cashier (+ Waiter/Chef if used) created
- [ ] Role logins tested
- [ ] Manager PIN path briefed (refund / in-progress cancel)
- [ ] Master PIN set
- [ ] Master PIN **escrowed offline** (not in chat/Drive/git)
- [ ] Deactivate unused accounts

---

## E. Operating drill (on site)

- [ ] Open shift + float
- [ ] Create / modify order
- [ ] KDS prepare/ready — or paper path **N/A**
- [ ] Owner/manager discount once
- [ ] Payment + receipt
- [ ] Complete after settle
- [ ] Second sale
- [ ] Shift close + variance
- [ ] Z-report / day close
- [ ] Local Master-PIN backup

---

## F. Failure drills (on site)

- [ ] Internet off → billing continues
- [ ] KDS companion stop → POS continues + stale/fallback — or **N/A**
- [ ] KDS recover → board usable — or **N/A**
- [ ] Printer disconnect → pay succeeds; reprint works — or **N/A**
- [ ] App restart → open orders/shift survive
- [ ] Device restart → operational recovery
- [ ] Spare/test restore → ACTIVE + spot-check money/staff

---

## G. Operator acceptance (no developer)

| Task             | PASS / FAIL / CONFUSING / REQUIRES TRAINING |
| ---------------- | ------------------------------------------- |
| Opening          |                                             |
| Sale             |                                             |
| Discount         |                                             |
| KDS / paper      |                                             |
| Payment          |                                             |
| Reprint          |                                             |
| Shift close      |                                             |
| Backup           |                                             |
| Failure recovery |                                             |

---

## H. Sign-off

- [ ] All applicable rows above PASS or N/A
- [ ] [`pilot-signoff.md`](./pilot-signoff.md) signatures complete
- [ ] OPS-02 audit updated if re-run after site work

**Until A (signed RC) and D (escrow) and E/F/G are done: live service remains NO-GO.**
