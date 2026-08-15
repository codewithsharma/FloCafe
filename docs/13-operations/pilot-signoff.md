# Pilot Sign-off (P1.6)

**Product:** Operavia Restaurant v3.0.5  
**Purpose:** Mandatory gates before first live café service day.  
**Related:** [`pilot-release-checklist.md`](../16-release/pilot-release-checklist.md) · [`ops-01-pilot-release-checklist.md`](../16-release/ops-01-pilot-release-checklist.md) · [`ops-02-site-readiness-checklist.md`](./ops-02-site-readiness-checklist.md) · [`pilot-runbook.md`](./pilot-runbook.md) · [`dr-drill-worksheet.md`](./dr-drill-worksheet.md) · [`pilot-handoff-first-cafe.md`](./pilot-handoff-first-cafe.md) · [`../05-production/ops-02-live-pilot-rc-site-readiness.md`](../05-production/ops-02-live-pilot-rc-site-readiness.md) · [`p1.6-cto-release-control-decision.md`](../15-project-management/p1.6-cto-release-control-decision.md)

**Status values (use exactly one per gate):** `PASS` · `FAIL` · `PENDING` · `NOT APPLICABLE`

Do **not** mark `PASS` without evidence (artifact path, worksheet, log, screenshot, or signed acknowledgment). Automated CI alone is insufficient for operational gates.

**Vertical for this pilot:** Operavia Restaurant only. Leave `ACTIVE_VERTICAL_ID` **unset** or set `restaurant`. Never `retail` / `retail-test` on a café install.

---

## Release identity (fill at sign-off)

| Field                       | Value                                                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App version                 | 3.0.5 (commit is authoritative; do not assume older `3.0.5` builds match this tree)                                                                                                |
| Git commit / tag            | Engineering baseline **`24966ba7272aa4e0e6650796ec469a3cd60ed423`** (H1–H4). **Pilot install must use a signed/notarized RC — not an adhoc local build.**                          |
| Artifact path / release URL |                                                                                                                                                                                    |
| Platform(s) for this pilot  |                                                                                                                                                                                    |
| Artifact class              | TRAINING/QA · **PILOT/PRODUCTION** (must be PILOT/PRODUCTION for live café)                                                                                                        |
| `ACTIVE_VERTICAL_ID`        | unset or `restaurant`                                                                                                                                                              |
| OPS-01 docs                 | Configuration + checklist + closure report (2026-08-15) — site gates below still **PENDING**                                                                                       |
| OPS-02 live RC / site       | [`../05-production/ops-02-live-pilot-rc-site-readiness.md`](../05-production/ops-02-live-pilot-rc-site-readiness.md) — **🔴 NO-GO** for live until signed RC + site checklist PASS |

---

## Approval layers (do not conflate)

| Layer                    | Meaning                                            | Status                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ENGINEERING APPROVAL** | Code + tests meet supervised-pilot engineering bar | **PASS WITH CONDITIONS** (2026-08-15) — HEAD `24966ba` (H1–H4); focused `test:h1`–`h4`, `test:backup`, payment/refund/shift/KDS/authz suites green. OPS-01 docs closed. Ops/human gates still PENDING. |
| **OPERATIONAL APPROVAL** | Site network, escrow, training, backup policy      | **PENDING** — human/ops · OPS-02 (2026-08-15): live go-live **NO-GO** until signed RC + [`ops-02-site-readiness-checklist.md`](./ops-02-site-readiness-checklist.md)                                   |
| **CTO APPROVAL**         | Release control signature below                    | **PENDING**                                                                                                                                                                                            |
| **CEO APPROVAL**         | Business authorization signature below             | **PENDING**                                                                                                                                                                                            |

Engineering PASS does **not** authorize live service.

---

## Mandatory gates

| Gate                                             | Status                                                                   | Evidence / notes                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] Phase 3.4 correctness residuals              | **PASS**                                                                 | Historical through H1–H4 (`24966ba`). Focused H1–H4 + backup/payment/refund/shift suites PASS (2026-08-15 OPS-01). Do not claim every boundary suite is inside default `npm test`.                                                                              |
| [x] Restaurant vertical safety                   | **PASS**                                                                 | Unset `ACTIVE_VERTICAL_ID` → restaurant (`vertical-config.ts`); documented in `.env.example` + local-setup                                                                                                                                                      |
| [ ] P1.5 DR drill (café / signed RC)             | **PENDING**                                                              | Historical lab note (TRAINING binary 2026-08-13): RTO 6.12 min; RPO 18 s — **not** café/signed PASS. Re-run `dr-drill-worksheet.md` on signed RC; attach filled sheet.                                                                                          |
| [ ] Master PIN escrow completed                  | **PENDING**                                                              | Offline paper/envelope per café — **human/operator action**. Do not store PIN in DB, chat, Drive, or this repo. Procedure: `pilot-runbook.md` §3 / §5.                                                                                                          |
| [ ] OPS-01 accepted/enforced                     | **PENDING**                                                              | Policy in `operations.md` / `pilot-runbook.md`. **Site verification required** (staff SSID; guest Wi‑Fi cannot reach POS ports 3001–3003). Docs alone ≠ PASS.                                                                                                   |
| [ ] Backup policy approved                       | **PENDING**                                                              | Frequency / local retention / Drive retention = **POLICY VALUE PENDING APPROVAL** (`backup-restore.md`). CEO/owner must approve numbers or written waiver of recommended practice. Do not invent values.                                                        |
| [ ] Production artifact packaged                 | **PENDING**                                                              | OPS-02 (2026-08-15): this build host **0** codesign identities; `CSC_*`/`APPLE_*` unset. Local `release/mac-arm64/Nexora.app` = **Signature=adhoc**, TeamIdentifier unset, legacy name — TRAINING/QA only. Live requires signed/notarized build from `24966ba`. |
| [ ] Windows artifact signed if Windows pilot     | **NOT APPLICABLE** until Windows café chosen · else **PENDING** (WIN-01) |                                                                                                                                                                                                                                                                 |
| [ ] Linux keyring verified if Linux pilot        | **NOT APPLICABLE** until Linux café chosen · else **PENDING**            |                                                                                                                                                                                                                                                                 |
| [ ] Real printer verified if printer is required | **PENDING** / **NOT APPLICABLE** if printer not required                 | DR: printers list empty — hardware not verified                                                                                                                                                                                                                 |
| [ ] KDS verified if KDS is required              | **PENDING** / **NOT APPLICABLE** if KDS not required                     | DR: port listen only; kitchen display UX not café-verified                                                                                                                                                                                                      |
| [ ] Fresh installation verified                  | **PENDING**                                                              | Engineering smoke historically PASS (isolated userdata). Café-machine install of **signed** RC still required.                                                                                                                                                  |
| [ ] Recovery verified                            | **PENDING**                                                              | Engineering REC-01 historically PASS on TRAINING binary. Café owner re-brief + signed-RC drill still required.                                                                                                                                                  |
| [ ] Financial verification verified              | **PENDING**                                                              | Engineering FIN-01 continuity historically PASS post-restore. Café re-confirm on signed RC still required.                                                                                                                                                      |
| [ ] Incident escalation understood               | **PENDING**                                                              | Owner/manager brief using `incident-response.md` + `pilot-incident-log.md`                                                                                                                                                                                      |
| [ ] Owner/manager trained                        | **PENDING**                                                              | Walkthrough: `pilot-runbook.md` + floor demos on `pilot-staff-training-checklist.md`                                                                                                                                                                            |
| [ ] CEO/CTO approval                             | **PENDING**                                                              | Sign below                                                                                                                                                                                                                                                      |

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
