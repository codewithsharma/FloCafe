# Project Coordinator — Documentation Delta Audit (v2)

**Re-audit date:** 2026-08-15
**Baseline:** `audit/05_PROJECT_COORDINATOR_AUDIT.md` (2026-08-14)

---

## 1. Previous Documentation Findings

| Score                                       | Previous                                   |
| ------------------------------------------- | ------------------------------------------ |
| Repository structure                        | 8/10                                       |
| Documentation quality (overall verdict dim) | 7/10                                       |
| Handoff readiness                           | 7/10                                       |
| Feature list                                | **1/5** (lies: refunds/shifts “not built”) |
| Verticals                                   | **2/5** (Retail “planned”)                 |
| local-setup                                 | **3/5** (schema 66; false `.env` claim)    |
| Env guide                                   | **3/5** (no `ACTIVE_VERTICAL_ID`)          |
| README                                      | 4/5 (“Get FloCafe”, FloPOS links)          |

Key gap: **documentation truth drift** was the #1 handoff risk.

---

## 2. The Documentation Fix Check

| File              | Previous Problem                | Fixed?     | How?                                                                                                              | New Problems?                                                                             |
| ----------------- | ------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.env.example`    | Missing `ACTIVE_VERTICAL_ID`    | ✅ FIXED   | Documented with commented example (`ACTIVE_VERTICAL_ID=restaurant`)                                               | None material                                                                             |
| `feature-list.md` | Claims refunds/shifts not built | ✅ FIXED   | Statuses rebuilt Built/Partial/Stub/Frozen; refunds/shifts/drawer/accounting correctly Built                      | Header still **schema v75** while code is **v78**                                         |
| `verticals.md`    | Says Retail is “planned”        | ✅ FIXED   | Path is `docs/00-product/verticals.md` (not `07-technical/`); Retail = CURRENT production composition, partial UX | Other verticals still PLANNED (accurate)                                                  |
| `local-setup.md`  | Schema v66; false `.env` claim  | ✅ FIXED   | Schema **75**; `.env.example` copy instructions; branch `main`                                                    | Still says schema **75** / migration `p2_8…` — **stale vs v78**                           |
| `README.md`       | “Get FloCafe”, FloPOS link      | 🔨 PARTIAL | Primary brand **Operavia**; “Get Operavia”; naming note explains FloCafe/flo*                                     | FloPOS Reddit badges remain (labeled community); FloCafe in clone URLs (acceptable infra) |
| `CHANGELOG.md`    | Version alignment               | 🔨 PARTIAL | `[Unreleased]` + `[3.0.5] - 2026-08-12`                                                                           | Title uses typo **“Opervia”**; Unreleased not version-bumped for R1–R4                    |

---

## 3. DOC-TRUTH-AUDIT.md Check

**Exists:** `docs/00-product/DOC-TRUTH-AUDIT.md` (schema at audit: **v75**, date 2026-08-14).

| Claimed fix                                  | Verified in target file?                   | Notes                                                                                                     |
| -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `.env.example` ACTIVE_VERTICAL_ID            | ✅ Yes                                     | Present                                                                                                   |
| `feature-list.md` Built statuses             | ✅ Yes                                     | Refunds/shifts Built                                                                                      |
| `verticals.md` Retail CURRENT                | ✅ Yes                                     | `docs/00-product/verticals.md`                                                                            |
| `local-setup.md` schema 75                   | ✅ Yes (as of truth audit)                 | Now **behind** code v78                                                                                   |
| `README.md` Operavia naming                  | ✅ Yes                                     | Get Operavia                                                                                              |
| Cash drawer “stays NOT BUILT” in audit prose | ❌ **Stale claim inside DOC-TRUTH itself** | Current `feature-list.md` marks drawer **[BUILT]** (3.6F) — DOC-TRUTH diff summary not updated after 3.6F |

**Flag:** DOC-TRUTH-AUDIT was run and mostly honest for **v75**, but it is already a **historical** truth snapshot. It does not cover v76–v78 / R2–R4.

---

## 4. Remaining Documentation Lies

Grep-style hits classified:

### Acceptable (technical / continuity identifiers)

| Hit                                                  | Classification                                         |
| ---------------------------------------------------- | ------------------------------------------------------ |
| README GitHub `FloCafe` clone/org URLs               | Acceptable repo name                                   |
| README `flocafe` Snap/AppImage / executableName note | Acceptable packaging continuity                        |
| README FloPOS Reddit + naming note                   | Acceptable community legacy **if** naming note present |
| Historical `docs/15-*` audits saying FloCafe/Nexora  | Acceptable historical                                  |
| OPS-02 `Nexora.app` TRAINING artifact reference      | Acceptable evidence label                              |

### Lies / stale claims (wrong for a current reader)

| Hit                                                                                            | Classification                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `docs/00-product/feature-list.md` “schema **v75**” / last-verified 2026-08-14                  | **Lie-by-staleness** — code is **v78**            |
| `docs/08-development/local-setup.md` Schema version **75** / `p2_8_inventory_movements_ledger` | **Lie-by-staleness** — latest migration is R4 v78 |
| `docs/03-architecture/database-architecture.md` Schema version **66**                          | **Lie**                                           |
| `docs/04-technology/tech-stack.md` Schema version **66**                                       | **Lie**                                           |
| `docs/06-database/database-schema.md` framing around v71-era tables as current picture         | **Stale**                                         |
| `CHANGELOG.md` title **Opervia**                                                               | **Typo / brand error**                            |
| `.ai/tasks.md` still open “Analytics/accounting export”                                        | **Tracking lie** — Phase 4.4 shipped              |
| STRATEGY P3 “accounting export” deferred language vs Built feature-list                        | **Internal contradiction**                        |
| DOC-TRUTH prose “Cash drawer stays NOT BUILT”                                                  | **Stale vs feature-list/code**                    |

`coming soon` / `not yet built` / `PLANNED`: mostly intentional roadmap language (Grocery/Salon, Frozen items). Stale TARGET sections in old architecture docs that still list shifts/audit as PLANNED remain **lies**.

---

## 5. New Documentation Problems

| Problem                                                                   | Evidence                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Truth fixed to v75 then schema raced to v78 in ≤1 day                     | feature-list + local-setup headers                      |
| R0–R3 production docs added (good) without bumping living schema SoT docs | `.ai/context.md` correctly says v78; product docs don’t |
| DOC-TRUTH-AUDIT not re-run after 3.6F / R-waves                           | Internal cash-drawer inconsistency                      |
| Path in first audit (`docs/07-technical/verticals.md`) never existed      | Canonical is `docs/00-product/verticals.md`             |
| Massive ops doc surface (OPS-01/02) raises SoT discovery cost again       | Many overlapping readiness docs                         |

---

## 6. Coordinator Score Update

| Dimension             | Previous                  | Current | Change | Reason                                                   |
| --------------------- | ------------------------- | ------- | ------ | -------------------------------------------------------- |
| Repository structure  | 8/10                      | 8/10    | →      | Still strong layout; docs sprawl unchanged in nature     |
| Documentation quality | 7/10                      | 7/10    | →      | Big truth win, then immediate schema re-drift → net flat |
| Onboarding readiness  | 6/10 (implied weak setup) | 7/10    | ↑      | local-setup + `.env.example` usable for café default     |
| Handoff readiness     | 7/10                      | 7/10    | →      | OPS packs help; version truth lag hurts field staff      |

---

## 7. Coordinator Delta Verdict

Docs are **more truthful about features** than in the first audit (refunds, shifts, Retail composition, drawer, env vertical). They are **not fully truthful about schema currency**. The remaining lies are mostly version drift (v66 leftovers + v75 living docs vs v78 code) plus CHANGELOG brand typo. Field staff will no longer promise “refunds aren’t built,” but they may still ship onboarding docs that understate the database they install.
