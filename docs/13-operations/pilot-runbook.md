# Operavia — Café Pilot Runbook

**Audience:** Café owner / manager for a **controlled pilot**.
**Product:** Operavia Restaurant (café). Schema **v75**.
**Engineering baseline:** `0200cae` — H1 paid-cancel 409, FIN-02 reporting, H3 chef cancel PIN.
**Authorization:** Engineering hardening COMPLETE. Live service requires human/ops gates on [`pilot-signoff.md`](./pilot-signoff.md).

**Related:** [`backup-restore.md`](./backup-restore.md) · [`disaster-recovery.md`](./disaster-recovery.md) · [`dr-drill-worksheet.md`](./dr-drill-worksheet.md) · [`incident-response.md`](./incident-response.md) · [`pilot-staff-training-checklist.md`](./pilot-staff-training-checklist.md) · [`pilot-success-criteria.md`](./pilot-success-criteria.md) · [`pilot-handoff-first-cafe.md`](./pilot-handoff-first-cafe.md)

Prefer this document for café day operations. Do not invent policy numbers. Do not install adhoc TRAINING binaries for live service.

---

## 1. Pre-install checklist

- [ ] **Signed + notarized** PILOT/PRODUCTION artifact obtained (not adhoc `Signature=adhoc`)
- [ ] Record: app version, git tag/commit, artifact URL, platform
- [ ] Café = **Restaurant**: `ACTIVE_VERTICAL_ID` unset or `restaurant` (never `retail` / `retail-test` on café)
- [ ] Staff Wi‑Fi plan ready (OPS-01) — see §6 network
- [ ] Master PIN escrow materials ready (paper/envelope) — PIN never in chat/git/Drive
- [ ] Printer / KDS / drawer available if required for this café
- [ ] Owner/manager available for training + DR brief
- [ ] Backup policy approved **or** written CEO/owner waiver of recommended practice

---

## 2. Installation

1. Install only the **signed/notarized** package for the café OS.
2. Verify before first launch: `codesign -dv --verbose=4 <App>` is **not** adhoc; `spctl --assess` / stapler checks per release workflow.
3. Do **not** pilot from `npm run dev`.
4. Windows: signed installer only (WIN-01). Linux: keyring (libsecret/KWallet) required for `safeStorage`.

---

## 3. First launch

| Situation                                   | What you should see               | Action                                               |
| ------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Brand-new machine                           | First-time setup / owner creation | Proceed                                              |
| Prior café machine shows setup unexpectedly | **Danger**                        | **STOP** — Recovery (§12); do not create a new owner |
| **DATABASE RECOVERY REQUIRED**              | Recovery UI                       | Restore backup with Master PIN                       |

Normal path: launch → complete owner setup → accept terms → set Master PIN → escrow offline immediately.

---

## 4. Database verification

- [ ] App reaches ACTIVE login (not stuck on recovery)
- [ ] After first successful day of setup, confirm schema is current (engineering: **v75**)
- [ ] Create first local backup; file appears under `{userData}/backups/` as `flo-backup-….db`
- [ ] Spot-check: owner login, products list, settings present

---

## 5. Staff account / PIN setup

- [ ] Create owner during true first install only
- [ ] Limit manager accounts; unique passwords; deactivate unused staff
- [ ] Set **Master PIN**; write offline escrow; dual-control recommended
- [ ] Brief: Master PIN required for backup/restore and new-machine JWT recover
- [ ] Staff role PINs/passwords per café policy (cashier / waiter / chef / manager)

**Lost Master PIN + no escrow = critical escalate.** Do not brute-force.

---

## 6. Printer setup

1. Settings → printers: add network (9100) / USB / WebUSB as used on site.
2. Set default printer.
3. **Test Print** from Settings.
4. Sale → pay → receipt.
5. Refund → refund receipt (`print-refund` path).
6. If drawer used: POS **Open cash drawer** (deliberate kick; not auto-on-pay).
7. Induce failure (printer offline): confirm **payment still succeeds**; reprint manually.

