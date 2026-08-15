# RestaurantOS Complete QA Report

| Field                 | Value                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**           | OPERAVIA Restaurant (repo legacy: FloCafe / `flo-desktop`)                                                                                                                                                                                         |
| **Engagement date**   | 2026-08-15                                                                                                                                                                                                                                         |
| **App version**       | 3.0.5                                                                                                                                                                                                                                              |
| **Schema tip**        | v86                                                                                                                                                                                                                                                |
| **Commit under test** | `b996b9806d3075b852895273ca4eda2289a143a8` (+ local test-tip fixes + QA docs)                                                                                                                                                                      |
| **Evidence root**     | [`docs/qa/evidence/`](./evidence/)                                                                                                                                                                                                                 |
| **Companions**        | [`FEATURE-INVENTORY.md`](./FEATURE-INVENTORY.md), [`RBAC-MATRIX.md`](./RBAC-MATRIX.md), [`API-COVERAGE.md`](./API-COVERAGE.md), [`GUI-COVERAGE.md`](./GUI-COVERAGE.md), [`BUG-REPORT.md`](./BUG-REPORT.md), [`QA-TEST-PLAN.md`](./QA-TEST-PLAN.md) |

---

## 1. Executive Summary

**QA status:** **QA INCOMPLETE — BLOCKED BY** exhaustive button matrix, offline GUI drill, full `npm test` mega-suite, and signed RC / OPS-02. **Live multi-role GUI** advanced 2026-08-15 → see `evidence/gui/full/SESSION-FULL.md` (**GUI QA COMPLETE — PASS WITH CONDITIONS**).

**Overall result (split verdict):**

| Audience                                                        | Verdict                |
| --------------------------------------------------------------- | ---------------------- |
| **Engineering pilot validation** (automation + known residuals) | **GO WITH CONDITIONS** |
| **Live café go-live**                                           | **NO-GO**              |

**Why (one line):** Critical money / authz / offline-hardening / R-wave suites and thin Playwright GUI are green with evidence; exhaustive manual GUI, full role GUI deny paths, live offline drills, full default `npm test`, and Gate 1 (signed RC / OPS-02) are **not** done — therefore this is **not** COMPLETE QA and must not ship to a live café.

| Metric                                              |                                                                                               Value |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------: |
| Features inventoried (Existing/Hardening)           |                                                                                                 149 |
| Feature coverage (automated critical-path estimate) |                                                                                      ~62% (~93/149) |
| Screens inventoried                                 |                                                                                        35/35 (100%) |
| Screens with live GUI executed                      | Owner ~18 + prior manager ~12 + cashier/waiter/chef shells; see `evidence/gui/full/SESSION-FULL.md` |
| Button/action live coverage                         |                       Critical POS/KDS/RBAC exercised — exhaustive 217-button matrix **NOT TESTED** |
| Roles discovered                                    |                                                                                          5/5 (100%) |
| Role GUI walkthrough                                |        **5/5 logged in via GUI**; owner deep + cashier/waiter/chef RBAC; manager prior + API verify |
| RBAC (API strong / GUI weak)                        |                                                                                                ~45% |
| API endpoint automated evidence                     |                                  **109/305 PASS (35.7%), 0 FAIL** after tip-fix (`API-COVERAGE.md`) |
| P0 product bugs                                     |                                                                                                   0 |
| P1 remaining                                        |                                                                              R16 / OPS-02 live gate |
| Bugs fixed this session                             |                                                                                      2 (test infra) |
| Overall QA score                                    |                                                                                        **62 / 100** |

---

## 2. Test Environment

