# RestaurantOS QA Bug Report

**Audit date:** 2026-08-15  
**Commit under test:** `b996b9806d3075b852895273ca4eda2289a143a8` (+ local QA/test-tip fixes)  
**Schema tip:** v86  
**Environment:** macOS Darwin 25.5.0 arm64 · Node v24.18.0 · npm 11.16.0

---

## Summary

| Severity | Found                                            | Fixed this session      | Remaining                |
| -------- | ------------------------------------------------ | ----------------------- | ------------------------ |
| P0       | 0                                                | 0                       | 0                        |
| P1       | 3 (R16 gate + GUI checkout ฿0 + waiter/chef POS) | 0                       | 3                        |
| P2       | 3 (2 test infra fixed + KDS deeplink)            | 2 (test infrastructure) | 1 product (KDS deeplink) |
| P3       | 2 (pre-existing residual risks)                  | 0                       | 2                        |
| P4       | 0 new                                            | 0                       | 0                        |

No P0 product defects were reproduced in executed automated suites this session. Live GUI found **P1** money and RBAC defects (below).

---

## Bugs found / fixed this session

### QA-TEST-SCHEMA-TIP-01 — Stale schema tip assertions (P2) — FIXED

| Field       | Value                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| Severity    | P2                                                                                                             |
| Module      | Test infrastructure (R2–R9.5 suites)                                                                           |
| Role        | n/a                                                                                                            |
| Environment | Local electron-node test runner                                                                                |
| Steps       | Run `npm run test:r2` … `test:r9.5` on schema tip v86                                                          |
| Expected    | Suites assert current tip **86**                                                                               |
| Actual      | Suites asserted tip **83** → FAIL (expected 83, got 86) while functional scenarios largely passed              |
| Evidence    | `docs/qa/evidence/SUMMARY-r2-r14.txt`, per-suite `*.log`; after fix `SUMMARY-rerun.txt` / `SUMMARY-rerun2.txt` |
| Root cause  | Incorrect tests — tip advanced R10→v84 … R13→v86; historical R2–R9 tip locks not updated                       |
| Fix         | Updated tip assertions to **86** in listed test files; re-ran suites → PASS                                    |
| Regression  | `rerun2` r4/r5/r6/r9.2/r9.3/r9.4 all PASS                                                                      |

### QA-TEST-R3-KDS-SYMBOL-01 — Brittle H2 symbol name check (P2) — FIXED

| Field      | Value                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Severity   | P2                                                                                                |
| Module     | KDS / `tests/r3-kitchen-os.test.ts` S-KDS-05                                                      |
| Steps      | Source-scan `useKdsConnection.ts` for `pendingRetryRef` / `pendingStatusRetry`                    |
| Expected   | Detect H2 pending status retry contract                                                           |
| Actual     | FAIL — implementation uses `pendingRetriesRef` + `flushPendingStatusRetry` / `PendingStatusRetry` |
| Evidence   | `docs/qa/evidence/r3.log`, `rerun-r3.log`                                                         |
| Root cause | Incorrect / brittle test string match (not product regression — `test:h2` already PASS)           |
| Fix        | Assert `pendingRetriesRef` \|\| `flushPendingStatusRetry` \|\| `PendingStatusRetry`               |
| Regression | `test:r3` 70/70 PASS; `test:h2` 34/34 PASS                                                        |

---

## Live GUI defects (2026-08-15 full GUI session)

### GUI-0002 — Checkout Confirm Payment ฿0.00 (P1) — FIXED (2026-08-15 retest)

| Field    | Value                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Severity | P1                                                                                 |
| Status   | **FIXED** — prepaid payable guards + tax preview fail-closed; GUI retest ฿64.20    |
| Evidence | `docs/qa/evidence/gui/full/FINAL-RETEST.md`, `fix-retest-01-owner-checkout-64.png` |

### GUI-0003 — Waiter/Chef can access POS UI (P1) — FIXED (2026-08-15 retest)

| Field    | Value                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| Severity | P1                                                                                       |
| Status   | **FIXED** — `canAccessPos` + AuthGuard/POS gate + role landing; chef order API still 403 |
| Evidence | `fix-retest-03-waiter-pos-denied.png`, `fix-retest-04-chef-pos-denied.png`               |

### QA-GUI-KDS-DEEPLINK-01 — Cannot GET /kds/ (P2) — FIXED (2026-08-15 retest)

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Severity | P2                                                 |
| Status   | **FIXED** — SPA fallback no longer excludes `/kds` |
| Evidence | `fix-retest-02-kds-deeplink-PASS.png`              |

---

## Live GUI defects (historical — superseded by FIXED entries above)

### GUI-0002 — Checkout Confirm Payment ฿0.00 (P1) — OPEN

