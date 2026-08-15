# OPERAVIA Restaurant — Exhaustive QA Test Plan

| Field                    | Value                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Product**              | OPERAVIA Restaurant (repo legacy: FloCafe / `flo-desktop`)                                                               |
| **Engagement**           | Exhaustive QA audit — Existing + Hardening only                                                                          |
| **Plan date**            | 2026-08-15                                                                                                               |
| **App version**          | 3.0.5                                                                                                                    |
| **Schema tip (context)** | v86                                                                                                                      |
| **Capability source**    | `docs/00-product/capability-matrix.md`                                                                                   |
| **Evidence root**        | `docs/qa/evidence/`                                                                                                      |
| **Companion docs**       | `FEATURE-INVENTORY.md`, `RBAC-MATRIX.md`, `API-COVERAGE.md`, `GUI-COVERAGE.md`, `BUG-REPORT.md`, `COMPLETE-QA-REPORT.md` |

---

## 1. Objective

Determine, with executable evidence:

> Does every **implemented** Restaurant feature work correctly for every applicable user role, through GUI, API, database, and end-to-end workflows?

This plan does **not** authorize new product features, Planned/Later/Frozen work, or requirement changes.

---

## 2. Scope

### In scope

| Status (capability matrix) | Treatment                                                            |
| -------------------------- | -------------------------------------------------------------------- |
| **Existing**               | Must inventory, test, and evidence                                   |
| **Hardening**              | Prefer / deepen; must regression-test (H1–H4, authz, money, offline) |

Restaurant vertical only (`ACTIVE_VERTICAL_ID` unset → `restaurant`).

### Out of scope (do not treat as current requirements)

| Status      | Examples                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------ |
| **Planned** | Unshipped matrix rows not yet authorized                                                         |
| **Later**   | Advanced BI warehouse, deep workforce OS expansions                                              |
| **Frozen**  | Payment gateways, online payment, multi-location, payroll, aggregators, AI, terminals as product |

Retail vertical / `retail-test` synthetic composition is out of this Restaurant engagement unless needed to prove Restaurant isolation.

### Honesty gate (read first)

**COMPLETE QA** requires full **manual GUI** coverage across **all roles**, button/action execution, and live offline drills. An automation pass (`npm test`, focused suites, even `test:e2e`) that is green is **necessary but not sufficient**. After automation, QA may still be:

> **QA INCOMPLETE — BLOCKED BY** incomplete manual GUI / role matrix / offline live drill / unsigned RC / missing evidence.

Do not declare **COMPLETE QA** until Phase 26 criteria are met.

---

## 3. Roles under test

Roles discovered in product RBAC (must all be exercised allow **and** deny):

| Role        | Typical money / ops sensitivity                                      |
| ----------- | -------------------------------------------------------------------- |
| **owner**   | Full settings, restore, day-close, staff, finance                    |
| **manager** | Ops + money overrides (PIN), refunds, day-close                      |
| **cashier** | Payments, shift-gated cash, limited settings                         |
| **waiter**  | Orders / tables; must not day-close / restore / refund without authz |
| **chef**    | KDS / kitchen; must not take payment / refund                        |

PIN / Master PIN / manager override: owner/manager only where product rules require.

Document matrix in `docs/qa/RBAC-MATRIX.md`. Automated baselines:

- `npm run test:staff-authz`
- `npm run test:orders-authz`
- `npm run test:authz-phase3`
- `npm run test:h3` (RBAC hardening)

---

## 4. Environments

| Environment              | Purpose                                        | Notes                                           |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| **Dev / API harness**    | `node tests/run-electron-node-test.cjs` suites | Default for `test:h*`, `test:r*`, authz         |
| **Electron desktop**     | `npm run dev` or packaged app                  | Manual GUI; isolated `--user-data-dir` required |
| **Frontend browser**     | `npm run dev:frontend` / static `frontend-out` | Playwright + exploratory                        |
| **KDS**                  | Port 3002 (`KDS_PORT`)                         | Kitchen OS / offline recovery                   |
| **QA isolated userdata** | Separate from developer profile                | Never touch live café DBs                       |

