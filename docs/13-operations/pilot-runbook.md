# Nexora POS — Pilot Operator Runbook

**Audience:** Café owner / manager for a **controlled pilot**.  
**Canonical ops readiness audit:** `docs/15-project-management/p1.5-pilot-ops-dr-readiness-audit.md`  
**Related:** `disaster-recovery.md` · `backup-restore.md` · `dr-drill-worksheet.md` · `incident-response.md`

This is the single end-to-end guide for pilot operations. Prefer this document over scattered engineering notes.

---

## OPS-01 — Network (mandatory)

| Rule | Detail |
|------|--------|
| Default | `network_mode = localhost` (POS API bound to loopback) |
| Multi-device | Use `kds_lan` or `lan` **only** on a **staff-only** SSID/VLAN |
| **NEVER** | Guest Wi‑Fi, public hotspot, or any network customers can join |
| Cleartext | Staff LAN HTTP/WS is an **accepted pilot limitation**, not a security feature |
| KDS / Server App | Exposure must be **intentional** (enable settings + choose mode deliberately) |

If guest devices can reach the POS IP on ports 3001–3003, **stop LAN modes** and return to `localhost` until the network is fixed.

---

## PRE-GO-LIVE checklist

Complete **before** the first live service day.

### Install & platform

- [ ] Install a **packaged** release build only (not a developer `npm run dev` binary for pilots)
- [ ] **Windows:** use a **signed** installer/artifact only (WIN-01). Do not pilot unsigned NSIS “for convenience”
- [ ] **Linux:** confirm desktop **keyring** (libsecret / KWallet / equivalent) so Electron `safeStorage` works for `jwt-secret.enc`
- [ ] Record app version on this sheet / incident log

### Accounts & Master PIN

- [ ] Create **owner** account during first install (only when this is a true new café)
- [ ] Limit **manager** accounts; strong unique passwords; deactivate unused staff
- [ ] Set **Master PIN** during setup (product requirement for backup/restore)
- [ ] **Offline escrow:** write Master PIN on paper (or sealed envelope); store offline with owner; **do not** store the PIN in the POS database, chat apps, or shared drives
- [ ] Brief: only authorized owner/manager personnel may know the PIN

### Backup

- [ ] Create first local backup after setup (Settings → Database Tools; Master PIN)
- [ ] Know local path: `{userData}/backups/` (filenames `flo-backup-…db`)
- [ ] Treat every `.db` backup as **sensitive business / PII** data (customers, staff, sales)
- [ ] Decide Drive backup: enable with understanding of product schedule options **or** explicitly defer (local-only). See Backup section below
- [ ] Understand: **DB backup alone is not complete machine recovery** (JWT `.enc` + Master PIN required for new machine)

### Network / devices

- [ ] Choose `network_mode` (`localhost` preferred)
- [ ] If not localhost: staff-only Wi‑Fi verified; **guest Wi‑Fi unreachable** to POS
- [ ] KDS paired (if used) on staff LAN; printer smoke-test

### Recovery readiness

- [ ] Owner/manager briefed on **REC-01 STOP RULE** (Recovery section)
- [ ] Controlled **DR drill** completed and passed (`dr-drill-worksheet.md`) with RTO/RPO recorded
- [ ] Incident escalation path known (`incident-response.md`)

**Do not open live service until the DR drill has passed.**

---

## FIRST INSTALL

### Distinguish normal first install from recovery

| Situation | What you should see | Action |
|-----------|---------------------|--------|
| Brand-new machine, never configured | First-time setup / owner creation | Proceed with setup |
| Machine that **previously** ran this café, but now shows setup | **Danger** | **STOP** — follow Recovery (likely missing DB / wrong machine state) |
| Screen says **DATABASE RECOVERY REQUIRED** | Recovery UI | Restore backup — **do not** create a new owner |

### Normal first-install steps

