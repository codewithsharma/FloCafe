# Testing Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5

> Verdict: **backend money-path testing is genuinely strong; frontend and CI-gating are weak.** The repository contains ~234 test files and ~200 `test:*` scripts, but **63 of those scripts (and 11 additional test files) are never executed by `npm test` or CI**, the only true unit layer (vitest) is not gated, repo-wide coverage is unmeasured (scoped to 4 files), and the frontend's real behavior rests on ~5 Playwright cases plus 21 static string-grep suites. Test maturity: **~2.5/5 (Moderate).**

---

## 1. Test topology

Three runners plus E2E:

| Runner                                                                          | What it runs                                                                        | In CI?                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| `tests/run-electron-node-test.cjs` (Electron-as-Node, `ELECTRON_RUN_AS_NODE=1`) | ~227 backend/integration suites against real `better-sqlite3` + real Express        | Partially (via `npm test`) |
| `vitest` (`vitest.config.mts`)                                                  | `tests/unit/**` — 7 pure unit files incl. `payment-validation`, `refund-validation` | **No**                     |
| `vitest` (frontend `vitest.config.ts`, `environment:'node'`)                    | 2 lib-helper units                                                                  | **No**                     |
| Playwright (`frontend/playwright.config.ts`, chromium)                          | 3 spec files / ~5 cases                                                             | Yes (`e2e-playwright`)     |

The backend harness is legitimate integration testing: `tests/helpers/test-setup.ts` builds a **real Express app**, mounts real `main/routes/*`, applies **production-equivalent JWT/role/revocation middleware**, and drives it with real `fetch` on an ephemeral port (`app.listen(0)`), against a per-test temp SQLite DB (`mkdtempSync`). This is the right way to test an embedded-API desktop app.

## 2. What's strong (Confirmed)

- **The money path is thoroughly covered on the backend and gated by `npm test`.** Order→tax→payment→settle→refund→day-close/Z is exercised by real HTTP+DB suites: `integration-happy-path`, `integration-payments`, `integration-tax`, `issue-214-payment-integrity` (per-user idempotency-key replay), `payment-methods-split-checks`, `integration-refunds` (826 lines, fires overlapping refunds via `Promise.all` to assert over-refund is blocked), `day-close`/`day-close-z`, and the 1,620-line `shift-reconciliation`.
- **Real migration/upgrade fixtures.** `tests/fixtures/upgrade-snapshots/*.db` drive `upgrade-path` and `migration-v56-v57`; schema-health verified against an ideal-schema build.
- **Genuinely clever recovery tests.** `process-kill-recovery.test.ts` spawns a child worker and `SIGKILL`s it mid-transaction to prove atomicity; `r14-corrupt-db-fail-closed.test.ts` corrupts the freelist header to produce a "corrupt-but-openable" DB and asserts fail-closed latching.
- **A standalone CI safety invariant.** The `tax-category-invariant` job always runs `test:tax-engine` ("no category means no tax") regardless of path filters.
- **Per-test DB isolation** via `Module._load` Electron mock + temp `getPath()`.

## 3. Findings

### 3.1 63 `test:*` scripts + 11 test files are never run by `npm test` or CI

- **Issue:** `npm test` reaches only ~136 of ~199 `test:*` scripts; CI adds only `m1-gate`, `coverage:baseline`, the tax invariant, and Playwright — covering none of the remaining **63 orphaned scripts**. Orphans include **all `r2`–`r15` feature-wave suites** (kitchen OS, floor ops, inventory OS, BOM/recipes, purchasing, CRM, workforce, coupons, print-queue), **all `phase-4.*` suites**, **all `*-boundary` architecture guards** (the R4.1 enforcement tests), **all `inventory-*`**, and the DB-recovery suites (`r14-corrupt-db`, `process-kill-recovery`, `rec-01`). Additionally **11 test files are wired to no npm script at all** (`gui-0001…0005-*`, `p1-06-unopenable-db`, `integration-inclusive-tax`, `issue-122-addon-quantities`, `product-tags-parse`, `production-retail`, `shift-bill-payment-integration`, `shift-order-integration`).
- **Severity:** High.
- **Category:** Testing / CI.
- **Evidence:** `.github/workflows/ci.yml` (`linux-baseline` runs `npm test` + `m1-gate` + `coverage:baseline`; `tax-category-invariant`; `e2e-playwright`); `package.json` `test:*` script set vs the `tests/run-test.sh` chain inside the `test` script; the 11 files exist under `tests/` with no matching script.
- **Why it matters:** authored, maintained tests that never run provide **zero regression protection** and a false sense of security — most damningly the two best recovery tests and the architecture-boundary guards that are supposed to enforce R4.1.
- **Impact:** regressions in inventory, purchasing, coupons, refunds-restock, corrupt-DB latching, and architecture boundaries can merge green.
- **Recommendation:** wire the orphaned suites into `npm test`/CI (or delete the truly dead ones). Prioritize `r14-corrupt-db`, `process-kill-recovery`, `rec-01`, `phase-4.2` (refund-restock), `inventory-*`, and all `*-boundary` guards.
- **Suggested solution:** replace the hand-maintained serial chain with a directory-glob runner (run every `tests/**/*.test.ts`) so new files are included by default; make orphaning impossible by construction.
- **Refactoring effort:** Low–Medium (test wiring only; no product code).
- **Confidence:** High.

