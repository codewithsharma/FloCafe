# M1 Engineering Baseline Report

**Milestone:** M1 — Engineering baseline  
**Date:** 2026-08-12  
**App version:** 3.0.5  
**Schema version:** 66 (unchanged — no v67)  
**Scope:** Safety baseline only — no product behavior changes

---

## 1. Baseline environment

| Item | Value |
|------|-------|
| OS | Darwin 25.5.0 (arm64) |
| Node.js | v24.18.0 (meets `>=22.12.0` engines) |
| npm | 11.16.0 |
| Package manager | npm (lockfile v3) |
| Electron | ^43.3.0 |
| Next.js | 16.2.12 |
| React | 19.2.8 |
| Express | ^5.2.1 |
| better-sqlite3 | ^13.0.3 |
| SQLite | Bundled with better-sqlite3 |
| Schema version | 66 (`PRAGMA user_version`) |

---

## 2. Commands executed

### Pre-M1 baseline

```sh
node -v && npm -v
npm ci
npm run lint:backend
cd frontend && npm ci && npm run lint
npm run build
npm run build:frontend
npm run test:backup
npm run test:upgrade-path
npm run test:schema-health
npm run test:smoke          # failed when port 3001 occupied
npm run test:tax-engine
npm run test:security
npm run test:integration-payments
npm test                    # full suite (after npm run clean)
cd frontend && npx playwright test
```

### Post-M1 validation

```sh
npm run test:m1-gate
npm run test:coverage:baseline
npm test                    # EXIT_CODE=0
npm run lint:backend
npm run build
```

---

## 3. Initial results (pre-M1)

| Check | Result | Notes |
|-------|--------|-------|
| `npm ci` | PASS | Required before lint/tests |
| `npm run lint:backend` | PASS | 806 warnings, 0 errors |
| Frontend lint | PASS | |
| `npm run build` | PASS | |
| `npm run build:frontend` | PASS | |
| `npm run test:backup` | PASS | |
| `npm run test:upgrade-path` | PASS | |
| `npm run test:schema-health` | PASS | |
| `npm run test:smoke` | **FAIL** | Port 3001 occupied by Flo Cafe.app |
| `npm run test:smoke` (after `npm run clean`) | PASS | |
| `npm run test:tax-engine` | PASS | 12/12 |
| `npm run test:security` | PASS | |
| `npm run test:integration-payments` | PASS | 33/33 |
| `npm test` (piped to `tail`) | Misleading exit 0 | Pipeline masked failure |
| `npm test` (proper) | PASS | EXIT_CODE=0, ~206s |
| Playwright E2E | PASS | 4/4 |

---

## 4. Changes made (M1 REQUIRED)

| File | Purpose |
|------|---------|
| `package.json` | Add `c8` devDependency; `test:coverage:baseline`, `test:m1-gate` scripts |
| `package-lock.json` | Lock c8 dependency |
| `.c8rc.json` | Coverage include/exclude config for auth/tax/payment modules |
| `scripts/run-coverage-baseline.cjs` | Runs c8 across 6 existing test suites; merges report |
| `tests/m1-engineering-gate.test.ts` | Verifies M1 tooling + schema v66 (no v67) |
| `.github/workflows/ci.yml` | M1 gate + coverage baseline + artifact upload |
| `.gitignore` | Ignore `coverage/` output |
| `docs/08-development/development-guide.md` | M1 verification commands |
| `docs/08-development/local-setup.md` | Verified stack + port troubleshooting |
| `docs/09-testing/test-strategy.md` | Coverage baseline documentation |
| `docs/09-testing/test-plan.md` | M1 test plan |
| `docs/11-devops/ci-cd.md` | CI parity + M1 steps |
| `docs/13-operations/backup-restore.md` | Verified backup/restore procedure |
| `docs/13-operations/rollback.md` | **NEW** — developer rollback procedure |
| `docs/04-technology/tech-stack.md` | Coverage tooling status |
| `docs/15-project-management/milestones.md` | M1 marked complete |
| `docs/15-project-management/task-breakdown.md` | M1 checklist updated |
| `docs/15-project-management/technical-debt.md` | TD-08 partial remediation |