| Field    | Value                                                        |
| -------- | ------------------------------------------------------------ |
| Severity | P1                                                           |
| Module   | POS / payment                                                |
| Role     | owner                                                        |
| Steps    | Cart Items=1 Subtotal ฿60.00 → Place Order → Checkout dialog |
| Expected | TOTAL DUE ฿64.20 (or clear error)                            |
| Actual   | `Confirm Payment · ฿0.00` with blank TOTAL DUE               |
| Evidence | `docs/qa/evidence/gui/full/11-owner-checkout-zero-FAIL.png`  |
| Status   | OPEN — payment not confirmed                                 |

### GUI-0003 — Waiter/Chef can access POS UI (P1) — OPEN

| Field    | Value                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Severity | P1                                                                             |
| Module   | AuthGuard / RBAC                                                               |
| Role     | waiter, chef                                                                   |
| Expected | POS hidden and unreachable (nav roles exclude POS)                             |
| Actual   | Login lands on `/pos/` with full cart; unauthorized routes redirect to POS     |
| Evidence | `docs/qa/evidence/gui/full/13-waiter-pos-access.png`, `14-chef-pos-access.png` |
| Status   | OPEN                                                                           |

### QA-GUI-KDS-DEEPLINK-01 — Cannot GET /kds/ (P2) — CONFIRMED OPEN

| Field      | Value                                                               |
| ---------- | ------------------------------------------------------------------- |
| Severity   | P2                                                                  |
| Module     | Express static / SPA (`main/server.ts`)                             |
| Steps      | Hard navigate `GET /kds/`                                           |
| Expected   | Kitchen Display SPA                                                 |
| Actual     | `Cannot GET /kds/`                                                  |
| Root cause | SPA fallback regex excludes `/kds` while static uses `index: false` |
| Evidence   | `docs/qa/evidence/gui/full/06-owner-kds-deeplink-fail.png`          |
| Status     | OPEN — sidebar client nav works                                     |

---

## Remaining / pre-existing (not fixed — out of product-feature policy or human gates)

### QA-REL-R16-01 — Live release Gate 1 not met (P1)

| Field    | Value                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Severity | P1 (release / pilot)                                                                       |
| Module   | R16 / OPS-02                                                                               |
| Expected | Signed/notarized RC + site readiness for live pilot                                        |
| Actual   | Engineering suites green; signed RC / OPS-02 site drills **PENDING** → Live **NO-GO**      |
| Evidence | `.ai/context.md`, `docs/05-production/r16-production-release-blocker.md`, audit-v2 verdict |
| Fix      | Human/ops — not a code defect                                                              |
| Status   | OPEN / BLOCKER for live GO                                                                 |

### QA-SEC-CSP-JWT-01 — CSP unsafe-inline + JWT in localStorage (P3 residual)

| Field    | Value                                                                 |
| -------- | --------------------------------------------------------------------- |
| Severity | P3 (accepted residual / Phase C deferred)                             |
| Module   | Security                                                              |
| Evidence | `.ai/risks.md`, prior P0.6 audits                                     |
| Status   | OPEN — not re-exploited this session; **NOT TESTED** as fresh XSS PoC |

### QA-MONEY-REAL-01 — REAL→cents final cutover deferred (P3 residual)

| Field    | Value                                            |
| -------- | ------------------------------------------------ |
| Severity | P3 / debt                                        |
| Module   | Money path                                       |
| Evidence | Dual-write v81; tip v86 without REAL drop        |
| Status   | OPEN — **REQUIRES PRODUCT DECISION** for cutover |

---

## Not bugs (characterization)

| Observation                                                                  | Classification                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Console noise `Table already has an active order` during R2 while suite PASS | Expected negative path / isolation noise — not counted as failure after tip fix             |
| Backend lint 903 warnings, 0 errors                                          | Debt — not a functional FAIL                                                                |
| Full `npm test` mega-suite                                                   | **NOT EXECUTED** end-to-end this session (targeted R/H/authz/smoke/build + Playwright only) |

---

## Product defects from GUI exploratory (browse MCP session 2026-08-15)

### QA-GUI-KDS-DEEPLINK-01 — Hard navigation to `/kds/` fails (P2) — OPEN

| Field       | Value                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| Severity    | P2                                                                                              |
| Module      | KDS / static route serving                                                                      |
| Role        | manager (authenticated)                                                                         |
| Environment | e2e-server on :3001, browse MCP Chromium                                                        |
| Steps       | Login → sidebar Kitchen works → hard open/reload `http://localhost:3001/kds/`                   |
| Expected    | Kitchen Display SPA                                                                             |
| Actual      | `Cannot GET /kds/` (title Error)                                                                |
| Evidence    | `docs/qa/evidence/gui/SESSION.md`; client-nav screenshot `06-kds.png`                           |
| Root cause  | Suspected Express static SPA fallback gap for `/kds` ( `/orders/`, `/settings/` hard reload OK) |
| Fix         | Not applied this session (needs product/serving fix + regression)                               |
| Status      | OPEN                                                                                            |

Manual button-by-button for **all** roles remains incomplete (manager only exercised).