Print failure after pay is **S2** — money stands. Do not cancel a paid order to “fix” print.

---

## 7. KDS setup (Restaurant only)

1. Enable KDS only if kitchen display is required.
2. Prefer `network_mode = localhost` if KDS is in-app on the same machine.
3. Multi-device: set `kds_lan` or `lan` **only** on **staff-only** SSID/VLAN (**OPS-01**).
4. **NEVER** guest Wi‑Fi / public hotspot. Ports **3001–3003** must be unreachable from guest.
5. Place test order → confirm ticket on KDS → bump statuses (pending → preparing → ready → served).
6. Retail vertical must **not** bind KDS `:3002` — café installs stay Restaurant.

If guest can reach POS: set `localhost`, restart, stop trading until fixed (**S1**).

---

## 8. Backup setup

| Topic         | Fact                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Local path    | `{userData}/backups/`                                                                                            |
| Filename      | `flo-backup-{ISO-timestamp}-{hex}.db`                                                                            |
| Auth          | Master PIN (Settings → Database Tools)                                                                           |
| Not in backup | `jwt-secret.enc`, Master PIN itself                                                                              |
| Drive         | Optional; product schedule `daily`\|`weekly`; retention default **10** is product behavior, **not** approved SLA |

**Numeric policy (frequency / local retention / Drive retention / RPO / RTO):** **POLICY VALUE PENDING APPROVAL** — CEO/owner must approve or waive. Do not invent numbers.

**Drive residual (P1-12):** Manual Drive “backup now” is owner JWT **without** Master PIN. Treat owner sessions carefully; escrow still required for restore.

**Recommended (unapproved) practice:** ≥1 local backup per service day; Master PIN escrowed offline.

**Pre-restore identity:** There is **no** `installation_id` on backups. Confirm filename timestamp, size, and café spot-check (owner email / products) **before** PIN confirm. A valid wrong-café `.db` **will** replace live data after confirm.

---

## 9. Test transaction

- [ ] Open shift / float if shifts enabled
- [ ] Cash sale end-to-end
- [ ] Non-cash / manual tender sale
- [ ] Held order resume (if used)
- [ ] Receipt observed

---

## 10. Refund test

- [ ] Manager-PIN refund on a paid bill
- [ ] Confirm Restaurant = **money-only** (no restock)
- [ ] Confirm paid order cannot be cancelled (409 / Cancel hidden) — refund owns money

---

## 11. Day-close test

- [ ] Close shift with counted cash
- [ ] Day close / Z path
- [ ] Expected cash understood as float + cash in − cash refunds (not Gross/Net)
- [ ] Variance recorded

---

## 12. Recovery test

Use [`dr-drill-worksheet.md`](./dr-drill-worksheet.md) on signed café or spare machine.

### STOP RULE

> If the POS unexpectedly shows setup after it was previously configured: **STOP TRADING. DO NOT complete setup. Enter recovery.**

Also apply when **DATABASE RECOVERY REQUIRED**.

1. Create backup; note filename.
2. Simulate missing DB / recovery UI (lab) **or** tabletop the steps on café.
3. Restore with Master PIN from the **correct** café file.
4. Post-restore: orders/bills/payments, FIN-01 outstanding = total − gross tender, login, printer, KDS, one test sale, new backup, log RTO/RPO.
5. New-machine: restore `.db` without `.enc` → JWT `recovery_required` → owner + Master PIN recover API (`POST /api/auth/jwt-secret/recover`).

Corrupt backups are rejected (`success: false`). Wrong **valid** café backup is an **operator** risk — identity check is mandatory.

Factory reset ≠ recovery. Never factory-reset to “fix” a missing DB.

---

## 13. Staff training

Complete [`pilot-staff-training-checklist.md`](./pilot-staff-training-checklist.md) for every role that will work the pilot:

SALE · REFUND · CANCEL (incl. H1 409) · SHIFT · DAY CLOSE · KDS · 86 · LOW STOCK · RECOVERY · CHEF (H3 PIN)

---

## 14. Sign-off

Complete [`pilot-signoff.md`](./pilot-signoff.md):

1. Release identity (commit/tag, artifact URL, class = **PILOT/PRODUCTION**)
2. All applicable gates PASS (or written CEO/CTO waiver)
3. CTO + CEO/operator + Pilot owner signatures

**Engineering PASS alone does not authorize live service.**

---

## 15. Incident escalation

| Severity | Examples                                                                          | Action                                                                                    |
| -------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **S1**   | Money corruption suspicion; guest Wi‑Fi reaches POS; unexpected setup / data loss | Stop trading; owner + escalate; log in [`pilot-incident-log.md`](./pilot-incident-log.md) |
| **S2**   | Printer/KDS down; print fail after pay                                            | Continue billing if safe; KOT/manual; reprint; log                                        |
| **S3**   | Non-critical UX / single-device glitch                                            | Log; continue with workaround                                                             |
| **S4**   | Cosmetic / training question                                                      | Note for support                                                                          |

Paid cancel returning **409** is **expected** — use refund, do not retry cancel as a money undo.

Canonical detail: [`incident-response.md`](./incident-response.md).

---

## 16. Pilot daily checklist

### Opening

1. Launch app; staff login.
2. Confirm `network_mode` / KDS reachability if used (OPS-01).
3. Open shift / float.
4. Quick printer check if prior issues.
5. Glance low-stock attention (owner/manager).

### During service

- Orders / payments / refunds through the app.
- Do not double-submit pay on retry.
- Paid mistakes → **refund**, never cancel-after-tender.
- Chef cancel → manager PIN (H3).
- Unexpected setup/recovery mid-day → **STOP RULE**.

### Closing

1. Close shift; day close / Z.
2. Review Gross / Refunds / Net (reports) vs cash Z (tender-based) — different views.
3. Local backup spot-check (or confirm Drive ran).
4. Log incidents before leaving.

---

## OPS-01 — Network (mandatory)

| Rule                       | Detail                                             |
| -------------------------- | -------------------------------------------------- |
| Default                    | `network_mode = localhost`                         |
| Multi-device               | `kds_lan` / `lan` **only** on staff-only SSID/VLAN |
| **NEVER**                  | Guest Wi‑Fi, public hotspot                        |
| Cleartext                  | Staff LAN HTTP/WS is an accepted pilot limitation  |
| Guest reach POS :3001–3003 | **S1 — stop trading**; return to `localhost`       |

Site verification required. Policy text alone ≠ PASS.

---

## Appendix — Retail store pilot (if authorized)

Café docs above assume **Restaurant**. For a controlled **Retail** pilot only:

1. Set `ACTIVE_VERTICAL_ID=retail` at install/start (never on a café machine).
2. Confirm KDS `:3002` and Server App `:3003` are **connection-refused**.
3. Confirm POS is takeaway-only (no tables / no 86 chrome).
4. Train refund **optional restock** + exchange (ADR-011/012) using the training checklist Retail rows.
5. Do not use the Restaurant KDS/86 sections as if they apply.
6. Close the same human gates A–J on a **signed** RC; Retail install still lacks a separate long-form runbook — this appendix is the minimum until one is written.

---

## Quick links

| Need                  | Doc                                                     |
| --------------------- | ------------------------------------------------------- |
| Staff training        | `pilot-staff-training-checklist.md`                     |
| Success criteria      | `pilot-success-criteria.md`                             |
| Sign-off              | `pilot-signoff.md`                                      |
| Backup mechanics      | `backup-restore.md`                                     |
| DR drill              | `dr-drill-worksheet.md`                                 |
| First-café handoff    | `pilot-handoff-first-cafe.md`                           |
| Ops readiness report  | `../05-production/pilot-operations-readiness-report.md` |
| Short troubleshooting | `runbook.md`                                            |