### 3.2 The only true unit layer (vitest) is not in CI

- **Issue:** No workflow runs `npm run test:unit` (root vitest → `tests/unit/**`, including `payment-validation` and `refund-validation`) or the frontend vitest (`frontend/src/lib/*.test.ts`).
- **Severity:** Medium.
- **Evidence:** `.github/workflows/ci.yml` invokes `npm test`, `test:m1-gate`, `test:coverage:baseline`, the tax invariant, and Playwright — none of which call `test:unit`.
- **Why it matters:** the fastest, most focused correctness checks (validation schemas) don't gate merges.
- **Recommendation:** add `npm run test:unit` (root + frontend) to `linux-baseline`.
- **Refactoring effort:** Low.
- **Confidence:** High.

### 3.3 The 21 `flo-*` "frontend" tests are static source-string greps, not UI tests

- **Issue:** every `flo-*` suite reads a `.tsx` file as a string and asserts `source.includes('...')`. Zero rendering, zero behavior.
- **Severity:** Medium (they are mislabeled coverage, not harmful in themselves).
- **Category:** Testing (false-confidence).
- **Evidence:** mechanically verified — 0/21 import any render/DOM library; 21/21 use `fs.readFileSync`; 519 `includes`/`match`-style assertions. Example (`tests/flo-pos.test.ts`): `assert.ok(posPage.includes('ProductGrid'))`. `tests/flo-settings-complete.test.ts` asserts "`<Panel` appears ≥30 times" and "`text-gray-900` appears 0 times."
- **Why it matters:** these catch refactor drift and stale design tokens (lint-grade value) but prove nothing about runtime correctness — a component can pass while throwing on render or sending a malformed payload.
- **Recommendation:** keep them as cheap drift guards but **do not count them as UI coverage**; add real component tests (see 3.4).
- **Refactoring effort:** N/A (reclassification) / Medium (to add real tests).
- **Confidence:** High.

### 3.4 Frontend behavior is effectively untested

- **Issue:** the cashier UI — the actual product — has **no React component/interaction tests** (no `@testing-library/*`, and although `jsdom ^30.0.1` is a devDependency it is unused because the frontend vitest is configured with `environment:'node'`, making rendering impossible as configured). Real browser behavior is 3 Playwright specs / ~5 cases (`kds-login`, `layout-integrity`, `prepaid-payment-reconciliation`).
- **Severity:** High.
- **Category:** Testing gap.
- **Evidence:** no `@testing-library/*` in `frontend/package.json`; `jsdom` present but unused; `frontend/vitest.config.ts` `environment:'node'`, `include: ['src/**/*.test.ts','src/**/*.test.tsx']` matches only 2 node-env lib helpers (`src/lib/dates.test.ts`, `src/lib/inventory-movements.test.ts`); `frontend/e2e/` = 3 files.
- **Why it matters:** for a POS where the cashier screen _is_ the product, correctness of order entry, payment modal, discount application, and split-checks in the browser is essentially unverified end-to-end.
- **Recommendation:** add jsdom + testing-library component tests for the POS/payment/settings flows; expand Playwright beyond 5 cases to cover the core cashier journey and settle path.
- **Refactoring effort:** Medium–High.
- **Confidence:** High.

### 3.5 Repo-wide coverage is unmeasured

- **Issue:** `.c8rc.json` `include` lists only 4 files (`routes/auth.ts`, `routes/bills.ts`, `services/tax-engine.ts`, `middleware/security.ts`). True repo-wide coverage is unknown.
- **Severity:** Medium.
- **Evidence:** `.c8rc.json`; the `coverage:baseline` job re-runs only `integration-payments` + `issue-214-payment-integrity` under c8.
- **Why it matters:** you cannot see coverage regressions outside those 4 files; the reported number is not a codebase-health metric.
- **Recommendation:** measure coverage repo-wide (report-only at first, then gate a floor on the money-path services).
- **Refactoring effort:** Low.
- **Confidence:** High.

### 3.6 No concurrency / multi-writer SQLite testing

