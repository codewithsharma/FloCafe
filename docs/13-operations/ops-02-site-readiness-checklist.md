<!-- Last updated: 2026-08-15, schema v82 -->

# OPS-02 — Site readiness checklist (live café)

**Purpose:** Convert engineering readiness into **on-site** PASS evidence before first live transaction.
**Engineering HEAD (Post-R8):** `94702f8`
**Historical H1–H4 baseline:** `24966ba7272aa4e0e6650796ec469a3cd60ed423`
**Docs:** OPS-01 + [`../05-production/ops-02-live-pilot-rc-site-readiness.md`](../05-production/ops-02-live-pilot-rc-site-readiness.md)
**Rule:** Do **not** mark PASS without artifact path, worksheet, screenshot, or signed acknowledgment. Suites alone ≠ site PASS.

Status: `PASS` · `FAIL` · `PENDING` · `N/A`

**Site / human rows below:** **PENDING HUMAN/SITE EXECUTION** until filled with evidence. Engineering suites alone ≠ site PASS.

---

## A. Release candidate

- [ ] Signed/notarized PILOT/PRODUCTION artifact built from `94702f8` (or approved clean descendant)
- [ ] Artifact path / URL recorded on [`pilot-signoff.md`](./pilot-signoff.md)
- [ ] Codesign / notarization evidence attached (not adhoc)
- [ ] App opens; schema **v82**; vertical Restaurant
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

## E. Operating drill (on site) — PENDING HUMAN/SITE EXECUTION

- [ ] Open shift + float
- [ ] Create / modify order
- [ ] KDS prepare/ready — or paper path **N/A**
- [ ] Owner/manager discount once
- [ ] Payment + receipt
- [ ] Complete after settle
- [ ] Second sale
- [ ] Shift close + variance
- [ ] **Force-close** orphan/open shift (manager/owner) + cash/day-close recovery — see runbook §11a
- [ ] Z-report / day close
- [ ] Local Master-PIN backup

---

## F. Failure drills (on site) — PENDING HUMAN/SITE EXECUTION

### Printer drill

- [ ] Printer discovery / add in Settings
- [ ] Successful Test Print
- [ ] Disconnect / fail → pay still succeeds
- [ ] Retry / reprint recovery — or **N/A**

### KDS / LAN drill

- [ ] Staff LAN reaches companion `:3002`
- [ ] KDS connected; ticket appears
- [ ] Disconnect companion → POS continues
- [ ] Reconnect → board usable; no silent lost statuses — or **N/A**
- [ ] Guest Wi‑Fi cannot reach :3001–3003 (OPS-01)

### Restore drill

- [ ] Local Master-PIN backup created
- [ ] Spare/test restore → ACTIVE
- [ ] App restart after restore
- [ ] Spot-check money / staff / open orders integrity

### Other

- [ ] Internet off → billing continues
- [ ] App restart → open orders/shift survive
- [ ] Device restart → operational recovery

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
