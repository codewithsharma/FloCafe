<!-- Last updated: 2026-08-15, schema v80 -->

# OPS-01 — Pilot release & operations closure

**Slice:** Pilot operations / release gates (not a product feature phase)  
**Branch:** `restaurant-vertical`  
**Engineering baseline:** `24966ba7272aa4e0e6650796ec469a3cd60ed423`  
**Author of baseline:** Dev Raj Sharma \<sharmadevraj2204@gmail.com\>  
**App version:** 3.0.5 · **Schema:** v80  
**Prior audit:** Post-H4 **PILOT READY WITH CONDITIONS**  
**Canonical plan:** [`../00-product/capability-matrix.md`](../00-product/capability-matrix.md) — H1–H4 remain **🟡 Hardening** depth (not Existing)

## Scope

Closed: reproducible pilot baseline identity, required configuration, operator runbook refresh, release checklist, acceptance gates, drill evidence from existing suites, security-hardening test-debt classification.

**Not in OPS-01:** Phase 4.16, Planned/Later/Frozen features, durable KDS outbox, schema/money changes, H5 engineering, Drive PIN product fix (DRV-01), signed-notarized packaging credentials.

---

## 1. Pilot baseline (reproducible)

| Field       | Value                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| Branch      | `restaurant-vertical`                                                               |
| Commit      | `24966ba7272aa4e0e6650796ec469a3cd60ed423`                                          |
| Message     | `feat: harden restore integrity and mutation conflicts` (H4)                        |
| Preceding   | H3 `6b85950` · H1/H2 `c5bfc19`                                                      |
| Schema      | v75                                                                                 |
| App version | 3.0.5 (`package.json`) — version string may lag RC tag; **commit is authoritative** |
| Vertical    | Restaurant (`ACTIVE_VERTICAL_ID` unset or `restaurant`)                             |
| Companions  | API `:3001` · KDS `:3002` · Server App `:3003` (optional)                           |
| Hardware    | POS host; optional ESC/POS 58/80 thermal; optional KDS display                      |
| Roles       | Owner, Manager, Cashier, Waiter, Chef                                               |

**Stale references superseded:** older ops docs citing `0200cae`, `e236542`, dirty trees, or “H1/H2/H3” with the **pre-matrix** meaning (paid-cancel / FIN-02 / chef PIN only) are historical. Current engineering stack for pilot is **H1–H4 through `24966ba`**.

**Release tag:** Not created by OPS-01 (not authorized). Live café still requires a **signed/notarized** artifact built from this (or explicitly approved descendant) clean tree.

---

## 2. Configuration