1. Launch packaged app.
2. Complete owner setup (name, password, business details, accept terms).
3. Set **Master PIN**; write escrow offline immediately.
4. Configure `network_mode` (OPS-01).
5. Create a **local backup**; verify the file exists under `{userData}/backups/`.
6. Optional: configure Google Drive backup in Settings (owner).
7. Enable KDS / Server App only if needed; pair KDS on staff LAN.
8. Configure printer; print a test ticket/receipt.
9. Run through one test order → pay → (optional refund) before live service.
10. Complete `dr-drill-worksheet.md` on this or a spare training machine.

---

## DAILY OPERATIONS

### Opening

1. Launch app; staff login.
2. Confirm expected `network_mode` / KDS reachability if used.
3. Open shift / set float per café policy (when shift features are enabled).
4. Quick printer check if previous day had issues.

### During service

- Process orders, payments, and refunds through the app.
- Prefer unique Idempotency-Key behavior already enforced by the product for payments — do not double-submit blindly if the UI retries.
- If anything looks like **unexpected setup** or **recovery** mid-day → **STOP RULE** below.

### Closing

1. Close shift / complete day-close per café policy.
2. Review end-of-day reports (Gross / Refunds / Net semantics — not cross-day GAAP; see REP-01 notes in security audits).
3. **Local backup spot-check:** create backup (or confirm scheduled Drive ran) and verify a new/non-trivial file exists.
4. Log incidents (if any) before leaving.

### Incident logging

Record: date/time, app version, OS, what happened, orders affected, whether backup was restored, who was called. Prefer in-app support outbox and/or GitHub Issues for software defects.

---

## BACKUP

### What is backed up (product behavior)

- Local SQLite business database snapshot (`.db`): orders, bills, payments, refunds, shifts, day-close, settings (except forge key), catalog, etc.
- Format: self-contained SQLite with `_flo_meta.schema_version` (see `backup-restore.md`).

### What is NOT backed up

- `jwt-secret.enc` (OS-protected signing secret under `userData`) — **not** included in `.db` or Drive DB uploads
- Master PIN (not stored for you to “download later” as a recovery file — you must escrow it offline)
- Electron app binaries / OS user accounts

### Local backups

- Path: `{userData}/backups/`
- Create/restore: Settings → Database Tools (Master PIN) or recovery UI when in RECOVERY_REQUIRED
- Restrict OS folder ACLs to owner account; do not email backups casually

### Google Drive (product behavior)

- Optional scheduled/manual upload via Settings (`google-drive.ts`)
- Frequency options in product: `daily` | `weekly`
- Product default retention count: **10** remote files (code default) — this is **product behavior**, not an approved pilot policy number
- Manual Drive “backup now” is owner-authenticated (JWT); Master PIN is **not** required for that Drive action (DRV-01 residual — treat owner sessions carefully)

### Policy layers (do not invent numbers)

| Layer | Status |
|-------|--------|
| Product behavior | Local + optional Drive as implemented |
| Recommended operator policy | Create/verify a local backup at least once per service day; keep offline copies of Master PIN escrow |
| **Approved pilot policy (frequency)** | **POLICY VALUE PENDING APPROVAL** |
| **Approved pilot policy (local retention days/count)** | **POLICY VALUE PENDING APPROVAL** |
| **Approved pilot policy (Drive retention)** | **POLICY VALUE PENDING APPROVAL** (product default exists but is not pilot-approved policy) |

### Why DB backup alone ≠ complete machine recovery

| Artifact | Same machine | New machine |
|----------|--------------|-------------|
| `flo.db` / backup `.db` | Restore business data | Restore business data |
| `jwt-secret.enc` | Keep it — login tokens keep working | Missing → JWT `recovery_required`; recover with owner + Master PIN (`POST /api/auth/jwt-secret/recover`) — **no silent secret mint** |
| Master PIN | Needed to authorize restore | Must be known/set to restore and to recover JWT |

---

## RECOVERY

### STOP RULE

> **If the POS unexpectedly shows setup/first-install after it has previously been configured:**  
> **STOP TAKING ORDERS/PAYMENTS.**  
> **DO NOT complete setup.**  
> **Enter recovery procedure.**

Also apply when the app shows **DATABASE RECOVERY REQUIRED**.

Canonical engineering detail: `p1.2-rec-01-recovery-audit.md`.

### Missing DB / RECOVERY_REQUIRED

