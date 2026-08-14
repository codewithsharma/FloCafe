# Documentation Truth Audit

**Date:** 2026-08-14  
**Schema version at audit:** v75  
**App version at audit:** 3.0.5 (`flo-desktop`) / productName `Opervia`  
**Audited by:** Cursor AI agent

**Working-tree note:** This pass ran on a dirty tree that already contained Phase 3.3–3.4 / Retail implementation files. Source and test files were **not** modified. Stashing would have hidden the verticals being documented.

## What Was Fixed

| File                                                                     | Problem                                                                    | Fix Applied                                                                                                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.env.example`                                                           | Missing `ACTIVE_VERTICAL_ID` and other consumed env vars; FloCafe branding | Documented `ACTIVE_VERTICAL_ID` (restaurant\|retail\|retail-test), defaults, fail-closed warning; added `SERVER_APP_PORT`, `LOG_LEVEL`, `FLO_ALLOW_JWT_SECRET_ENV`; Opervia branding |
| `docs/00-product/feature-list.md`                                        | Claimed refunds/shifts/day-close/ledger/audit missing; schema v66          | Corrected statuses to Built/Partial/Stub/Frozen; schema v75; Restaurant-only notes for tables/KDS; last-verified header                                                              |
| `docs/00-product/verticals.md`                                           | Retail marked PLANNED                                                      | Retail = CURRENT production composition (partial UX); retail-test SYNTHETIC; ACTIVE_VERTICAL_ID note                                                                                 |
| `docs/08-development/local-setup.md`                                     | Schema 66; `.env.example` “missing”; branch `develop`                      | Schema 75; copy `.env.example`; branch `main`; vertical setup; verified scripts                                                                                                      |
| `README.md`                                                              | Product name FloCafe; false Bluetooth claim                                | Opervia product naming; naming note for flo\* IDs; Bluetooth corrected; shifts/refunds called out; Retail env note                                                                   |
| `CHANGELOG.md`                                                           | No Phase 3 / vertical notes; Flo Cafe title                                | `[Unreleased]` entry; Opervia title with legacy note                                                                                                                                 |
| `docs/README.md`                                                         | Schema v74                                                                 | Updated to v75                                                                                                                                                                       |
| `docs/03-architecture/architecture.md`                                   | Schema v66                                                                 | Updated to v75                                                                                                                                                                       |
| `docs/00-product/vision.md`                                              | Schema v74; Retail only PLANNED; ledger “not built”                        | v75; Retail composition exists; ledger API partial                                                                                                                                   |
| `docs/03-architecture/architecture-gap-report.md`                        | Retail PLANNED                                                             | Retail CURRENT composition; retail-test synthetic                                                                                                                                    |
| `docs/01-requirements/acceptance-criteria.md`                            | Fresh install v66; shifts as TARGET-only                                   | v75; note shifts are built                                                                                                                                                           |
| `CONTRIBUTING.md`                                                        | FloCafe as product name                                                    | Opervia product; FloCafe as repo name                                                                                                                                                |
| `STRATEGY.md`                                                            | Listed Retail under Future PLANNED only                                    | Clarified Retail composition vs other PLANNED verticals                                                                                                                              |
| `docs/00-product/problem-statement.md`                                   | Claimed no shifts/refunds                                                  | Corrected limitations; Opervia branding                                                                                                                                              |
| `docs/00-product/PRD.md` / `goals-and-objectives.md` / `target-users.md` | FloCafe CURRENT; TARGET listed built features as future                    | Aligned to Opervia + built vs planned                                                                                                                                                |
| `docs/16-release/production-readiness.md`                                | Current product Nexora POS                                                 | Opervia Restaurant                                                                                                                                                                   |
| `docs/google-drive-setup.md`                                             | FloCafe product name                                                       | Opervia                                                                                                                                                                              |
| `docs/00-product/DOC-TRUTH-AUDIT.md`                                     | (new)                                                                      | This report                                                                                                                                                                          |

## Diff summaries (per file)

```
.env.example: Added ACTIVE_VERTICAL_ID with valid values [restaurant|retail|retail-test], default note, and production warning. Added 3 other missing variables: SERVER_APP_PORT, LOG_LEVEL, FLO_ALLOW_JWT_SECRET_ENV.

