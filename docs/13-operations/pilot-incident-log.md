# Pilot Incident Log

**Product:** Nexora POS  
**Audience:** Café owner / manager / support  
**Related:** [`incident-response.md`](./incident-response.md) · [`pilot-runbook.md`](./pilot-runbook.md) · [`disaster-recovery.md`](./disaster-recovery.md)

Use one entry per incident. Prefer paper or a shared ops folder **outside** the POS database. Do not store Master PIN in this log.

---

## Severity (S1–S4) — CURRENT STATE

From `incident-response.md`:

| Level | Meaning | Immediate response |
|-------|---------|-------------------|
| **S1 — Stop trading** | Unexpected setup / `RECOVERY_REQUIRED` mid-service; missing `flo.db`; cannot take payments; no usable backup; wrong café data after restore; payment/refund discrepancy that cannot be trusted; suspected JWT/credential compromise; POS reachable from **guest Wi‑Fi** while in `kds_lan`/`lan` | **STOP** affected transactions where practical; **do not** complete setup; recover or secure network; escalate owner + support/engineering |
| **S2 — Degraded** | KDS down; printer down; Drive backup failed but local backup OK; single station issue | Continue with workaround; fix when safe; log |
| **S3 — Data/reporting** | Reports look wrong but payments still reliable; stale backup with known RPO gap | Continue if money path trusted; reconcile after service; escalate to S1 if money unclear |
| **S4 — Non-blocking** | WhatsApp down; cosmetic UI | Continue; reconnect later |

**REC-01 STOP RULE:** If a previously configured café shows unexpected first-time setup or `DATABASE RECOVERY REQUIRED`, **do not create a new owner**. Restore from backup.

---

## Incident entry template

Copy for each incident:

```text
Incident ID:        P1-<cafe>-YYYYMMDD-<nn>
Date / time (local):
Date / time (UTC):
Severity:           S1 | S2 | S3 | S4
Café:
Terminal / machine:
App version:
network_mode:
Operator:

Symptom:

Impact (service / money / data):

Immediate action:

Recovery action (backup file, RTO/RPO if measured):

Financial impact (bills / amounts / outstanding):

Root cause (known / suspected / unknown):

Fix applied:

Verification (test sale / report check / restore verify):

Owner (follow-up):
Status:             OPEN | MITIGATED | CLOSED
Next review date:
```

---

## Register (summary)

| ID | Date | Sev | Café | Summary | Status | Owner |
|----|------|-----|------|---------|--------|-------|
| | | | | | | |

---

## Escalation path (pilot)

1. On-site owner / manager  
2. Support / engineering (preserve logs + latest backups; attach version, OS, `network_mode`, backup filename, timestamps)  
3. GitHub Issues for software defects  
4. CEO/CTO for S1 go-live / waiver decisions