**Record in evidence:** OS, arch, Node (≥22.12), npm, git HEAD, dirty status, date — e.g. `docs/qa/evidence/environment.log`.

**Artifact class:** Training / QA build ≠ signed/notarized production RC. Live go-live remains **NO-GO** without Gate 1 (signed RC + OPS-02).

---

## 5. Risk-based priority

Execute and gate in this order. Lower-risk areas do not unblock P0 failures.

| Priority | Domain                                           | Why first                                             | Primary suites / methods                                                                        |
| -------- | ------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **P0**   | Money path                                       | Tender, refunds, double-pay, day-close, Z             | `test:h1`, `test:r1`, `test:r15`, `test:refunds`, `test:issue-214*`, integration payment suites |
| **P0**   | Auth / session                                   | Login, JWT, Master PIN, logout                        | `test:security`, `test:phase2`, `test:master-pin`, `test:first-run`                             |
| **P0**   | RBAC                                             | Role allow/deny GUI+API                               | `test:h3`, `test:staff-authz`, `test:orders-authz`, `test:authz-phase3`                         |
| **P0**   | Offline / recovery                               | KDS offline, restore conflict, corrupt DB fail-closed | `test:h2`, `test:h4`, `test:r14`, `test:backup`, `test:rec-01`                                  |
| **P1**   | POS / floor / kitchen OS                         | Tables, held orders, KDS routing                      | `test:r2`, `test:r3`, `test:held-orders`, KDS suites                                            |
| **P1**   | Inventory / BOM / purchasing                     | Stock, recipes, PO                                    | `test:r4`, `test:r5`, `test:r6`, inventory suites                                               |
| **P2**   | CRM / staff / coupons / QR                       | Customer 360, roster, promos                          | `test:r7`, `test:r8`, `test:r10`, `test:r11`                                                    |
| **P2**   | Finance reports / expenses / voids / print queue | Ops reporting                                         | `test:r9`–`test:r9.6`, `test:r12`, `test:r13`                                                   |
| **P3**   | UX / responsive / a11y polish                    | Non-blocking                                          | Manual + `test:flo-*` contracts                                                                 |
| **P3**   | Packaging / signed RC                            | Release engineering                                   | Build evidence; human Gate 1                                                                    |

P0 failures → engagement **NO-GO** until fixed or explicitly waived with product decision.

---

## 6. Test types

| Type                            | Method                                 | Commands / practice                                           | Replaces manual?         |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| **API / integration automated** | Electron-node + ts-node harnesses      | See suite catalog §8                                          | No                       |
| **GUI manual**                  | Exploratory + scripted per screen/role | Checklists in `GUI-COVERAGE.md`                               | Required for COMPLETE QA |
| **E2E Playwright**              | Chromium against built frontend        | `npm run test:e2e`                                            | No — complements manual  |
| **Static / build**              | Lint, `tsc`, frontend export           | `npm run lint`, `npm run build`, `npm run build:frontend`     | No                       |
| **DB / migration**              | Schema health, upgrade path            | `test:schema-health`, `test:upgrade-path`, `npm run audit:db` | Partial                  |

---

## 7. Entry and exit criteria

### Entry (start Phase 6+ execution)

- [ ] Phase 0–1 inventory drafted (`FEATURE-INVENTORY.md`) — Existing + Hardening only
- [ ] Roles confirmed in code (`RBAC-MATRIX.md` started)
- [ ] Node ≥ 22.12; clean ports 3001/3002/3003 as needed
- [ ] Isolated userdata path chosen
- [ ] Evidence directory writable: `docs/qa/evidence/`
- [ ] No requirement to test Frozen/Later as must-pass

### Exit — Automation pass (partial)

- [ ] P0 suites green with logs under `docs/qa/evidence/`
- [ ] `npm run build` (+ frontend build if GUI/e2e claimed)
- [ ] Failures documented in `BUG-REPORT.md` (none silently skipped)
- [ ] Explicit statement: **not** COMPLETE QA if manual/role gaps remain

### Exit — COMPLETE QA (Phase 26)

All of:

