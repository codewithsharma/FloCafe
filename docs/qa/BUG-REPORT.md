# RestaurantOS QA Bug Report

**Audit date:** 2026-08-15  
**Commit under test:** `b996b9806d3075b852895273ca4eda2289a143a8` (+ local QA/test-tip fixes)  
**Schema tip:** v86  
**Environment:** macOS Darwin 25.5.0 arm64 · Node v24.18.0 · npm 11.16.0

---

## Summary

| Severity | Found                                   | Fixed this session      | Remaining |
| -------- | --------------------------------------- | ----------------------- | --------- |
| P0       | 0                                       | 0                       | 0         |
| P1       | 1 (release gate / incomplete manual QA) | 0                       | 1         |
| P2       | 2                                       | 2 (test infrastructure) | 0 product |
| P3       | 2 (pre-existing residual risks)         | 0                       | 2         |
| P4       | 0 new                                   | 0                       | 0         |

No P0 product defects were reproduced in executed automated suites this session.

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

## Product defects from GUI/API exploratory

**None newly confirmed** — manual button-by-button GUI for all roles was **NOT completed** this session. Do not infer absence of GUI defects.
