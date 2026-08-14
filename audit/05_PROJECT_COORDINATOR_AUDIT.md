# Project Coordinator Audit — Opervia / FloCafe POS

**Date:** 2026-08-14  
**Role:** Project Coordinator  
**Focus:** Documentation, organization, naming, handoff readiness

---

## 1. Repository Structure Score

**Score: 8 / 10**

| Criterion           | Finding                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Intuitive folders?  | Yes — `main/`, `frontend/`, `tests/`, `docs/`, `.ai/`, `.github/` are findable in &lt;5 minutes with `AGENTS.md` |
| Module boundaries?  | Improving — `main/modules/` + services/routes; fat files still blur boundaries                                   |
| Naming conventions? | Mostly consistent kebab domain files; brand identifiers are chaotic                                              |

**Justification:** Structure is professional and navigable. Points lost for brand/ID sprawl (`Opervia` / `flo-desktop` / `flocafe` / `Nexora`), mega-files (`db.ts`, settings page), and doc version drift that will mislead newcomers.

---

## 2. Documentation Audit

| Doc Type                    | Exists? | Quality | Notes                                                                                                      |
| --------------------------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| README.md                   | ✅      | 4/5     | Strong Opervia overview; still says “Get FloCafe”; links FloPOS                                            |
| Setup instructions          | ✅      | 3/5     | `docs/08-development/local-setup.md` **stale** (claims schema 66; says `.env.example` missing — it exists) |
| Architecture docs           | ✅      | 5/5     | Excellent Phase 2/3 gates under `docs/03-architecture/`                                                    |
| API documentation           | ✅      | 4/5     | `docs/API.md` + `docs/05-api/`                                                                             |
| Environment variables guide | ✅      | 3/5     | `.env.example` present; **missing `ACTIVE_VERTICAL_ID`**                                                   |
| Deployment guide            | ✅      | 4/5     | `docs/11-devops/deployment.md` + ops runbooks                                                              |
| Contributing guide          | ✅      | 5/5     | `CONTRIBUTING.md` — branch prefixes, Conventional Commits                                                  |
| Changelog                   | ✅      | 4/5     | Root + `docs/16-release/`                                                                                  |
| Inline code comments        | ✅      | 3/5     | Ownership markers good; few TODOs; BUG# comments in orders                                                 |
| Strategy                    | ✅      | 5/5     | `STRATEGY.md` clear KPI and freezes                                                                        |
| Agent memory                | ✅      | 5/5     | `.ai/context                                                                                               | decisions | tasks | patterns | risks` unusually strong |
| Feature list                | ✅      | 1/5     | `docs/00-product/feature-list.md` **stale** (claims refunds/shifts not built)                              |
| Verticals doc               | ✅      | 2/5     | Still says Retail PLANNED — contradicts Phase 3.3 code                                                     |

---

## 3. Onboarding Readiness

**Can a new developer be productive in 1 day?**  
**Mostly yes for build/run; no for “safe production changes” without reading `.ai/` + Phase gates.**

Missing / friction:

- Doc schema version contradictions (66 vs 74 vs 75)
- `ACTIVE_VERTICAL_ID` undocumented in `.env.example`
- Default branch story (`develop` in old setup docs vs CI on `main`)
- Electron + better-sqlite3 native rebuild quirks
- Long `npm test` chain — need focused `test:*` scripts guidance (exists in package.json but easy to miss)
- Seed/demo via setup profiles — good once found

Hardcoded / config debt: brand appIds for upgrade continuity (intentional but confusing); network mode defaults to localhost on upgrade (ops surprise for LAN cafés).

---

## 4. TODO & Technical Comment Audit

### Classic TODO/FIXME/HACK/XXX

**No meaningful `TODO`/`FIXME`/`HACK` markers in application source.** Grep false positives only (i18n “TODOS”, currency `XXX`, phone placeholders).

### Debt tracked elsewhere (treat as the real backlog)

| Comment / Item                           | File                                                      | Line / Ref | Severity                                |
| ---------------------------------------- | --------------------------------------------------------- | ---------- | --------------------------------------- |
| Phase 3.4 residuals not implemented      | `docs/03-architecture/phase-3.4-correctness-residuals.md` | plan doc   | Critical                                |
| Money REAL migration docs-only           | `.ai/tasks.md` P0.3                                       | tasks      | Critical                                |
| CSP unsafe-inline accepted               | `main/middleware/http-observability.ts`                   | 31–37      | Important                               |
| Drive backup-now without Master PIN      | `.ai/risks.md` DRV-01                                     | risks      | Important                               |
| Void×cancel over-restore                 | `.ai/risks.md` / Phase 3.4                                | risks      | Critical                                |
| BUG #N FIX comments (historical patches) | `main/routes/orders.ts`                                   | ~946+      | Important (signal of past firefighting) |
| Subscription UI stub                     | `frontend/.../settings/page.tsx`                          | ~3148 area | Minor                                   |
| Dual i18n catalogs                       | `.ai/patterns.md`                                         | patterns   | Important                               |
| feature-list / verticals doc lies        | `docs/00-product/`                                        | docs       | Critical (process)                      |

**Groups:** Critical = money/stock correctness + pilot blockers + doc lies that cause bad decisions. Important = security residuals + maintainability. Minor = polish/stubs.

---

## 5. Naming & Convention Consistency

| Area       | Consistency                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| Components | PascalCase React — consistent                                                 |
| Files      | kebab services + plural routes — mostly consistent                            |
| Types      | Mixed Flo/Opervia naming leftovers                                            |
| API routes | `/api/...` REST-ish; no public versioning prefix (acceptable for desktop)     |
| DB schema  | snake_case columns; migrations numbered via user_version                      |
| Brand      | **Inconsistent by design for upgrades** — must be documented in every handoff |

Related files: generally co-located by layer (routes/services), not always by feature package.

---

## 6. Handoff Readiness Score

**Score: 7 / 10**

Would block a new lead developer:

- Brand identity matrix (Opervia vs flo* vs Nexora AppX) unexplained in one place
- Stale product docs contradicting code
- Understanding money formulas (FIN-01, day-close cash − refunds) requires `.ai/context.md` — not obvious from UI
- Knowing which vertical env is safe for cafés
- Locating the “source of truth” among 200+ docs without `.ai/` + STRATEGY
- Mega-files (`db.ts`, `orders.ts`, settings page) as bus-factor magnets
- Pilot sign-off still **NO** for unsupervised production (`p1.6-cto-release-control-decision.md` posture)

**What helps handoff:** `.ai/` memory, ADRs, Phase gate docs, CONTRIBUTING, large test suite, ops runbooks in `docs/13-operations/`.

---

## 7. Coordinator Verdict

The project is **organized enough to scale the engineering team**, with documentation density above average for a POS startup — but it is **not organized enough to scale GTM or junior contributors unsupervised**. The #1 documentation/process gap is **truth drift**: `feature-list.md`, `verticals.md`, and `local-setup.md` still tell lies that will cause wrong roadmap and wrong onboarding. Fix documentation truth before hiring more people into the wrong map.
