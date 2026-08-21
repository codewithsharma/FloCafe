# Test Gating Changelog — P1

**Date:** 2026-08-21  
**Scope:** Wire orphaned suites, unit gating, discover-guard, CI tier redesign.

## Previously not gated (now classified)

| Area                                    | Before                        | After                               |
| --------------------------------------- | ----------------------------- | ----------------------------------- |
| Root Vitest (`tests/unit/**`, 7 files)  | Script existed; **not in CI** | Merge gate via `test:unit`          |
| Frontend Vitest (2 files)               | Script existed; **not in CI** | Merge gate via `test:unit:frontend` |
| Corrupt-DB fail-closed (`r14`, `p1-06`) | Orphaned / unwired            | Merge `critical` group              |
| Process-kill recovery                   | Orphaned script               | Merge `critical` / `recovery`       |
| R4.1 + `*-boundary` guards              | Orphaned                      | Merge `critical`                    |
| Inventory ledger/movements/counts       | Orphaned                      | Merge `critical`                    |
| Refund restock (`phase-4.2`)            | Orphaned                      | Merge `critical`                    |
| Inclusive tax                           | No script                     | Merge `critical`                    |
| R2–R15 / phase-4 / GUI-000x             | Orphaned                      | Extended (main + nightly)           |
| `db-audit`                              | `audit:db` only               | **Manual** (intentional)            |

## Intentionally excluded / manual

| Item                                          | Reason                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tests/db-audit.test.ts`                      | Ops/audit command (`npm run audit:db`), not a regression gate                                 |
| `tests/translations.test.ts`                  | Full en/es/pt parity is product i18n backlog (~172 missing keys); `npm run test:translations` |
| Hardware printers / signed RC / OPS-02 drills | Human / credential / site gates (no `*.test.ts`)                                              |

## P1.1 Stabilization (same day)

| Failure                                                     | Resolution                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `database-tools-api` audit FK → 500 after successful backup | Real owner token in test + best-effort backup audit in `main/routes/database.ts` → **35/35 PASS** |
| phase-4.3 / 4.7 / 4.9 / 4.15 / shared-module                | Retarget contracts to current RBAC landing, tip v86, migrations path, orders package → **PASS**   |
| Merge / extended matrix                                     | **180/180** merge Electron + **45/45** extended PASS                                              |

## Obsolete tests removed

None deleted in P1.

## Infrastructure changes

- Added `tests/test-tiers.json` (239 files → merge | extended | manual | obsolete).
- Added `scripts/run-test-tier.cjs` and `scripts/assert-test-tiers.cjs`.
- `npm test` → `test:merge` (discover-guard + unit + frontend unit + merge Electron/ts-node).
- CI: split `backend-tests` / `frontend-tests` / `critical-e2e`; `extended-tests` on `main`; path filter includes `scripts/**`, workflows, vitest configs, `test-tiers.json`.
- Nightly runs merge + extended.

## Product fix required for gating (not test-only)

R10 migration seeds inactive `usr-system-qr-guest`. Raw `COUNT(*)` treated that as an operational user, so first-run `setup/initialize` permanently returned 403 after schema tip ≥ v84.  
**Fix:** operational user counts in `auth.getUserCount`, `db` install-marker backfill, and `jwt-secret.installHasUsers` exclude `QR_GUEST_USER_ID`.

## Unresolved / known gaps

- Full en/es i18n key parity still drifts (Argentina suite warns; does not fail).
- Frontend component/UI tests still absent (Playwright remains ~3 specs).
- Cross-process SQLite multi-writer test still absent.
- Windows CI job still absent (Linux merge gate + nightly matrix).
- Repo-wide coverage still scoped baseline-only.

## Audit finding status (post-P1)

| Finding                        | Status                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orphaned suites                | **PARTIALLY RESOLVED** → **RESOLVED for classification**; execution validated for critical/recovery/units; full merge/extended evidence in report |
| Root unit gating               | **RESOLVED** (command + CI)                                                                                                                       |
| Frontend unit gating           | **RESOLVED** (command + CI)                                                                                                                       |
| Test discovery / silent orphan | **RESOLVED** (`test:discover-guard`)                                                                                                              |
| CI gating breadth              | **PARTIALLY RESOLVED** (critical wired; extended on main/nightly; Windows still open)                                                             |
