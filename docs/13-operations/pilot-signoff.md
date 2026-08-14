# Pilot Sign-off (P1.6)

**Product:** Opervia Restaurant v3.0.5  
**Purpose:** Mandatory gates before first live café service day.  
**Related:** [`pilot-release-checklist.md`](../16-release/pilot-release-checklist.md) · [`pilot-runbook.md`](./pilot-runbook.md) · [`dr-drill-worksheet.md`](./dr-drill-worksheet.md) · [`pilot-handoff-first-cafe.md`](./pilot-handoff-first-cafe.md) · [`p1.6-cto-release-control-decision.md`](../15-project-management/p1.6-cto-release-control-decision.md)

**Status values (use exactly one per gate):** `PASS` · `FAIL` · `PENDING` · `NOT APPLICABLE`

Do **not** mark `PASS` without evidence (artifact path, worksheet, log, screenshot, or signed acknowledgment). Automated CI alone is insufficient for operational gates.

**Vertical for this pilot:** Opervia Restaurant only. Leave `ACTIVE_VERTICAL_ID` **unset** or set `restaurant`. Never `retail` / `retail-test` on a café install.

---

## Release identity (fill at sign-off)

| Field                       | Value                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| App version                 | 3.0.5                                                                                                                                 |
| Git commit / tag            | Engineering baseline includes `053421e` (Phase 3.4). **Pilot install must use a signed/notarized RC tag — not an adhoc local build.** |
| Artifact path / release URL |                                                                                                                                       |
| Platform(s) for this pilot  |                                                                                                                                       |
| Artifact class              | TRAINING/QA · **PILOT/PRODUCTION** (must be PILOT/PRODUCTION for live café)                                                           |
| `ACTIVE_VERTICAL_ID`        | unset or `restaurant`                                                                                                                 |

---

## Approval layers (do not conflate)

| Layer                    | Meaning                                            | Status                                                                                                                                                      |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ENGINEERING APPROVAL** | Code + tests meet supervised-pilot engineering bar | **PASS** (2026-08-14) — Phase 3.4 closed; focused matrix + `npm test` EXIT 0; lint 0 errors; build PASS. Evidence: commits `053421e`, `42c081b`, `157455c`. |
| **OPERATIONAL APPROVAL** | Site network, escrow, training, backup policy      | **PENDING** — human/ops                                                                                                                                     |
| **CTO APPROVAL**         | Release control signature below                    | **PENDING**                                                                                                                                                 |
| **CEO APPROVAL**         | Business authorization signature below             | **PENDING**                                                                                                                                                 |

Engineering PASS does **not** authorize live service.

---

## Mandatory gates