| Item                   | Value                                                               | Evidence                                          |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| OS                     | Darwin 25.5.0 arm64                                                 | `docs/qa/evidence/environment.log`, `SUMMARY.txt` |
| Node                   | v24.18.0                                                            | same                                              |
| npm                    | 11.16.0                                                             | same                                              |
| Browser (E2E)          | Playwright Chromium                                                 | `playwright-summary.txt`, `playwright-e2e.log`    |
| Database               | SQLite `better-sqlite3`, schema tip **v86**                         | suite tip asserts post-fix; `.ai/context.md`      |
| Application commit     | `b996b9806d3075b852895273ca4eda2289a143a8`                          | `environment.log`                                 |
| Local delta under test | schema-tip test fixes + QA docs (uncommitted relative to that HEAD) | git status / `BUG-REPORT.md`                      |
| Artifact class         | Engineering / QA harness — **not** signed/notarized production RC   | §14, §21, §25                                     |

---

## 3. Feature Coverage

| Measure                                                     |            Count / % | Notes                                                           |
| ----------------------------------------------------------- | -------------------: | --------------------------------------------------------------- |
| Inventory rows (Existing + Hardening)                       |              **149** | [`FEATURE-INVENTORY.md`](./FEATURE-INVENTORY.md)                |
| Estimated features with automated suite evidence            | **~93 / 149 (~62%)** | H1–H4, R1–R15, authz, smoke, Playwright map to critical modules |
| Features with exhaustive manual GUI+API+DB row verification |               **0%** | Per-row still treat unverified GUI as **NOT TESTED**            |
| Planned / Later / Frozen                                    |         Out of scope | Not scored as must-pass                                         |

**Honesty gate:** Inventory = 100% discovery. Execution ≠ inventory. Do **not** claim 100% feature PASS.

---

## 4. Screen Coverage

| Measure                                          |                                    Value | Evidence                                                 |
| ------------------------------------------------ | ---------------------------------------: | -------------------------------------------------------- |
| App Router `page.tsx` inventoried                |                       **35 / 35 (100%)** | [`GUI-COVERAGE.md`](./GUI-COVERAGE.md)                   |
| Live GUI executed (Playwright)                   |                        **~3 / 35 (~9%)** | KDS login, POS layout, prepaid (×2)                      |
| Live GUI executed (browse MCP, manager)          |                      **~12 / 35 (~34%)** | POS→pay→Orders→KDS→…→Settings; `evidence/gui/SESSION.md` |
| Exhaustive manual screen walkthrough (all roles) |                           **Incomplete** | Other roles / full button matrix remaining               |
| flo-* static/component contracts                 | ~20/35 (~57%) exist as **source** checks | **Not** interactive GUI                                  |

---

## 5. Button/Action Coverage

| Measure                                       |                                                                  Value |
| --------------------------------------------- | ---------------------------------------------------------------------: |
| Approximate interactive surface (static scan) |                       ~217 `<Button`, ~433 `onClick`, Settings 17 tabs |
| Live button-by-button execution (all roles)   | **Partial** (POS cart/pay + KDS bump verified; exhaustive matrix open) |
| Result                                        |                                          **Incomplete — NOT COMPLETE** |

Rendering / static inventory is **not** action PASS. See [`GUI-COVERAGE.md`](./GUI-COVERAGE.md).

---

## 6. User Role Coverage

| Role    | Discovered | API allow/deny exercised (automated) | GUI login + nav + deny walkthrough |
| ------- | :--------: | :----------------------------------: | :--------------------------------: |
| owner   |    Yes     |          Yes (authz suites)          |           **NOT TESTED**           |
| manager |    Yes     |                 Yes                  |   **PASS** (browse MCP session)    |
| cashier |    Yes     |                 Yes                  |           **NOT TESTED**           |
| waiter  |    Yes     |                 Yes                  |           **NOT TESTED**           |
| chef    |    Yes     |                 Yes                  |           **NOT TESTED**           |

| Metric            |                                                                                              Value |
| ----------------- | -------------------------------------------------------------------------------------------------: |
| Role discovery    |                                                                                   **5 / 5 (100%)** |
| API role coverage | **100% of five roles** via `test:h3`, `test:authz-phase3`, `test:staff-authz`, `test:orders-authz` |
| GUI role coverage |                                                                                    **1 / 5 (20%)** |

Matrix: [`RBAC-MATRIX.md`](./RBAC-MATRIX.md).

---

