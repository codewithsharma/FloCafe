# Operavia — Pilot Operations Readiness Report

**Date:** 2026-08-14  
**Branch:** `modular-verticles`  
**HEAD:** `0200cae` — `fix: enforce H1 409, FIN-02 reporting, and chef cancel PIN`  
**Schema:** v79  
**Scope:** Close/verify **pilot operations** gates only. No Phase 4.16. No feature development. ADR-014 remains Proposed.

---

## Software (verified this session)

| Check                                   | Result                                                                 | Evidence                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests (default `npm test`)              | **PASS**                                                               | Exit 0 (~172s)                                                                                                                                                                                                          |
| H1 inventory-boundary (paid cancel 409) | **PASS**                                                               | `npm run test:inventory-boundary`                                                                                                                                                                                       |
| H2 FIN-02 reporting                     | **PASS**                                                               | `npm run test:financial-reporting` (34/34)                                                                                                                                                                              |
| H3 chef cancel PIN                      | **PASS**                                                               | `npm run test:orders-authz`                                                                                                                                                                                             |
| Backend build                           | **PASS**                                                               | `npm run build`                                                                                                                                                                                                         |
| Frontend build                          | **PASS**                                                               | `npm run build:frontend`                                                                                                                                                                                                |
| Lint                                    | **PASS**                                                               | 0 errors (842 pre-existing `any` warnings); frontend eslint clean after deps                                                                                                                                            |
| Schema                                  | **v75**                                                                | `main/db.ts` migration `version: 75`                                                                                                                                                                                    |
| Money path                              | **Stable**                                                             | No money-write changes in this ops pass; H1/H2/H3 already on HEAD                                                                                                                                                       |
| Restaurant isolation                    | **PASS (prior suites; not re-run this session in default `npm test`)** | Café must keep unset/`restaurant`                                                                                                                                                                                       |
| Retail isolation                        | **PASS (in default `npm test` via module-registry/security chain)**    | KDS/Server App module-gated                                                                                                                                                                                             |
| Working tree at HEAD before docs        | **Was clean**                                                          | Doc/`.ai` updates from this ops pass are intentional. **Additional unrelated dirty files** also present now (`main/`, `package.json`, branding docs, etc.) — do **not** ship RC until release tree is intentional/clean |
| Deterministic artifact identity         | **PARTIAL**                                                            | `package.json` **3.0.5** already tagged at `241d6ca` — **bump** before RC of `0200cae`                                                                                                                                  |
| Signed/notarized artifact               | **BLOCKED**                                                            | 0 codesign identities; env UNSET; `release/mac-arm64/Nexora.app` = **Signature=adhoc** (TRAINING/QA)                                                                                                                    |

---

## Operational Gates

| Gate                                          | Status                                                  | Evidence                                                                                                                                                | Owner                   | Required Action                                                                                        |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **A. Signed / notarized production artifact** | **BLOCKED**                                             | `package.json` mac identity + notarize configured; CI `release.yml` fail-closed on secrets; this host: **0** identities; env UNSET; no RC for `0200cae` | CTO / Release Engineer  | Bump version (e.g. 3.0.6); tag; sign+notarize via CI or Developer ID Mac; record on `pilot-signoff.md` |
| **B. OPS-01 staff Wi‑Fi / SSID**              | **PARTIAL**                                             | Policy in `pilot-runbook.md` / `operations.md`; site verification **PENDING** on `pilot-signoff.md`                                                     | Café owner + ops        | On-site staff SSID; prove guest cannot reach :3001–3003; attach evidence                               |
| **C. Master PIN escrow**                      | **FAIL** (human incomplete)                             | Procedure documented; sign-off gate **PENDING**; no attestation in repo                                                                                 | Café owner              | Paper/envelope escrow; confirm on sign-off; never store PIN in chat/Drive/git                          |
| **D. Numeric backup policy**                  | **PARTIAL**                                             | **POLICY VALUE PENDING APPROVAL**; Drive backup-now = owner JWT without Master PIN (**P1-12** software residual)                                        | CEO / owner             | Approve numbers or waiver; if Drive enabled, accept P1-12 risk                                         |
| **E. Café printer drill**                     | **BLOCKED** (physical)                                  | Software APIs + tests exist; café hardware **NOT VERIFIED**                                                                                             | Pilot owner             | Configure printer; test/sale/refund receipt; drawer; failure→reprint (or N/A + written waiver)         |
| **F. Café KDS drill**                         | **BLOCKED** (physical if KDS required) else **PARTIAL** | Automated listen/isolation PASS; café UX **PENDING**                                                                                                    | Pilot owner             | Order→KDS→bump on staff LAN; OPS-01 if multi-device (or N/A + waiver)                                  |
| **G. Restore drill**                          | **PARTIAL**                                             | Lab DR PASS 2026-08-13 (RTO 6.12 min) on TRAINING binary; café/signed re-drill **PENDING**; worksheet blank in repo                                     | Owner + ops             | Run `dr-drill-worksheet.md` on signed café/spare; identity-check before restore                        |
| **H. Staff training**                         | **PARTIAL**                                             | Checklist created: `pilot-staff-training-checklist.md`; execution **PENDING**                                                                           | Owner / trainer         | Train all floor roles; initial sheet                                                                   |
| **I. Staff sign-off**                         | **FAIL** (incomplete)                                   | `pilot-signoff.md` CTO/CEO/pilot signatures **PENDING**                                                                                                 | CTO / CEO / Pilot owner | Complete gates + signatures                                                                            |
| **J. Pilot incident/recovery procedure**      | **PARTIAL**                                             | Docs READY (`incident-response.md`, REC-01 runbook); café brief **PENDING**; incident register empty                                                    | Owner / manager         | Walk S1–S4 + STOP RULE; keep log outside POS DB                                                        |