| Gate                                             | Status                                                                   | Evidence / notes                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Phase 3.4 correctness residuals              | **PASS**                                                                 | Commit `053421e`; restaurant-isolation / order-boundary / held-orders / inventory-boundary / synthetic-retail / production-retail; `npm test` EXIT 0 (2026-08-14)                                                                                                   |
| [x] Restaurant vertical safety                   | **PASS**                                                                 | Unset `ACTIVE_VERTICAL_ID` → restaurant (`vertical-config.ts`); documented in `.env.example` + local-setup                                                                                                                                                          |
| [x] P1.5 DR drill PASS                           | **PASS**                                                                 | Packaged drill 2026-08-13; UD `$HOME/nexora-p1-5-dr-final`; RTO 6.12 min; RPO 18 s; backup `flo-backup-2026-08-13T03-09-17-436Z-883089da.db`. Attach completed worksheet.                                                                                           |
| [ ] Master PIN escrow completed                  | **PENDING**                                                              | Offline paper/envelope per café — **human/operator action**. Do not store PIN in DB, chat, Drive, or this repo. Procedure: `pilot-runbook.md` PRE-GO-LIVE / FIRST INSTALL.                                                                                          |
| [ ] OPS-01 accepted/enforced                     | **PENDING**                                                              | Policy in `operations.md` / `pilot-runbook.md`. **Site verification required** (staff SSID; guest Wi‑Fi cannot reach POS ports 3001–3003). Docs alone ≠ PASS.                                                                                                       |
| [ ] Backup policy approved                       | **PENDING**                                                              | Frequency / local retention / Drive retention = **POLICY VALUE PENDING APPROVAL** (`backup-restore.md`). CEO/owner must approve numbers or written waiver of recommended practice. Do not invent values.                                                            |
| [ ] Production artifact packaged                 | **PENDING**                                                              | Local `release/mac-arm64/Nexora.app` re-checked 2026-08-14: **Signature=adhoc**, TeamIdentifier unset — TRAINING/QA only. Codesign identities on this machine: **0**. `CSC_*` / `APPLE_API_*` env: **UNSET**. Blocker: credentials / CI secrets / operator signing. |
| [ ] Windows artifact signed if Windows pilot     | **NOT APPLICABLE** until Windows café chosen · else **PENDING** (WIN-01) |                                                                                                                                                                                                                                                                     |
| [ ] Linux keyring verified if Linux pilot        | **NOT APPLICABLE** until Linux café chosen · else **PENDING**            |                                                                                                                                                                                                                                                                     |
| [ ] Real printer verified if printer is required | **PENDING** / **NOT APPLICABLE** if printer not required                 | DR: printers list empty — hardware not verified                                                                                                                                                                                                                     |
| [ ] KDS verified if KDS is required              | **PENDING** / **NOT APPLICABLE** if KDS not required                     | DR: port listen only; kitchen display UX not café-verified                                                                                                                                                                                                          |
| [ ] Fresh installation verified                  | **PASS** (engineering) · **PENDING** (café machine)                      | Isolated smoke `$HOME/nexora-p1-6-fresh-smoke`: FIRST_INSTALL → setup → shifts → cash/card sale → refund → day close → Master PIN backup; flo-desktop untouched                                                                                                     |
| [ ] Recovery verified                            | **PASS** (engineering DR) · **PENDING** café owner re-brief              | REC-01 UI restore + financial continuity                                                                                                                                                                                                                            |
| [ ] Financial verification verified              | **PASS** (engineering DR) · **PENDING** café re-confirm                  | FIN-01 outstanding continuity post-restore                                                                                                                                                                                                                          |
| [ ] Incident escalation understood               | **PENDING**                                                              | Owner/manager brief using `incident-response.md` + `pilot-incident-log.md`                                                                                                                                                                                          |
| [ ] Owner/manager trained                        | **PENDING**                                                              | Pilot runbook walkthrough                                                                                                                                                                                                                                           |
| [ ] CEO/CTO approval                             | **PENDING**                                                              | Sign below                                                                                                                                                                                                                                                          |

### Explicitly not a pilot-signoff mandatory gate

| Item                                         | Status      | Notes                                                                                                                                                                                                                     |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1.3 formal failure/recovery matrix document | **BACKLOG** | Not listed on this sign-off. Related suites exercised 2026-08-14 (`test:issue-214`, `test:rec-01`, `test:printer`, `test:first-run`, `test:jwt-secret`, `test:backup`) — PASS. Formal matrix remains optional P1 backlog. |

---

## Signatures

| Role                      | Name                                 | Status                            | Date       | Initials |
| ------------------------- | ------------------------------------ | --------------------------------- | ---------- | -------- |
| Engineering (attestation) | Automated + agent session 2026-08-14 | **PASS** (engineering layer only) | 2026-08-14 | —        |
| CTO                       |                                      | **PENDING**                       |            |          |
| CEO / operator            |                                      | **PENDING**                       |            |          |
| Pilot owner (café)        |                                      | **PENDING**                       |            |          |

**Live service authorization:** Only when all applicable gates are `PASS` (or CEO/CTO written waiver attached).

---

## Waivers (if any)

| Gate waived | Approver | Date | Reason |
| ----------- | -------- | ---- | ------ |
|             |          |      |        |