feature-list.md: Corrected feature statuses. Key fixes: Refunds NOT BUILT→BUILT, Shifts NOT BUILT→BUILT, Day-close PARTIAL→BUILT, Stock ledger NOT BUILT→PARTIAL, Audit PARTIAL→BUILT, Cash drawer stays NOT BUILT, Subscription→STUB, Terminals→FROZEN, Multi-location→FROZEN. Added last-verified header (schema v75).

verticals.md: Updated Retail status from "planned" to "production composition (partial UX)". Clarified restaurant/retail/retail-test. Added ACTIVE_VERTICAL_ID note. Added last-verified header.

local-setup.md: Schema version 66→75. Removed false claim about missing .env.example. Updated branch reference develop→main. Added ACTIVE_VERTICAL_ID setup note. Verified setup/test steps against package.json scripts. Added last-verified header.

README.md: Replaced FloCafe product-name instances with Opervia. Kept FloCafe/flo* as repo/package identifiers with clarifying note. Fixed Bluetooth claim. FloPOS Reddit URL left (live community link).

CHANGELOG.md: Verified version alignment [3.0.5]. Added [Unreleased] covering vertical config / Retail composition / doc truth.

docs/README.md + architecture.md + vision.md + architecture-gap-report.md + acceptance-criteria.md + CONTRIBUTING.md + STRATEGY.md: Living docs schema/vertical/brand truth alignment only.
```

## What Was Intentionally NOT Changed

| Thing                                            | Why left as-is                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `package.json` `name`/`appId`/`executableName`   | Internal identifiers; changing breaks upgrade continuity                                  |
| flo-desktop / flocafe in technical install paths | Technical identifiers; documented as such                                                 |
| GitHub URLs `FreeOpenSourcePOS/FloCafe`          | Real repository path                                                                      |
| Reddit `r/FloPOS` links                          | Live community URL; noted as legacy community name                                        |
| Phase 3.4 residual / implementation docs         | Open or completed engineering docs — not “feature-list lies”                              |
| `.ai/` memory files                              | Dev-process memory, not user docs (prompt excluded)                                       |
| Historical `docs/15-project-management/*` audits | Snapshots of past gates (v66/v68/v69 at the time); mass-rewrite would destroy audit trail |
| `docs/11-devops/ci-cd.md` M1 gate “schema v66”   | Historical M1 gate description                                                            |
| Store listing names (Mac App Store “flo-cafe”)   | External store IDs                                                                        |

## Remaining Documentation Risks (not fixed by this prompt)

- Monetization roadmap / pricing (product decision) — Settings subscription stub still easy to misread without sales discipline
- Multi-location timeline (ADR-006 not filed)
- Card terminal / PSP plans (STRATEGY freeze)
- Historical PM plans (`master-implementation-plan.md`, `progress.md`) still cite old schema/status — need a human “archive vs living” policy
- AppX `displayName: Nexora` in package.json build block (code/config, not doc)
- Dual brand in store listings vs Opervia product name may confuse merchants until store metadata is updated

## How to Keep Docs Accurate Going Forward

1. Add `<!-- Last verified: YYYY-MM-DD, schema vXX -->` to the top of every product/feature doc
2. Add a `docs:verify` script to `package.json` that greps for known stale patterns (version numbers, “planned” statuses on built features)
3. Update `feature-list.md` and `verticals.md` at the start of every Phase gate closeout
4. Update `local-setup.md` whenever a migration bumps `user_version`
5. Treat `docs/15-project-management/` historical audits as immutable; put CURRENT truth in `00-product/` + `.ai/context.md`