## 7. RBAC Coverage

| Layer                                                        | Result                               | Approx. coverage |
| ------------------------------------------------------------ | ------------------------------------ | ---------------: |
| API allow/deny (authz-phase3, staff-authz, orders-authz, h3) | **PASS** (67 + 36 + 17 + 33 asserts) |           Strong |
| GUI deny / direct URL / nav filter per role                  | **NOT TESTED**                       |               0% |
| Combined honest RBAC coverage                                | —                                    |         **~45%** |

Evidence: `docs/qa/evidence/authz-phase3.log`, `staff-authz.log`, `orders-authz.log`, `h3.log`.

---

## 8. Automated Test Results

### Build / lint

| Check                      | Result           | Detail                      | Evidence           |
| -------------------------- | ---------------- | --------------------------- | ------------------ |
| `npm run build`            | **PASS**         | 21s                         | `build.log`        |
| `npm run lint:backend`     | **PASS**         | 0 errors / **903** warnings | `lint-backend.log` |
| Full `npm test` mega-suite | **NOT EXECUTED** | —                           | —                  |

### Critical first wave (P0)

| Suite               |    Asserts | Result | Evidence           |
| ------------------- | ---------: | ------ | ------------------ |
| `test:h1`           |         37 | PASS   | `h1.log`           |
| `test:h2`           |         34 | PASS   | `h2.log`           |
| `test:h3`           |         33 | PASS   | `h3.log`           |
| `test:r1`           |         34 | PASS   | `r1.log`           |
| `test:r15`          |         27 | PASS   | `r15.log`          |
| `test:authz-phase3` |         67 | PASS   | `authz-phase3.log` |
| `test:staff-authz`  |         36 | PASS   | `staff-authz.log`  |
| `test:orders-authz` |         17 | PASS   | `orders-authz.log` |
| `test:smoke`        | suite PASS | PASS   | `smoke.log`        |

Tallied first-wave asserts (excl. smoke individual tally): **285** — see `SUMMARY.txt`.

### Hardening + R-wave (final green after tip fixes)

| Suite       | Asserts | Result | Evidence                             |
| ----------- | ------: | ------ | ------------------------------------ |
| `test:h4`   |      20 | PASS   | `h4.log`                             |
| `test:r2`   |      62 | PASS   | `SUMMARY-rerun.txt` / `rerun-r2.log` |
| `test:r3`   |      70 | PASS   | `SUMMARY-rerun.txt` / `rerun-r3.log` |
| `test:r4`   |      53 | PASS   | `SUMMARY-rerun2.txt`                 |
| `test:r5`   |      57 | PASS   | `SUMMARY-rerun2.txt`                 |
| `test:r6`   |      73 | PASS   | `SUMMARY-rerun2.txt`                 |
| `test:r7`   |      46 | PASS   | `SUMMARY-rerun.txt`                  |
| `test:r8`   |      57 | PASS   | `SUMMARY-rerun.txt`                  |
| `test:r9`   |      38 | PASS   | `SUMMARY-rerun.txt`                  |
| `test:r9.2` |      53 | PASS   | `SUMMARY-rerun2.txt`                 |
| `test:r9.3` |      38 | PASS   | `SUMMARY-rerun2.txt`                 |
| `test:r9.4` |      34 | PASS   | `SUMMARY-rerun2.txt`                 |
| `test:r9.5` |      21 | PASS   | `SUMMARY-rerun.txt`                  |
| `test:r9.6` |      14 | PASS   | `r9.6.log` / `SUMMARY-r2-r14.txt`    |
| `test:r10`  |      33 | PASS   | `r10.log`                            |
| `test:r11`  |      53 | PASS   | `r11.log`                            |
| `test:r12`  |      45 | PASS   | `r12.log`                            |
| `test:r13`  |      51 | PASS   | `r13.log`                            |
| `test:r14`  |       6 | PASS   | `r14.log`                            |

**Initial failures** on r2–r9.5 were **test infrastructure** (stale tip **83** vs **86**; one brittle r3 symbol) — **not** counted as open product P0. Final rerun: **ALL PASS**.