---

## Training

- **Checklist path:** `docs/13-operations/pilot-staff-training-checklist.md`
- Covers: SALE, REFUND (Restaurant money-only), CANCEL/H1, SHIFT, DAY CLOSE, KDS, 86, LOW STOCK, RECOVERY, CHEF/H3
- **Unresolved:** No staff have signed the sheet yet; OPS-05 remains open until demonstrated

---

## Backup / Restore

| Item                        | Status                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Create backup               | Software READY                                                                                    |
| Location known              | `{userData}/backups/` `flo-backup-….db`                                                           |
| Restore documented          | READY (`backup-restore.md`, runbook §12)                                                          |
| Silent wrong-DB overwrite   | Product rejects corrupt; **does not** block wrong valid café file — human identity check required |
| Post-restore verification   | Documented                                                                                        |
| Café / signed restore drill | **HUMAN REQUIRED**                                                                                |

---

## Hardware

| Device      | Status                                                   |
| ----------- | -------------------------------------------------------- |
| Printer     | Software READY · **PHYSICAL TEST REQUIRED**              |
| KDS         | Software READY · **PHYSICAL TEST REQUIRED** (café UX)    |
| Cash drawer | Software READY (Phase 3.6F) · **PHYSICAL TEST REQUIRED** |

---

## Pilot Runbook

| Document                                               | Action this session                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `docs/13-operations/pilot-runbook.md`                  | **Updated** — sections 1–16 ops sequence                                                 |
| `docs/13-operations/pilot-staff-training-checklist.md` | **Created**                                                                              |
| `docs/13-operations/pilot-success-criteria.md`         | **Created**                                                                              |
| `docs/13-operations/pilot-signoff.md`                  | Existing; still PENDING human gates (identity still lists 3.0.5 — update when RC tagged) |

---

## Remaining Blockers

### SOFTWARE

- **P1-06** — Unopenable SQLite may still quit instead of recovery UI (not implemented; human decision to authorize next slice)
- **P1-05** — Discount on settled bill (open; not this pass)
- **P1-12** — Drive backup-now without Master PIN (open; not this pass)
- **Version hygiene** — Do not ship `0200cae` as retagged `3.0.5` (`241d6ca`); bump for RC
- Composition fetch fail-open = **P2** (not pilot P0 after Retail process isolation)
- **Working tree hygiene** — Unrelated dirty production/docs files beyond this ops pack must be reviewed before tagging an RC (not introduced as money-path work in this pass)

### HUMAN DECISION

- Approve or waive **numeric backup policy**
- Produce/authorize **signed+notarized** RC (credentials / CI secrets)
- Complete **Master PIN escrow** attestation
- Complete **pilot-signoff** signatures (CTO / CEO / pilot owner)
- ADR-014 remains **Proposed** (intentionally not implemented)
- Whether Retail store pilot proceeds under same conditions with `ACTIVE_VERTICAL_ID=retail`

### PHYSICAL/OPS

- On-site **OPS-01** SSID / guest isolation
- Café **printer + drawer + KDS** drills
- Café **restore drill** on signed artifact
- **Staff training** demos + sign-off
- Incident escalation brief

---

## Pilot Verdict

| Vertical       | Verdict                                            | Conditions                                                                                                                                                                 |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Restaurant** | **PILOT READY WITH CONDITIONS**                    | Composite **81/100** (not software-only). Engineering checks green at `0200cae`. **Live café blocked** until A–J close or written waiver.                                  |
| **Retail**     | **PILOT READY WITH CONDITIONS** (stricter ops gap) | Isolation P0s closed (**74/100**). Same A–J; plus `ACTIVE_VERTICAL_ID=retail`, Retail appendix/training, and no `test:production-retail` npm script yet (accept or waive). |

**Independent review:** APPROVE WITH NITS ([Review](af515173-61fe-4c4a-8642-53ec41313bf8)).

**Next action:** HUMAN/OPS execution of remaining gates. **No Phase 4.16. No push. No feature work.**