See [`../13-operations/ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md).

**Must flip from fresh defaults (operator action):**

- `shifts_enabled` → `true`
- `require_open_shift_for_cash` → `true`

**Network:** `localhost` preferred for single-machine; `kds_lan`/`lan` only on staff-only SSID (OPS-01). Guest reach to :3001–3003 = stop trading.

**Backup:** Local Master-PIN backups are primary. Drive is optional secondary only (DRV-01).

---

## 3. Operator procedures

Primary day runbook: [`../13-operations/pilot-runbook.md`](../13-operations/pilot-runbook.md) (baseline updated to `24966ba`).

### Opening

1. Start Operavia (desktop) — companions start with main process when modules enabled.
2. Verify KDS if used: Kitchen Display / ticket appears; if companion down, `kds-info` 503 (H2).
3. Verify printer: Settings → Test Print.
4. Staff login (correct role).
5. Open shift; enter cash float.
6. Confirm cash gate: cash pay blocked without open shift when required.

### Normal service

Create/modify order → KDS → prepare/ready → discount only if owner/manager → payment (Idempotency-Key) → print/reprint receipt → complete after settle → cash discipline.

### KDS failure

- Recognize **stale** board when disconnected with last-known tickets (H2).
- Restart companion / app; confirm advertise restored.
- **Paper/verbal** tickets until recovered.
- Do not invent duplicate tickets after recovery; SQLite is SoR; CAS 409 on stale status bumps.

### Printer failure

- Payment is **not** blocked.
- Failed print does **not** write success `print_logs` (H1).
- Reprint from Orders / print-bill path when printer returns.
- Swap printer in Settings if hardware replaced; Test Print.

### Backup

- End of day (minimum): Settings → Backup & Data → Create Backup + Master PIN.
- H4: create runs `PRAGMA integrity_check` before success.
- Store under `{userData}/backups/`; treat as **sensitive** (full DB).
- Drive ≠ sole backup.

### Restore

- Only for recovery / spare drill — **not** routine.
- Authorized: Master PIN path (Settings history / Recovery UI).
- Prefer restore onto **test/spare** userdata first.
- Corrupt backup fails closed.
- Backup-only staff stay inactive after restore onto fresh install; reactivate deliberately.
- Audits: `backup.created`, `restore.completed` / `restore.failed`.

### Shift close

Stop new orders → count cash → close shift → review variance → day close / Z-report → daily local backup.

---

## 4. Drill results (engineering evidence)

Drills use **existing** harnesses. On-café hardware/network remains **PENDING** human PASS on [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md).

| Drill                  | Result                          | Evidence                                                                               |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| 1 Normal sale          | **PASS** (suite)                | `test:h1` 37/37; `test:issue-214` 85/85; `test:cash-payment-gate` PASS                 |
| 2 Internet failure     | **PASS** (design + offline SoR) | Local SQLite billing; cloud never blocks pay — café confirm cloud features unavailable |
| 3 KDS failure          | **PASS** (suite)                | `test:h2` 33/33; `test:kds-bind-degrade` PASS                                          |
| 4 Printer failure      | **PASS** (suite)                | `test:h1` H1-RCPT failed print → 502, no `print_logs`; `test:receipt-printing` 8/8     |
| 5 Backup               | **PASS** (suite)                | `test:h4` 20/20 H4-BACKUP-01; `test:backup` PASS                                       |
| 6 Restore              | **PASS** (suite)                | `test:backup` continuity + REC-01 PASS; H4 conflict PASS                               |
| 7 Staff permissions    | **PASS** (suite)                | `test:h3` 33/33; `test:staff-authz` 36/36; `test:orders-authz` PASS                    |
| 8 Shift reconciliation | **PASS** (suite)                | `shift-reconciliation` PASS; `day-close` PASS; `day-close-z` PASS                      |

---

## 5. Acceptance gates

| Gate                | Meaning                                       | Engineering                          | Live café                      |
| ------------------- | --------------------------------------------- | ------------------------------------ | ------------------------------ |
| **A Billing**       | Complete sale without internet                | **PASS**                             | PENDING site                   |
| **B Financial**     | Pay, receipt, refund, recon, Z correct        | **PASS** (FIN-01/H1/M5/M6 suites)    | PENDING site                   |
| **C Kitchen**       | KDS works + documented fallback               | **PASS** (H2 + runbook)              | PENDING if KDS used            |
| **D Recovery**      | Backup + restore demonstrated                 | **PASS** (suites)                    | PENDING café/spare drill on RC |
| **E Authorization** | Roles limited as documented                   | **PASS** (H3)                        | PENDING training               |
| **F Hardware**      | Printer/KDS failure procedures demonstrated   | **PASS** (suites) / hardware PENDING | PENDING                        |
| **G Operations**    | Operator can follow runbook without developer | **CONDITION**                        | PENDING owner training         |

Failed live items → classify as **CONDITION** or **OPERATOR PROCEDURE**, not silent code fixes in OPS-01.

---

## 6. Security test debt (`security-hardening.test.ts`)

**Classification: test isolation — DOCUMENT ONLY. Not a pilot blocker.**

Two failures (`authRateLimit` after 10 PUTs; owner `GET /api/orders/` → 401) occur because an earlier password-change assertion sets `tokens_valid_after`, invalidating the shared `ownerAuth` JWT. Later assertions reuse the stale token and receive **401** before `authRateLimit` runs. Production behavior (invalidate sessions after password change) is intentional.

**Do not redesign rate limiting in OPS-01.** Optional post-pilot: re-seed JWT after password change in that test file.

---

## 7. Remaining blockers vs conditions

### Genuine blockers for **live** café (human/release)

| Item                                                         | Class                                         |
| ------------------------------------------------------------ | --------------------------------------------- |
| Signed/notarized PILOT/PRODUCTION artifact for this baseline | **BLOCKER** (live)                            |
| Master PIN escrow completed                                  | **BLOCKER** (live)                            |
| OPS-01 site network verification                             | **BLOCKER** (live if LAN/KDS)                 |
| Backup policy approve/waive                                  | **CONDITION** / CEO waiver allowed            |
| On-site printer/KDS/restore drills on RC                     | **CONDITION** → PASS before first service day |

### Not software blockers (operator conditions)

- Enable shifts + cash gate
- Settle bill before/at complete
- Paper/verbal KDS when companion down
- Manual reprint on print fail
- Local backups primary (not Drive-only)

### Post-pilot / deferred

Audit-trail depth · order-status CAS · stock-adjust idempotency · DRV-01 · durable KDS outbox · print queue · REAL→cents · Phase C CSP · Planned matrix rows · Frozen capabilities

---

## 8. Final OPS-01 verdict

# 🟡 PILOT READY WITH CONDITIONS

Engineering + ops **documentation** closure for H1–H4 baseline `24966ba` is complete. Live service still requires signed RC + human gates on [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md).

---

## Quick links

| Doc           | Path                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Configuration | [`../13-operations/ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md)   |
| Runbook       | [`../13-operations/pilot-runbook.md`](../13-operations/pilot-runbook.md)                             |
| Checklist     | [`../16-release/ops-01-pilot-release-checklist.md`](../16-release/ops-01-pilot-release-checklist.md) |
| Sign-off      | [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md)                             |
| H1–H4         | `h1-…` … `h4-restore-conflict-hardening.md`                                                          |