### Playwright

| Result         | Detail                                         | Evidence                                       |
| -------------- | ---------------------------------------------- | ---------------------------------------------- |
| **4 / 4 PASS** | 7.7s — kds-login, layout-integrity, prepaid ×2 | `playwright-summary.txt`, `playwright-e2e.log` |

---

## 9. GUI Test Results

| Method                                        | Result                        |
| --------------------------------------------- | ----------------------------- |
| Playwright Chromium E2E                       | **4/4 PASS** (~9% of screens) |
| Manual exhaustive GUI (all screens × actions) | **NOT TESTED (0%)**           |
| Role GUI login walkthrough (all 5 roles)      | **NOT TESTED (0%)**           |
| GUI RBAC deny / direct URL                    | **NOT TESTED**                |

**Verdict:** Thin automated GUI slice **PASS**; complete GUI QA **INCOMPLETE**.

---

## 10. API Results

| Measure                                                       |       Value | Source                                           |
| ------------------------------------------------------------- | ----------: | ------------------------------------------------ |
| Endpoints inventoried (HTTP + WS)                             |         305 | [`API-COVERAGE.md`](./API-COVERAGE.md)           |
| Critical endpoints with automated evidence (session estimate) |    **~55%** | User/session hard fact; companion matrix         |
| Full HTTP matrix row-complete PASS                            |      **No** | Many routes remain inventory-only / NOT EXECUTED |
| Authz-sensitive order/staff routes                            | Strong PASS | authz suites                                     |

**Rule:** `build` PASS ≠ endpoint PASS. Unhit routes = **NOT TESTED** / **NOT EXECUTED**.

Note: Early `API-COVERAGE.md` FAIL tallies for tables/inventory/CRM reflected **pre-fix** r2–r9.5 tip failures; final suite reruns are green — re-score individual method+path rows against final logs before claiming endpoint PASS.

---

## 11. Database Results

| Check                                                    | Result                   | Notes                                                       |
| -------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| Schema tip under test                                    | **v86**                  | Tip asserts fixed in R2–R9.5 suites                         |
| Money / ledger / day-close paths (via h1, r1, r9.4, r15) | **PASS (automated)**     | Evidence logs                                               |
| Corrupt DB fail-closed (`test:r14`)                      | **PASS** 6/6             | `r14.log`                                                   |
| Restore conflict (`test:h4`)                             | **PASS** 20/20           | `h4.log`                                                    |
| Fresh + upgrade-path dedicated deep audit this session   | Partial / suite-embedded | Full `audit:db` / upgrade-path mega not claimed as COMPLETE |
| Manual GUI=API=DB spot for every screen                  | **NOT TESTED**           | —                                                           |

---

## 12. End-to-End Results

| Workflow                                                                                            | Result                     | Evidence             |
| --------------------------------------------------------------------------------------------------- | -------------------------- | -------------------- |
| R15 S1 normal sale (open → pay → day-close → backup)                                                | **PASS (automated)** 27/27 | `r15.log`            |
| Playwright prepaid checkout / layout / KDS login                                                    | **PASS** 4/4               | `playwright-e2e.log` |
| Full Phase 9 checklist (dine-in GUI, QR live, procurement GUI, CRM GUI, offline live, all-role GUI) | **Partial / NOT TESTED**   | Manual gaps          |

---

## 13. Offline Results

| Check                                                   | Result         | Evidence                 |
| ------------------------------------------------------- | -------------- | ------------------------ |
| `test:h2` KDS offline recovery                          | **PASS** 34/34 | `h2.log`, `rerun-h2.log` |
| `test:h4` restore conflict                              | **PASS** 20/20 | `h4.log`                 |
| `test:r14` corrupt DB fail-closed                       | **PASS** 6/6   | `r14.log`                |
| Manual live disconnect / reconnect / no-duplicate drill | **NOT TESTED** | —                        |

---

## 14. Build Results