- Inventory complete; every Existing+Hardening feature tested or BLOCKED with reason
- Every important screen + important actions executed (not merely rendered)
- Every role allow/deny exercised (GUI + API)
- Critical APIs + DB integrity verified for money/auth/offline paths
- Critical E2E workflows + offline workflows executed
- Automated suites executed; GUI (manual + Playwright where applicable) executed
- Build succeeded; regression after any fix; evidence collected; blockers listed

If any item missing → **QA INCOMPLETE — BLOCKED BY …** (never invent PASS).

---

## 8. Suite catalog (package.json)

### 8.1 Hardening (P0)

| Script            | Focus                        |
| ----------------- | ---------------------------- |
| `npm run test:h1` | POS transaction integrity    |
| `npm run test:h2` | KDS offline recovery         |
| `npm run test:h3` | Permissions / RBAC hardening |
| `npm run test:h4` | Restore conflict hardening   |

### 8.2 Restaurant waves R1–R15

| Script              | Focus                                                 |
| ------------------- | ----------------------------------------------------- |
| `npm run test:r1`   | POS core completion                                   |
| `npm run test:r2`   | Floor operations                                      |
| `npm run test:r3`   | Kitchen OS                                            |
| `npm run test:r4`   | Inventory OS                                          |
| `npm run test:r4.1` | Foundation stabilization                              |
| `npm run test:r5`   | BOM / recipes / food cost                             |
| `npm run test:r6`   | Purchasing                                            |
| `npm run test:r7`   | Customer CRM                                          |
| `npm run test:r8`   | Staff workforce                                       |
| `npm run test:r9`   | Expenses                                              |
| `npm run test:r9.2` | Audit trail                                           |
| `npm run test:r9.3` | Tax export                                            |
| `npm run test:r9.4` | Day-close / Z polish                                  |
| `npm run test:r9.5` | Ops finance reports                                   |
| `npm run test:r9.6` | Food-cost report                                      |
| `npm run test:r10`  | Online / QR ordering                                  |
| `npm run test:r11`  | Coupons                                               |
| `npm run test:r12`  | Void / cancel report                                  |
| `npm run test:r13`  | Print queue                                           |
| `npm run test:r14`  | Corrupt DB fail-closed                                |
| `npm run test:r15`  | Simulation S1 normal sale (open→pay→day-close→backup) |

R16 production release is **human-blocked** (signed RC / OPS-02) — track as release gate, not a green suite name.

### 8.3 Authz family (`test:authz-*` and related)

| Script                      | Focus                      |
| --------------------------- | -------------------------- |
| `npm run test:authz-phase3` | Authz matrix phase 3       |
| `npm run test:staff-authz`  | Staff route authorization  |
| `npm run test:orders-authz` | Orders route authorization |

### 8.4 Default / security / money baselines

