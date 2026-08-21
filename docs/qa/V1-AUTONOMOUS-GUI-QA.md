# OPERAVIA V1 — AUTONOMOUS GUI QA REPORT

**Task ID:** QA-V1-AUTONOMOUS-GUI  
**Started:** 2026-08-21  
**Package:** 3.0.5  
**Branch:** `restaurant-vertical` (ahead of origin; local UI work uncommitted)  
**Driver:** browse CLI (`--local --headed`) against e2e-seeded API on :3001  
**Loop:** Discover → Evidence → Classify → Prioritize → Fix → Retest → Regression  
**Fix policy:** Discovery pass first; no opportunistic UI rewrites mid-discovery.

## Executive Verdict

_PENDING — discovery in progress_

## Product Readiness

_PENDING_

## Phase 0 — Baseline

| Item                   | Value                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Git branch             | `restaurant-vertical`                                                               |
| Recent commits         | `f2cd035` recipe-linked waste; food-cost; PRC-DRAFT                                 |
| App version            | 3.0.5                                                                               |
| Schema tip (product)   | v89                                                                                 |
| QA environment         | Isolated e2e temp SQLite via `docs/qa/evidence/gui/v1-autonomous/qa-e2e-server.cjs` |
| Credentials            | `*@flo.local` / `E2ePass123!` for owner, manager, cashier, waiter, chef             |
| Roles (code authority) | `owner`, `manager`, `cashier`, `waiter`, `chef`                                     |
| Prior GUI QA           | `docs/qa/evidence/gui/full/SESSION-FULL.md` (2026-08-15) — do not overwrite         |
| Evidence dir           | `docs/qa/evidence/gui/v1-autonomous/`                                               |

### Safety

- Local / test data only (temp e2e DB).
- No production DB (`flo.db` not used for this run).
- No real payments, WhatsApp, SMS, email.
- Manual cash tender only.

### Known prior defects to re-verify

| ID                | Summary                                           | Prior severity |
| ----------------- | ------------------------------------------------- | -------------- |
| GUI-0001          | `/kds/` hard deeplink `Cannot GET`                | P2             |
| GUI-0002          | Checkout total ฿0.00                              | P1             |
| GUI-0003          | Waiter/Chef can open POS UI                       | P1             |
| Landing/nav drift | RBAC matrix vs `getLandingPageForRole` / chef→KDS | Doc            |

---

## Coverage

| Area                 |      Coverage |
| -------------------- | ------------: |
| Screens              |       PENDING |
| Buttons              |       PENDING |
| Tabs                 |       PENDING |
| Forms                |       PENDING |
| Dialogs              |       PENDING |
| Roles                | 0/5 exercised |
| Workflows            |          0/11 |
| Responsive viewports |       PENDING |
| Accessibility        |       PENDING |

## Role Results

| Role    | Login   | Core Tasks | RBAC | UX  | Result |
| ------- | ------- | ---------- | ---- | --- | ------ |
| owner   | PENDING |            |      |     |        |
| manager | PENDING |            |      |     |        |
| cashier | PENDING |            |      |     |        |
| waiter  | PENDING |            |      |     |        |
| chef    | PENDING |            |      |     |        |

## P0 / P1 / P2 / P3 / P4

See `docs/qa/V1-GUI-BUGS.md`.

## UX Findings

See `docs/qa/V1-UX-FEEDBACK.md`.

## Workflow Results

See `docs/qa/V1-WORKFLOW-RESULTS.md`.

## Role Matrix

See `docs/qa/V1-ROLE-GUI-MATRIX.md`.

## Fixed During QA

| Bug | Fix                              | Verification |
| --- | -------------------------------- | ------------ |
| —   | Discovery only until prioritized | —            |

## Remaining Issues / Production Blockers / Recommendation

_PENDING after discovery + prioritized fix loop_