| Check                                   | Result          | Detail                          | Evidence           |
| --------------------------------------- | --------------- | ------------------------------- | ------------------ |
| `npm run build` (main → dist)           | **PASS**        | 21s                             | `build.log`        |
| Backend lint                            | **PASS**        | 0 errors, 903 warnings          | `lint-backend.log` |
| Signed / notarized production RC        | **NOT DONE**    | Training/engineering class only | Gate 1 / OPS-02    |
| Packaging for live install this session | **NOT CLAIMED** | —                               | —                  |

---

## 15. Responsive Results

| Check                                                       | Result                |
| ----------------------------------------------------------- | --------------------- |
| Deep responsive matrix (desktop / laptop / tablet / mobile) | **NOT TESTED**        |
| Playwright layout-integrity (POS grid / touch targets)      | **PASS** (smoke only) |

---

## 16. Performance Results

| Check                                          | Result                                           |
| ---------------------------------------------- | ------------------------------------------------ |
| Formal startup / POS / KDS / report perf suite | **NOT TESTED / not measured**                    |
| Observed suite timings                         | Seconds-scale harness only (not production load) |
| Score contribution                             | Performance **40 / 100** (honest: unmeasured)    |

---

## 17. Accessibility Results

| Check                                               | Result                                                  |
| --------------------------------------------------- | ------------------------------------------------------- |
| Deep a11y audit (keyboard, focus, labels, contrast) | **NOT TESTED**                                          |
| flo-* / Playwright touch-target / layout smoke      | Partial contract evidence only — **not** full a11y PASS |

---

## 18. Bugs Found

Summary from [`BUG-REPORT.md`](./BUG-REPORT.md):

| Severity   | Found this session | Notes                                                    |
| ---------- | -----------------: | -------------------------------------------------------- |
| P0 product |              **0** | None reproduced in executed suites                       |
| P1         |              **1** | R16 / OPS-02 live release gate                           |
| P2         |              **3** | Tip/symbol infra (fixed) + QA-GUI-KDS-DEEPLINK-01 (open) |
| P3         |     **2** residual | CSP/JWT residual; REAL→cents cutover (pre-existing)      |
| P4         |          **0** new | —                                                        |

Also noted (not bugs): backend lint warning debt (903); console noise during R2 isolation; full `npm test` not run.

---

## 19. Bugs Fixed

| ID                       | Severity | Fix                                                                           | Regression                                     |
| ------------------------ | -------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| QA-TEST-SCHEMA-TIP-01    | P2       | Tip assertions **83 → 86** across R2–R9.5 suites                              | Final rerun **PASS**                           |
| QA-TEST-R3-KDS-SYMBOL-01 | P2       | Assert `pendingRetriesRef` / `flushPendingStatusRetry` / `PendingStatusRetry` | `test:r3` **70/70 PASS**; `test:h2` still PASS |

**Product code P0/P1 fixes this session:** none required for open product P0.

---

## 20. Remaining Bugs

| ID                     | Severity | Status                                                                       |
| ---------------------- | -------- | ---------------------------------------------------------------------------- |
| QA-REL-R16-01          | P1       | **OPEN** — signed RC / OPS-02 site drills pending → live **NO-GO**           |
| QA-GUI-KDS-DEEPLINK-01 | P2       | **OPEN** — hard `GET /kds/` → `Cannot GET /kds/` (`evidence/gui/SESSION.md`) |
| QA-SEC-CSP-JWT-01      | P3       | OPEN residual — fresh XSS PoC **NOT TESTED** this session                    |
| QA-MONEY-REAL-01       | P3       | OPEN — REAL→cents cutover **REQUIRES PRODUCT DECISION**                      |

No open automated-suite product failures after tip-fix regression.

---

## 21. Blockers

**QA INCOMPLETE — BLOCKED BY:**

1. Incomplete **manual GUI** (button-by-button across 35 screens)
2. Incomplete **full role GUI matrix** (login + allow/deny + direct URL for all 5 roles)
3. Incomplete **full offline manual** drill (H2 automated only)
4. Incomplete **full `npm test`** mega-suite (targeted suites only)
5. Incomplete **signed RC / OPS-02** (R16 Gate 1) for live café

