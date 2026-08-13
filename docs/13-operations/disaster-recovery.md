# Disaster Recovery

**Pilot operators:** follow [`pilot-runbook.md`](./pilot-runbook.md) and record drills on [`dr-drill-worksheet.md`](./dr-drill-worksheet.md).

---

## CRITICAL — REC-01 STOP RULE

**If the POS unexpectedly shows setup/first-install after it has previously been configured:**

1. **STOP TAKING ORDERS/PAYMENTS.**
2. **DO NOT complete setup.**
3. **DO NOT TAKE PAYMENTS.**
4. **ENTER RECOVERY** (build shows **DATABASE RECOVERY REQUIRED** when the install marker is present and `flo.db` is missing/empty).
5. **RESTORE THE CORRECT BACKUP** (Master PIN + recovery screen / Database Tools).

Never treat an unexpected setup wizard as a successful reset.

See: `docs/15-project-management/p1.2-rec-01-recovery-audit.md`.

---

## CURRENT STATE

### RPO (Recovery Point Objective)

Last successful backup — manual local and/or Google Drive scheduled.  
Pre-migration auto-backups reduce migration RPO.  
**Numeric pilot RPO SLA:** **POLICY VALUE PENDING APPROVAL** (establish baseline via DR drill).

### RTO (Recovery Time Objective)

Time to restore backup + return to usable POS (qualitatively ~minutes).  
**Pilot drill target:** complete worksheet with recorded RTO; **≤ 30 minutes** used as drill pass guidance in `dr-drill-worksheet.md`.  
**Numeric contractual RTO SLA:** **POLICY VALUE PENDING APPROVAL**.

### Disaster scenarios

| Scenario | Operator procedure |
|----------|-------------------|
| DB missing (REC-01) | Recovery UI → restore — **do not** run first-time setup |
| Corrupt backup selected | Restore fails closed; try prior good backup; do not setup |
| Wrong / stale backup | Identify by timestamp + spot-check (no `installation_id` yet); restore correct file; document data-loss window |
| No backup | Stop trading; escalate; capture logs/version; owner-authorized rebuild only |
| Same-machine restore | Keep `jwt-secret.enc` + Master PIN; restore `.db`; verify login + money |
| New-machine / hardware failure | Restore `.db`; JWT `recovery_required` without `.enc`; owner + Master PIN recover API; no silent secret mint |
| DB corruption (openable with warnings) | Prefer restore last known-good backup; `audit:db` diagnostic for engineering |
| Bad migration | Pre-migration auto-backup → restore |
| Accidental factory reset | Intentional only (PIN + `INITIALIZE`); uses safety backup — distinct from REC-01 |
| Cloud deletion | Local data retained; cloud re-register |

### Same-machine restore checklist

1. Confirm `jwt-secret.enc` still present.
2. Restore correct `.db` with Master PIN.
3. Verify ACTIVE (not recovery/setup).
4. Financial verification (orders, bills, gross tender, refunds, FIN-01 outstanding, shifts, day-close, audits).
5. Printer / KDS / `network_mode` (OPS-01).
6. Controlled test sale.
7. New local backup; open incident with RTO/RPO.

### New-machine restore checklist

1. Packaged (+ signed Windows) install.
2. Master PIN known (escrow).
3. Restore `.db`.
4. Expect JWT `recovery_required` if `.enc` missing.
5. Recover: owner email/password + Master PIN → `POST /api/auth/jwt-secret/recover`.
6. Staff re-login; verify financial + devices; test sale; backup.

### Factory reset vs disaster recovery

| | Factory reset | Disaster recovery |
|--|---------------|-------------------|
| Intent | Wipe café → first install | Restore known-good café |
| Auth | Owner + Master PIN + phrase `INITIALIZE` | Master PIN restore |
| Safety backup | Yes, before wipe | Use existing backups |
| Marker | Cleared only after durable empty DB | Marker kept / re-asserted after restore |

### Untested / residual

- Full machine loss with **no** backup and **no** Master PIN knowledge
- Corrupt-but-openable live DB still allows start with health warnings (pre-existing)
- JWT recover café UI still limited (API path exists)
- No backup `installation_id` metadata yet

### OPS-01 reminder

Never recover onto a host that exposes `kds_lan`/`lan` on **guest Wi‑Fi**. Cleartext staff LAN remains an accepted pilot limitation, not a security feature.