| Script                  | Focus                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm test`              | Full default backend suite (includes smoke, KDS, cors, security→h1–h4/r1, authz, backup, tax, integrations, …) |
| `npm run test:smoke`    | Smoke                                                                                                          |
| `npm run test:security` | Security hardening bundle (includes h1–h4, r1, refunds, Electron sandbox/IPC, flo-* contracts, …)              |
| `npm run test:e2e`      | `build` + `build:frontend` + Playwright Chromium (`frontend` playwright tests)                                 |

### 8.5 Supporting commands for this engagement

| Script                                                                       | When                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `npm run lint` / `npm run lint:backend`                                      | Phase 16                                               |
| `npm run build` / `npm run build:frontend`                                   | Phase 16 / before `test:e2e`                           |
| `npm run audit:db`                                                           | Phase 13                                               |
| `npm run test:backup`, `test:upgrade-path`, `test:schema-health`             | Integrity / recovery                                   |
| `npm run test:kds-integration`, `test:kds-contract`, `test:kds-bind-degrade` | Kitchen / offline                                      |
| `npm run validate`                                                           | Optional full gate (lint + unit + `npm test` + builds) |

Evidence naming convention: `docs/qa/evidence/<suite-or-phase>.log` (examples already present: `h1.log`, `h2.log`, `h3.log`, `r1.log`, `r15.log`, `authz-phase3.log`, `staff-authz.log`, `orders-authz.log`, `build.log`, `environment.log`).

---

## 9. Phases 0–26 (engagement map)

| Phase  | Name                          | Deliverable / activity                                                            | Primary evidence / suites                                                                                                                                                    |
| ------ | ----------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | Project discovery             | Repo structure, configs, matrix, R-docs, existing tests                           | Notes → inventory draft                                                                                                                                                      |
| **1**  | Feature inventory             | Every Existing+Hardening feature                                                  | `docs/qa/FEATURE-INVENTORY.md`                                                                                                                                               |
| **2**  | User role discovery           | Roles, permissions, guards                                                        | `docs/qa/RBAC-MATRIX.md`                                                                                                                                                     |
| **3**  | Button-by-button testing      | Screen × control × role                                                           | Rows in `GUI-COVERAGE.md`                                                                                                                                                    |
| **4**  | CRUD exhaustive               | Valid/invalid/boundary for entities                                               | API + GUI + DB checks                                                                                                                                                        |
| **5**  | Form validation               | Client + server + constraint                                                      | Negative cases logged                                                                                                                                                        |
| **6**  | Automated testing             | Discover & run package.json suites                                                | P0 first: `test:h1`–`test:h4`, `test:authz-phase3`, `test:staff-authz`, `test:orders-authz`, `test:r1`, `test:r15`; then `test:r2`–`test:r14`; `npm test` as capacity allows |
| **7**  | GUI automation                | Playwright major flows                                                            | `npm run test:e2e` → `docs/qa/evidence/e2e*.log`                                                                                                                             |
| **8**  | Manual GUI testing            | Every implemented screen, all roles                                               | Screenshots / notes under `evidence/`                                                                                                                                        |
| **9**  | E2E business workflows        | Open restaurant, dine-in, QR, inventory, procurement, finance, CRM, offline, RBAC | Manual + `test:r15` + integrations                                                                                                                                           |
| **10** | Negative testing              | Auth fail, double pay, bad coupon, stale IDs, rapid clicks                        | Bugs + suite failures                                                                                                                                                        |
| **11** | RBAC security                 | Allow+deny per role × protected feature; URL + API                                | `test:h3`, authz suites + manual                                                                                                                                             |
| **12** | API testing                   | Critical endpoints executed                                                       | `docs/qa/API-COVERAGE.md`                                                                                                                                                    |
| **13** | Database testing              | Migrations, FKs, orphans, GUI=API=DB                                              | `test:schema-health`, `test:upgrade-path`, `audit:db`                                                                                                                        |
| **14** | Data integrity / cross-module | Order → KDS → stock → finance → reports                                           | `test:h1`, integrations, manual spot                                                                                                                                         |
| **15** | Offline-first                 | Disconnect, act, reconnect, no duplicates                                         | `test:h2`, `test:h4`, `test:r14`, live drill                                                                                                                                 |
| **16** | Build / release               | Lint, typecheck, build, startup smoke                                             | `build.log`, `lint-backend.log`; note unsigned RC                                                                                                                            |
| **17** | Responsive                    | Desktop / laptop / tablet / mobile layouts                                        | Manual evidence                                                                                                                                                              |
| **18** | Performance / stability       | Startup, POS, KDS, reports (no prod load crush)                                   | Notes / timings                                                                                                                                                              |
| **19** | Accessibility / UX            | Keyboard, focus, labels, errors                                                   | Manual + `test:flo-phase12` contracts                                                                                                                                        |
| **20** | Test evidence                 | Screenshots, logs, traces — no secrets                                            | `docs/qa/evidence/`                                                                                                                                                          |
| **21** | Bug classification            | P0–P4 with repro                                                                  | `docs/qa/BUG-REPORT.md`                                                                                                                                                      |
| **22** | Defect fix policy             | Fix bugs/tests/config only; no features / Frozen                                  | Decision log                                                                                                                                                                 |
| **23** | Complete regression           | Re-run P0 + affected + critical manual                                            | Fresh evidence logs                                                                                                                                                          |
| **24** | Coverage requirement          | Feature / screen / role / RBAC / action / API / workflow %                        | Honest percentages                                                                                                                                                           |
| **25** | Final QA documents            | This plan + inventory + matrices + complete report                                | `docs/qa/*`                                                                                                                                                                  |
| **26** | Absolute completion criteria  | Only then say **COMPLETE QA**                                                     | Else **QA INCOMPLETE — BLOCKED BY …**                                                                                                                                        |

### Phase 9 workflow checklist (minimum)

1. Open restaurant (login → settings readiness → shifts if enabled)
2. Dine-in (table → order → addons → KDS → pay → receipt)
3. QR order (if Existing)
4. Inventory receive → consume → movement
5. Procurement PO → receive
6. Finance (tax, refund, day-close/Z, report)
7. CRM (customer on order → history)
8. Offline (disconnect → supported act → sync / restore)
9. RBAC (each role allow/deny)

---

## 10. Defect severity (Phase 21)

| Severity | Definition                                                     | Example                                          |
| -------- | -------------------------------------------------------------- | ------------------------------------------------ |
| **P0**   | Money corruption, auth bypass, unusable app, catastrophic sync | Double charge; waiter refunds; silent stock wipe |
| **P1**   | Major workflow broken                                          | Cannot close day; KDS never updates              |
| **P2**   | Important defect with workaround                               | Export fails; use API                            |
| **P3**   | Minor functional                                               | Filter edge case                                 |
| **P4**   | Cosmetic / UX                                                  | Alignment, copy                                  |

Each bug: ID, severity, module, role, environment, steps, expected, actual, evidence path, root cause, fix, regression status.

---

## 11. Defect fix policy (Phase 22)

**Allowed:** clear product bugs, broken test infra, incorrect assertions, config, deterministic QA defects, safe hardening.

**Forbidden:** new product features; implementing Later/Frozen; weakening security/validation; changing requirements to make tests pass.

Ambiguous product behavior → **REQUIRES PRODUCT DECISION** (do not “fix” by inventing policy).

---

## 12. Evidence requirements (Phase 20)

| Artifact             | Location                                                       |
| -------------------- | -------------------------------------------------------------- |
| Environment capture  | `docs/qa/evidence/environment.log`                             |
| Suite stdout/stderr  | `docs/qa/evidence/<name>.log`                                  |
| Aggregate summary    | `docs/qa/evidence/SUMMARY.txt` (and slice summaries as needed) |
| Screenshots / traces | `docs/qa/evidence/` (no tokens, PINs, customer PII, `.env`)    |
| Final report         | `docs/qa/COMPLETE-QA-REPORT.md`                                |

Claimed PASS without evidence path → treat as **NOT TESTED**.

---

## 13. Recommended execution order (this engagement)

```text
1. Phase 0–2 docs (inventory + RBAC draft)
2. P0 automated:
     test:h1 test:h2 test:h3 test:h4
     test:staff-authz test:orders-authz test:authz-phase3
     test:r1 test:r15
     (+ test:backup / test:r14 as capacity)
3. Build/lint → evidence
4. test:r2 … test:r14 (Existing/Hardening waves)
5. npm test (or validate) as time allows — do not skip P0 to run P3
6. test:e2e when frontend build is green
7. Manual GUI + all roles (Phases 3, 8, 9, 11) — required for COMPLETE
8. Phases 20–26 documents + honest coverage %
```

---

## 14. Final recommendation language

| Verdict                | When to use                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **GO**                 | COMPLETE QA criteria met; no open P0; ops gates satisfied                               |
| **GO WITH CONDITIONS** | Core money/auth/RBAC/offline proven; documented residuals; incomplete areas listed      |
| **NO-GO**              | Open P0, or Gate 1 (signed RC / site) blocking live pilot, or critical coverage missing |

Automation-only green on 2026-08-15 → at most **GO WITH CONDITIONS** or **QA INCOMPLETE**, never silent **COMPLETE QA**.

---

## 15. Related references

- Capability matrix: `docs/00-product/capability-matrix.md`
- Restaurant OS roadmap: `docs/00-product/restaurant-os-roadmap.md`
- Test strategy: `docs/09-testing/test-strategy.md`
- Authz docs: `docs/05-api/authorization.md`
- Project memory: `.ai/context.md`
