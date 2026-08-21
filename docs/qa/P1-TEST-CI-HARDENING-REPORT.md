# P1 Test / CI Hardening Report

**Date:** 2026-08-21 (updated P1.1 stabilization)  
**Branch:** `restaurant-vertical`  
**Product:** OPERAVIA (flo-desktop) 3.0.5 · schema tip **v86**

---

## 1. Executive Summary

|                                        | Before (audit)     | After P1 + P1.1                               |
| -------------------------------------- | ------------------ | --------------------------------------------- |
| Automated test files                   | 239                | 239                                           |
| Unintentional orphans                  | ~76                | **0**                                         |
| Root / frontend unit in CI             | No                 | **Yes**                                       |
| Corrupt-DB / process-kill / boundaries | Orphaned           | **Merge — PASS**                              |
| Silent orphan possible?                | Yes                | **No** (`test:discover-guard`)                |
| Merge Electron/ts-node execution       | Partial mega-chain | **180/180 PASS**                              |
| Extended tier                          | Orphaned           | **45/45 PASS**                                |
| Testing audit score drag               | 58/100             | Safety net **structurally + execution green** |

**Primary success metric met:** every intended automated test is classified and discoverable; critical suites gate; merge + extended execute green; a new normal test cannot silently bypass CI.

---

## 2. Test Inventory (exact counts)

| Metric                     |                              Count |
| -------------------------- | ---------------------------------: |
| Discovered automated files |                            **239** |
| `merge`                    |                            **192** |
| `extended`                 |                             **45** |
| `manual`                   | **2** (`db-audit`, `translations`) |
| `obsolete`                 |                              **0** |
| Unintentional orphans      |                              **0** |

`translations.test.ts` is **intentionally manual**: full en/es/pt key parity is product i18n backlog (~172 missing keys). Runnable via `npm run test:translations`.

---

## 3. P1.1 Stabilization — Fixed Failures

### `database-tools-api` (was 32/33 FAIL)

**Root cause:** Test forged JWT for `owner-1` while setup created a UUID owner. Success-path `logAuditEvent` inserted `actor_user_id='owner-1'` → `audit_logs` FK fail → catch re-audited and threw again → empty HTTP 500 despite backup file written.

**Fixes:**

1. **Test:** use real setup `access_token` (valid `users.id`).
2. **Product:** backup success/failure audits are best-effort — successful backup no longer becomes 500 if audit insert fails; failure path still returns structured `{ error: 'Backup failed' }`.

**Result:** **35/35 PASS** (includes new token assertions).

### Extended contract drift (all test retargets — no weakened behavior)

| Suite                             | Cause                               | Fix                                  |
| --------------------------------- | ----------------------------------- | ------------------------------------ |
| phase-4.3                         | Hardcoded `/pos` redirect           | Assert `getLandingPageForRole`       |
| phase-4.7 / 4.9                   | Tip pin v75                         | Pin tip **v86**                      |
| phase-4.15                        | CHECK lived in extracted migrations | Assert `main/database/migrations.ts` |
| shared-module-vertical-neutrality | Scanned orders facade only          | Scan `main/routes/orders/**`         |

**Result:** all five **PASS**.

---

## 4. CI Architecture

```text
dependency-review (PR)
        │
changes (+ infra: scripts, workflows, vitest, test-tiers)
        │
        ├─ tax-category-invariant (always)
        ├─ backend-tests     → discover-guard, lint, tsc, unit, merge integration, coverage
        ├─ frontend-tests    → lint, unit:frontend, build:frontend
        └─ critical-e2e      → Playwright

main:
        └─ extended-tests

nightly:
        └─ discover-guard + merge + extended
```

Preserved: SHA pins, dependency-review, tax invariant, native rebuild, Playwright + coverage artifacts.

---

## 5. Commands

| Command                                    | Purpose                            |
| ------------------------------------------ | ---------------------------------- |
| `npm run test:discover-guard`              | Fail if any test file lacks a tier |
| `npm run test:unit` / `test:unit:frontend` | Vitest layers                      |
| `npm run test:integration`                 | Merge Electron/ts-node             |
| `npm run test:critical` / `test:recovery`  | Critical orphan groups             |
| `npm run test:extended`                    | Extended / nightly                 |
| `npm test` / `test:merge`                  | discover + units + integration     |
| `npm run test:all`                         | merge + extended + e2e             |
| `npm run test:translations`                | Manual i18n parity                 |

---

## 6. Validation Evidence (P1.1)

| Command                            | Result                       | Evidence                                          |
| ---------------------------------- | ---------------------------- | ------------------------------------------------- |
| `npm run test:discover-guard`      | **PASS**                     | 239 classified (merge:192, extended:45, manual:2) |
| Unclassified probe                 | **PASS** (fails as designed) | Exit 1 on orphan probe                            |
| `npm run test:unit`                | **PASS**                     | 7 files / 34 tests                                |
| `npm run test:unit:frontend`       | **PASS**                     | 2 files / 10 tests                                |
| `npm run test:recovery`            | **PASS**                     | pass=3 fail=0                                     |
| `npm run test:critical`            | **PASS**                     | pass=24 fail=0                                    |
| `npm run test:integration`         | **PASS**                     | pass=180 fail=0                                   |
| `npm run test:extended`            | **PASS**                     | pass=45 fail=0                                    |
| `npm run lint:backend`             | **PASS**                     | exit 0                                            |
| `npx tsc --noEmit`                 | **PASS**                     | exit 0                                            |
| `npm run build:frontend`           | **PASS**                     | static export OK                                  |
| `tests/database-tools-api.test.ts` | **PASS**                     | 35/35                                             |
| Playwright e2e                     | **NOT RUN** in this pack     | CI job still present                              |

---

## 7. Remaining Gaps (not P1 blockers)

1. Full en/es/pt parity (`npm run test:translations`) — product i18n backlog.
2. Frontend component / interaction tests — P4.
3. Cross-process SQLite contention — P5.
4. Windows CI job on PRs — P3 (nightly matrix exists).
5. REAL→cents / `bill_payments` — P6.

---

## 8. Production Readiness — Audit Finding Status

| Finding                        | Status                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Orphaned suites                | **RESOLVED**                                                                              |
| Root unit gating               | **RESOLVED**                                                                              |
| Frontend unit gating           | **RESOLVED**                                                                              |
| Test discovery / silent orphan | **RESOLVED**                                                                              |
| CI gating breadth              | **RESOLVED** for merge+extended+units+recovery+critical (Windows PR job still Later / P3) |

---

## 9. Product fixes in this program

1. Exclude `QR_GUEST_USER_ID` from operational user counts (auth / install marker / jwt-secret) — unblocks first-run after R10.
2. Backup audit best-effort — successful backup is not discarded as HTTP 500 when audit FK fails.