Until these close (or are explicitly waived with product/ops sign-off), do **not** declare COMPLETE QA or live GO.

---

## 22. Test Evidence

All session evidence under [`docs/qa/evidence/`](./evidence/):

| Artifact       | Path                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Environment    | `environment.log`, `SUMMARY.txt`                                                                               |
| Build / lint   | `build.log`, `lint-backend.log`                                                                                |
| P0 suites      | `h1.log`–`h4.log`, `r1.log`, `r15.log`, `authz-phase3.log`, `staff-authz.log`, `orders-authz.log`, `smoke.log` |
| R2–R14         | `r2.log`…`r14.log`, `SUMMARY-r2-r14.txt`                                                                       |
| Tip-fix reruns | `SUMMARY-rerun.txt`, `SUMMARY-rerun2.txt`, `rerun-*.log`, `rerun2-*.log`                                       |
| Playwright     | `playwright-e2e.log`, `playwright-summary.txt`                                                                 |

Claimed PASS without an evidence path → treat as **NOT TESTED**.

---

## 23. Regression Results

| Wave                                           | Result                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| First run r2–r9.5                              | FAIL on tip/symbol infra (see `SUMMARY-r2-r14.txt`)          |
| After tip + r3 symbol fixes                    | r2, r3, r7, r8, r9, r9.5, h2 **PASS** (`SUMMARY-rerun.txt`)  |
| Second tip fix (multiline)                     | r4, r5, r6, r9.2, r9.3, r9.4 **PASS** (`SUMMARY-rerun2.txt`) |
| Final state r2–r14 + h4 + P0 wave + Playwright | **ALL PASS** on executed suites                              |
| Full `npm test` post-fix regression            | **NOT EXECUTED**                                             |

---

## 24. QA Score

Honest scores (/100) — **not inflated**:

| Dimension              |  Score | Rationale                                                                     |
| ---------------------- | -----: | ----------------------------------------------------------------------------- |
| Functional correctness | **72** | Strong automated money/floor/kitchen/inventory/finance waves; manual GUI gaps |
| GUI                    | **35** | 4 Playwright specs only; 0% button-by-button                                  |
| Automation             | **78** | Broad H/R/authz green; full `npm test` missing                                |
| RBAC                   | **68** | API authz strong; GUI deny untested                                           |
| Security               | **62** | Authz suites PASS; CSP/JWT residual; no fresh adversarial GUI                 |
| Data integrity         | **75** | h1/r14/h4/r15/r9.x green; not every table manually verified                   |
| Build                  | **88** | build+lint green; unsigned RC; lint warning debt                              |
| Performance            | **40** | Not measured                                                                  |
| **Overall**            | **62** | Weighted honesty across incomplete manual/ops gates                           |

---

## 25. Final Release Recommendation

### Engineering pilot validation: **GO WITH CONDITIONS**

**Conditions:**

1. Treat this build as **engineering QA / training** — not a live café install.
2. Keep residual P3 items (CSP/JWT, REAL cutover) visible; do not silent-close.
3. Close or explicitly waive: manual GUI, role GUI matrix, offline live drill, full `npm test`.
4. Do not promote Planned/Frozen scope as tested.

### Live café go-live: **NO-GO**

**Why:**

- **R16 / OPS-02 Gate 1** (signed/notarized RC + site readiness) remains **P1 open**.
- Manual GUI / all-role GUI / live offline are **NOT TESTED**.
- Full default `npm test` mega-suite **NOT EXECUTED**.
- Overall score **62/100** reflects incomplete evidence, not “green means ship.”

### Absolute status line

> **QA INCOMPLETE — BLOCKED BY** incomplete manual GUI, full role GUI matrix, full offline manual, full `npm test`, signed RC.

This report is a **partial, evidence-based** RestaurantOS QA audit. It is **not** a claim of COMPLETE QA.