1. Stop trading.
2. Confirm recovery UI (not a new café wizard).
3. Do **not** create a new owner.
4. Locate the correct backup (local `{userData}/backups/` or Drive download).
5. Restore with **Master PIN**.
6. Complete post-restore verification (below).
7. Open an incident.

### Restore valid backup

- Prefer **same schema version** as current app when possible.
- After success, app should return to **ACTIVE** (login works on same machine if `.enc` intact).
- Run financial + device checks; perform one controlled test sale.

### Corrupt backup

- Product rejects corrupt/non-SQLite backups (`success: false`); live DB (if present) is not replaced.
- If still in recovery with no live DB: try the **previous** known-good backup.
- Do not “fix” by completing first-time setup.

### Wrong or stale backup

- There is **no** backup `installation_id` metadata yet — identify backups by **timestamp, café knowledge, and spot-check** (products/owner email) before restore.
- If the wrong café’s data appears after restore: stop trading; restore the correct file; escalate.
- Stale backup = data loss after that timestamp (RPO). Document lost window in the incident.

### No backup available

1. **Stop trading.**
2. Do not invent a new café via setup if this machine was previously configured (REC-01).
3. Escalate immediately (support / engineering).
4. Capture logs (Help → Open Logs Folder), app version, OS, whether `install-state.json` / `.enc` exist.
5. Outcome may be data loss — only authorized rebuild after explicit owner decision.

### Same-machine JWT

- Keep `jwt-secret.enc`.
- After DB restore, login should work with existing staff credentials.
- If login fails oddly, check recovery vs ACTIVE; do not rotate secrets casually.

### New-machine JWT `recovery_required`

1. Install packaged app; restore `.db` with Master PIN.
2. Expect JWT status `recovery_required` when `.enc` is missing.
3. Recover via owner credentials + Master PIN using `POST /api/auth/jwt-secret/recover` (product API; dedicated café recover UI may still be limited — call support if unsure).
4. Prior tokens from the old machine are invalidated after recover/rotate — staff must log in again.
5. Create a fresh local backup after successful recover.

### Master PIN dependency

- Restore and JWT recover require Master PIN knowledge.
- If PIN is lost and escrow is missing: treat as **critical** — escalate; do not guess repeatedly (lockouts may apply).

### Post-restore verification

**Financial**

- [ ] Orders / bills present as expected
- [ ] Payments (gross tender) match expectation
- [ ] Refunds present; statuses sensible
- [ ] FIN-01: outstanding = bill total − gross successful tender (refunds do not recreate collectible capacity)
- [ ] Open/closed shifts and expected cash (if used)
- [ ] Day-close summary if one existed
- [ ] Recent payment/refund audit events if used

**Operational**

- [ ] Login works (same-machine) or JWT recovered (new-machine)
- [ ] `network_mode` still correct; OPS-01 still holds
- [ ] Printer test
- [ ] KDS reconnects on staff LAN only (if used)
- [ ] One **controlled test sale** (order → pay)
- [ ] New local backup after recovery
- [ ] Incident record with RTO (time to usable POS) and RPO (backup age)

---

## FACTORY RESET

Factory reset is **intentional destruction**, not disaster recovery.

| Topic | Behavior (product) |
|-------|--------------------|
| Authorization | Owner session + **Master PIN** + typed confirmation phrase **`INITIALIZE`** |
| Safety | Creates a safety backup **before** wipe |
| Marker | Installation marker cleared only after durable empty DB succeeds |
| Outcome | Returns to first-install semantics |

**Warnings**

- All live café data is wiped from the operational DB after a successful reset.
- Do **not** confuse factory reset with REC-01 recovery.
- Do **not** factory-reset to “fix” a missing DB — restore instead.
- Keep the safety backup and Master PIN escrow before and after.

---

## Quick links

| Need | Doc |
|------|-----|
| Backup mechanics | `backup-restore.md` |
| DR scenarios / RTO-RPO notes | `disaster-recovery.md` |
| Timed drill | `dr-drill-worksheet.md` |
| Severity / escalate | `incident-response.md` |
| Short troubleshooting | `runbook.md` |
| Daily ops summary | `operations.md` |
