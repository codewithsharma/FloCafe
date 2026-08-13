# Pilot Sign-off (P1.6)

**Product:** Nexora POS v3.0.5  
**Purpose:** Mandatory gates before first live café service day.  
**Related:** [`pilot-release-checklist.md`](../16-release/pilot-release-checklist.md) · [`pilot-runbook.md`](./pilot-runbook.md) · [`dr-drill-worksheet.md`](./dr-drill-worksheet.md)

**Status values (use exactly one per gate):** `PASS` · `FAIL` · `PENDING` · `NOT APPLICABLE`

Do **not** mark `PASS` without evidence (artifact path, worksheet, log, screenshot, or signed acknowledgment). Automated CI alone is insufficient for operational gates.

---

## Release identity (fill at sign-off)

| Field | Value |
|-------|--------|
| App version | 3.0.5 |
| Git commit / tag | |
| Artifact path / release URL | |
| Platform(s) for this pilot | |
| Artifact class | TRAINING/QA · PILOT/PRODUCTION |

---

## Mandatory gates

| Gate | Status | Evidence / notes |
|------|--------|------------------|
| [ ] P1.5 DR drill PASS | **PASS** | Packaged drill 2026-08-13; UD `$HOME/nexora-p1-5-dr-final`; RTO 6.12 min; RPO 18 s; backup `flo-backup-2026-08-13T03-09-17-436Z-883089da.db`. Attach completed worksheet. |
| [ ] Master PIN escrow completed | **PENDING** | Offline paper/envelope per café; not verified for production café |
| [ ] OPS-01 accepted/enforced | **PENDING** | Policy documented; on-site staff SSID / guest isolation not verified for café |
| [ ] Backup policy approved | **PENDING** | Frequency / local retention / Drive retention = **POLICY VALUE PENDING APPROVAL** |
| [ ] Production artifact packaged | **PENDING** | Local `release/mac-arm64/Nexora.app` is **adhoc-signed TRAINING/QA**, not notarized production |
| [ ] Windows artifact signed if Windows pilot | **NOT APPLICABLE** until Windows café chosen · else **PENDING** (WIN-01) | |
| [ ] Linux keyring verified if Linux pilot | **NOT APPLICABLE** until Linux café chosen · else **PENDING** | |
| [ ] Real printer verified if printer is required | **PENDING** / **NOT APPLICABLE** if printer not required | DR: printers list empty — hardware not verified |
| [ ] KDS verified if KDS is required | **PENDING** / **NOT APPLICABLE** if KDS not required | DR: port listen only; kitchen display UX not café-verified |
| [ ] Fresh installation verified | **PASS** (engineering) · **PENDING** (café machine) | Isolated smoke `$HOME/nexora-p1-6-fresh-smoke`: FIRST_INSTALL → setup → shifts → cash/card sale → refund → day close → Master PIN backup; flo-desktop untouched |
| [ ] Recovery verified | **PASS** (engineering DR) · **PENDING** café owner re-brief | REC-01 UI restore + financial continuity |
| [ ] Financial verification verified | **PASS** (engineering DR) · **PENDING** café re-confirm | FIN-01 outstanding continuity post-restore |
| [ ] Incident escalation understood | **PENDING** | Owner/manager brief using `incident-response.md` + `pilot-incident-log.md` |
| [ ] Owner/manager trained | **PENDING** | Pilot runbook walkthrough |
| [ ] CEO/CTO approval | **PENDING** | Sign below |

---

## Signatures

| Role | Name | Status | Date | Initials |
|------|------|--------|------|----------|
| CTO | | PENDING | | |
| CEO / operator | | PENDING | | |
| Pilot owner (café) | | PENDING | | |

**Live service authorization:** Only when all applicable gates are `PASS` (or CEO/CTO written waiver attached).

---

## Waivers (if any)

| Gate waived | Approver | Date | Reason |
|-------------|----------|------|--------|
| | | | |
