# Incident Response

**Pilot operators:** escalate using this table; day-to-day steps live in [`pilot-runbook.md`](./pilot-runbook.md).

## CURRENT STATE — severity (Operavia POS pilot)

Levels reflect **existing product behavior**, not future RestaurantOS cloud on-call.

| Level                   | Examples (product-grounded)                                                                                                                                                                                                                                                                        | Immediate response                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S1 — Stop trading**   | Unexpected setup / RECOVERY_REQUIRED mid-service; missing `flo.db`; cannot take payments; no usable backup; wrong café data after restore; payment/refund **discrepancy** that cannot be trusted; suspected JWT/credential compromise; POS reachable from **guest Wi‑Fi** while in `kds_lan`/`lan` | **STOP** further affected transactions where practical; do **not** complete setup; enter recovery or secure network; escalate to owner + support/engineering |
| **S2 — Degraded**       | KDS down; printer down; Drive backup failed but local backup OK; single station issue                                                                                                                                                                                                              | Continue with workaround (printed KOT, manual notes); fix when safe; log incident                                                                            |
| **S3 — Data/reporting** | Reports look wrong but payments still reliable; stale backup restored with known RPO gap already documented                                                                                                                                                                                        | Continue service if money path trusted; reconcile after service; escalate if money unclear → treat as S1                                                     |
| **S4 — Non-blocking**   | WhatsApp down; cosmetic UI                                                                                                                                                                                                                                                                         | Continue service; reconnect later                                                                                                                            |

### Financial discrepancy (S1)

If payments, refunds, outstanding balances, or FIN-01 behavior disagree with known bills:

1. **STOP** further affected transactions where practical.
2. Do not “fix” with factory reset.
3. Preserve logs and latest backups.
4. Escalate to owner + engineering with bill IDs and amounts.

### REC-01 / missing DB (S1)

Follow STOP RULE in `disaster-recovery.md`. Restore; verify; test sale; record RTO/RPO.

### Corrupt / wrong / stale / no backup (S1–S2)

| Case               | Action                                                              |
| ------------------ | ------------------------------------------------------------------- |
| Corrupt backup     | Fail-closed; try prior good file                                    |
| Wrong/stale backup | Spot-check identity; restore correct; document loss window          |
| No backup          | Stop; escalate; do not silent-setup a previously configured install |

### Network exposure (S1 if guest-reachable)

Return to `localhost` or staff-only SSID immediately. Cleartext on staff LAN is accepted with OPS-01 — guest access is not.

### JWT / Master PIN compromise (S1)

Owner + Master PIN recover/rotate signing secret; staff re-login; review backup access; escrow PIN offline only.

## Communication

- Owner/manager on site first
- GitHub Issues for software defects
- Support tickets via in-app outbox (cloud v2) when enabled
- Attach: app version, OS, `network_mode`, backup filename, timestamps, RTO/RPO if recovery performed

## TARGET STATE

- Defined on-call for multi-location cloud hub only
- Local POS incidents handled by venue staff via pilot runbook (this pack)
