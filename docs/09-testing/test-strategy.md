# Test Strategy

## CURRENT STATE (post-M1)

### Philosophy

- Backend-heavy automated testing (**96+** test files in `tests/*.test.ts`)
- Electron ABI test runner for native SQLite module
- Playwright for critical UI paths (3 specs)
- **Coverage measurable** via c8 on auth/tax/payment critical paths

### Test pyramid (actual)

```
        [ 3 Playwright E2E ]
       [ ~30 Integration tests ]
      [ ~60 API/unit/backend tests ]
```

### M1 coverage baseline

Command: `npm run test:coverage:baseline`

| Module | Test suites |
|--------|-------------|
| `main/services/tax-engine.ts` | `test:tax-engine` |
| `main/routes/auth.ts` | `test:security`, `test:staff-authz`, `test:authz-phase3` |
| `main/middleware/security.ts` | same auth suites |
| `main/routes/bills.ts` | `test:integration-payments`, `test:issue-214` |

Metrics reported: statements, branches, functions, lines (via c8/V8 coverage).

Artifacts: `coverage/lcov.info`, `coverage/coverage-summary.json`

**No coverage threshold gate** — baseline measurement only (M1).

### CI gates

Every PR to `main`:

| Step | Command |
|------|---------|
| Lint | `npm run lint:backend`, frontend lint |
| Typecheck | `npx tsc --noEmit` |
| Build | `npm run build:frontend` |
| Tests | `npm test` |
| M1 gate | `npm run test:m1-gate` |
| Coverage | `npm run test:coverage:baseline` (artifact uploaded) |
| E2E | Playwright (separate job) |

Nightly: cross-platform electron-builder `--dir`

### Critical paths requiring tests before merge

| Path | Test suite |
|------|------------|
| Payments | `integration-payments`, `issue-214` |
| Tax | `tax-engine`, `integration-tax` |
| Auth | `security`, `authz-matrix-phase3` |
| Migrations | `upgrade-path` |
| KDS | `kds-integration`, `kds-contract` |
| Backup/restore | `backup`, `backup-restore-production` |

## TARGET STATE (RestaurantOS M2+)

- Expand Playwright to checkout and settings flows
- Hardware-in-loop printer tests (manual checklist)
- Performance baseline for 1000-product catalog