### Pre-existing changes (NOT M1 — documentation phase)

These files were modified before M1 implementation and are **not** part of this milestone:

`docs/00-product/*`, `docs/02-design/*`, `docs/03-architecture/*`, `docs/05-api/*`, `docs/06-database/*`, `docs/07-security/*`, `docs/12-observability/*`, `docs/15-project-management/master-implementation-plan.md`, `docs/audits/*`, `docs/API.md`, `docs/README.md`, `docs/cloud-v2-plan.md`

No application code in `main/` or `frontend/src/` was modified for M1.

---

## 5. Test results (post-M1)

| Suite | Result |
|-------|--------|
| `npm test` | **PASS** (EXIT_CODE=0) |
| `npm run test:m1-gate` | **PASS** |
| `npm run test:backup` | **PASS** (pre-M1, unchanged) |
| `npm run test:upgrade-path` | **PASS** (pre-M1, unchanged) |
| `npm run test:schema-health` | **PASS** (pre-M1, unchanged) |

---

## 6. Coverage results

Command: `npm run test:coverage:baseline`

### Combined (4 modules)

| Metric | Coverage |
|--------|----------|
| Statements | 53.5% (1525/2850) |
| Branches | 70.77% (373/527) |
| Functions | 64.7% (44/68) |
| Lines | 53.5% (1525/2850) |

### Per module

| File | Stmts | Branch | Funcs | Lines |
|------|-------|--------|-------|-------|
| `main/services/tax-engine.ts` | 95.37% | 76% | 100% | 95.37% |
| `main/middleware/security.ts` | 63.61% | 56.89% | 60% | 63.61% |
| `main/routes/bills.ts` | 49.26% | 77.18% | 83.33% | 49.26% |
| `main/routes/auth.ts` | 31.09% | 41.07% | 39.13% | 31.09% |

Artifacts: `coverage/lcov.info`, `coverage/coverage-summary.json`

**No coverage threshold gate** — measurement only (M1 acceptance).

Test suites used: `tax-engine`, `security-hardening`, `staff-authz`, `authz-matrix-phase3`, `integration-payments`, `issue-214-payment-integrity`.

---

## 7. CI results

CI workflow updated (`.github/workflows/ci.yml`):

| Step | Status |
|------|--------|
| install | Existing |
| lint | Existing |
| tsc | Existing |
| build:frontend | Existing |
| npm test | Existing |
| **test:m1-gate** | **Added (M1)** |
| **test:coverage:baseline** | **Added (M1)** |
| **coverage artifact upload** | **Added (M1)** |
| Playwright E2E | Existing (separate job) |

CI not re-run on GitHub Actions in this session; local parity verified.

---

## 8. Build results

| Command | Post-M1 |
|---------|---------|
| `npm run build` | PASS |
| `npm run build:frontend` | PASS (pre-M1) |
| `npm run lint:backend` | PASS (806 warnings, 0 errors) |

---

## 9. E2E results

| Spec | Result |
|------|--------|
| `layout-integrity.spec.ts` | PASS |
| `kds-login.spec.ts` | PASS |
| `prepaid-payment-reconciliation.spec.ts` (×2) | PASS |

**Total: 4/4 passed** (13.8s)

---

## 10. Database verification

| Check | Test | Result |
|-------|------|--------|
| Fresh start + migrate v0→v66 | `test:schema-health` | PASS |
| Upgrade from fixture | `test:upgrade-path` | PASS |
| WAL mode | Verified in `main/db.ts` | Unchanged |
| Maintenance lock | `test:database-tools-api` | In full suite PASS |
| Schema v67 | `test:m1-gate` | **Not created** (expected) |

