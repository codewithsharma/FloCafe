# Operations

**Pilot operators:** use [`pilot-runbook.md`](./pilot-runbook.md) as the primary guide.

## CURRENT STATE

Nexora POS / FloCafe operations are **on-premise** — the restaurant operator IS the operator.

### Daily operations

1. Launch packaged desktop app
2. Staff login by role (owner/manager hygiene — deactivate unused accounts)
3. Opening checks: shift/float if enabled; printer/KDS if used
4. Service via POS (and KDS only on staff LAN — **OPS-01**)
5. Payments / refunds through the app
6. End-of-day: shift close / day-close / reports as configured
7. **Local backup spot-check** (create or confirm backup file exists) — treat as sensitive data
8. Log incidents before leaving

### OPS-01 (mandatory)

- Default `network_mode=localhost`
- `kds_lan` / `lan` only on **staff-only** Wi‑Fi — **NEVER guest Wi‑Fi**
- Cleartext LAN is an accepted pilot limitation, not a security feature

### No server ops team required for core POS.

### Optional cloud ops

FloAdmin coordination — outbound only; never blocks billing.

### Backup / DR

- Mechanics: `backup-restore.md`
- Recovery STOP RULE: `disaster-recovery.md` / `pilot-runbook.md`
- Pre-go-live drill: `dr-drill-worksheet.md`

## TARGET STATE (RestaurantOS)

- Shift close checklist (expanded multi-site)
- Multi-location operator playbook (PLANNED; frozen until pilots)
- Approved numeric pilot backup frequency/retention (**currently POLICY VALUE PENDING APPROVAL**)