- **Issue:** all "concurrent" tests run in a single process (`Promise.all`, in-process). The real risk — the main server (3001) and the standalone KDS server (3002) writing the same WAL DB from **separate processes**, or multiple terminals — has no `SQLITE_BUSY`/WAL-contention test.
- **Severity:** Medium–High (probability depends on whether LAN/KDS multi-writer is used in the field).
- **Evidence:** `database-maintenance-lock.test.ts` asserts a 503 during maintenance; `integration-refunds` uses in-process `Promise.all`; no cross-process writer test exists.
- **Why it matters:** two OS processes on one WAL database is a genuine runtime configuration (main + standalone KDS), and it is the classic SQLite failure mode.
- **Recommendation:** add a cross-process contention test (spawn two writers against one DB); confirm `busy_timeout`/retry behavior under `SQLITE_BUSY`.
- **Refactoring effort:** Medium.
- **Confidence:** High (that the test is absent); Medium (on field probability).

### 3.7 CI is Linux-only for a tri-platform desktop app

- **Issue:** CI runs on `ubuntu-latest` only. Windows/macOS paths (`rewriteNextExportPath`, `kill-ports.js`), native rebuild, and printing (CUPS vs Windows RAW spooler) are unverified in CI.
- **Severity:** Medium–High.
- **Evidence:** `.github/workflows/ci.yml` all jobs `runs-on: ubuntu-latest`; `issue-windows-country-code-crash.test.ts` is a single in-process regression, not platform coverage.
- **Why it matters:** the app ships Windows (nsis/appx) and macOS (dmg/mas) targets; platform-specific code (printing especially) can regress undetected.
- **Recommendation:** add a Windows CI job (and ideally macOS) covering printing-path unit tests, path rewriting, and native rebuild.
- **Refactoring effort:** Medium.
- **Confidence:** High.

### 3.8 Printer hardware-fault and load/perf/fuzz testing absent

- **Issue:** printer tests use a JSON sink; no USB-disconnect / offline / paper-out fault injection. No load/performance suite. Security suites (`cors-security`, `url-allowlist`, `security-hardening`) are positive/negative assertions, not fuzzing.
- **Severity:** Medium.
- **Evidence:** `restaurant-sim/printer-sink.json`; absence of any perf/fuzz harness.
- **Recommendation:** add fault-injection for the print path (the durable outbox exists to handle failures — test that it does); consider light input fuzzing on money/validation endpoints.
- **Refactoring effort:** Medium.
- **Confidence:** High.

## 4. Reliability of the suite itself

- **Serial, fail-fast, no isolation:** `npm test` is one long `&&` chain of ~80 `bash tests/run-test.sh npm run test:*` invocations. A single failure aborts the remainder; no parallelism, no retry. `run-test.sh` only maps exit code 77 → skip (ABI mismatch).
- **Sound port strategy:** integration servers use `app.listen(0)`; `kill-ports.js` is an allowlist killer scoped to OPERAVIA/Flo process patterns.
- **Playwright** uses `retries:1` in CI (`trace:on-first-retry`, `workers:1`) — an implicit acknowledgment of e2e flakiness.
- **Latent CI-time risk:** ~136 serial suites (several 400–1,600 lines) each spawning an Electron-node process is slow; the 15-minute `linux-baseline` timeout will get tighter as suites grow.

## 5. Risk-based coverage summary

| Workflow                            | Covered                         | Risk     |
| ----------------------------------- | ------------------------------- | -------- |
| Order→tax→payment→settle            | Yes (real HTTP+DB)              | Low      |
| Payment idempotency / split         | Yes                             | Low      |
| Refund incl. over-refund race       | Yes (in-process)                | Low–Med  |
| Day-close / Z / reconciliation      | Yes                             | Low      |
| Migrations / upgrade path           | Yes (fixtures)                  | Low      |
| Inventory / BOM / recipes           | Exists but **orphaned from CI** | Med–High |
| Refund-restock / retail exchange    | Exists but **orphaned**         | Med      |
| DB corruption / crash-kill recovery | Strong tests, **not run by CI** | **High** |
| Concurrency / multi-writer SQLite   | **No**                          | **High** |
| Cross-platform Windows/mac          | **No** (Linux-only CI)          | **High** |
| Frontend component/UI behavior      | **No** (string-grep + ~5 e2e)   | **High** |
| Performance / load / fuzz           | **No**                          | Med–High |

## 6. Top remediations by leverage

1. **Wire the orphaned suites into CI** (or delete them) — especially `r14-corrupt-db`, `process-kill-recovery`, `rec-01`, `phase-4.2`, `inventory-*`, and the `*-boundary` guards. Switch to a glob runner so new tests are included by default.
2. **Add real frontend tests** (jsdom + testing-library) and expand Playwright beyond 5 cases.
3. **Add a Windows CI job** for printing, path handling, and native rebuild.
4. Gate `test:unit`; measure coverage repo-wide.

**Test maturity: ~2.5/5.** Backend integration on the money path is a real strength (4/5); the drag is untested frontend behavior, mass CI-orphaning of authored tests, unmeasured coverage, and single-platform CI.