No schema or migration code modified.

---

## 11. Backup/restore verification

| Step | Verification |
|------|--------------|
| CREATE DATABASE | Via test temp dirs |
| CREATE TEST DATA | backup-restore tests |
| BACKUP | `createBackup()` / API paths |
| RESTORE | `restoreBackup()` |
| VERIFY DATA | integrity_check + foreign_key_check |
| START APPLICATION | Reopen DB in tests |

Automated: `npm run test:backup` — **PASS**

Documented procedure: `docs/13-operations/backup-restore.md`

---

## 12. Rollback procedure

Documented in `docs/13-operations/rollback.md`:

- Code revert via git
- Database restore via Settings / API / IPC
- Failed migration recovery via pre-migration auto-backup
- Previous release install from GitHub Releases
- Integrity verification checklist

---

## 13. Pre-existing failures

| Issue | Classification | Mitigation |
|-------|----------------|------------|
| Smoke test fails when port 3001 occupied | **PRE-EXISTING ENVIRONMENT** | Run `npm run clean` before tests |
| Backend lint 806 warnings | **PRE-EXISTING** | Not introduced by M1 |
| Node v24 vs engines `>=22.12.0` | **ACCEPTABLE** | Meets minimum; CI uses Node 22 |
| `npm test \| tail` masks exit code | **OPERATOR ERROR** | Do not pipe test output to `tail` |

No unexplained regressions introduced by M1.

---

## 14. New risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| M1-R1 | Coverage baseline adds ~30s to CI | LOW | Acceptable; artifact optional review |
| M1-R2 | Port conflict causes smoke failure | LOW | Document `npm run clean` in local-setup |
| M1-R3 | Low auth.ts coverage (31%) | INFO | Expected — login paths not fully exercised; expand in M2+ |

---

## 15. Files changed

### M1 REQUIRED (this milestone)

```
.c8rc.json
.github/workflows/ci.yml
.gitignore
package.json
package-lock.json
scripts/run-coverage-baseline.cjs
tests/m1-engineering-gate.test.ts
docs/08-development/development-guide.md
docs/08-development/local-setup.md
docs/09-testing/test-strategy.md
docs/09-testing/test-plan.md
docs/11-devops/ci-cd.md
docs/13-operations/backup-restore.md
docs/13-operations/rollback.md          (new)
docs/04-technology/tech-stack.md        (coverage line only)
docs/15-project-management/milestones.md
docs/15-project-management/task-breakdown.md
docs/15-project-management/technical-debt.md
docs/15-project-management/m1-engineering-baseline.md (this file)
```

### UNRELATED (prior documentation phase — not reverted)

See §4 above.

---

## 16. M1 acceptance criteria

| Criterion | Status |
|-----------|--------|
| Existing baseline recorded | ✅ |
| Test baseline recorded | ✅ |
| Coverage measurable | ✅ |
| CI verified (config + local parity) | ✅ |
| Build verified | ✅ |
| E2E status recorded | ✅ 4/4 |
| Database startup verified | ✅ |
| Backup verified | ✅ |
| Restore verified | ✅ |
| Rollback procedure documented | ✅ |
| No intentional product behavior changed | ✅ |
| No schema v67 created | ✅ |
| No unrelated refactoring | ✅ |
| Documentation updated | ✅ |
| Final tests pass | ✅ |

---

## 17. Final verdict

### **GREEN**

Baseline established with no unexplained regressions. Coverage is measurable on auth/tax/payment critical paths. CI publishes coverage artifacts. Backup/restore and migration safety verified by existing tests. Ready for **M2 (Privacy & consent)** when approved — do not start M2 automatically.

---

## Quick reference — M1 commands

```sh
npm run clean
npm test
npm run test:m1-gate
npm run test:coverage:baseline
```

Coverage output: `coverage/coverage-summary.json`
