# Test Plan

## M1 engineering baseline (CURRENT)

Before any RestaurantOS product milestone (M2+):

```sh
npm run clean
npm run lint
npm run build
npm test
npm run test:m1-gate
npm run test:coverage:baseline
```

See [`m1-engineering-baseline.md`](../15-project-management/m1-engineering-baseline.md) for recorded results.

## Regression suite

`npm test` — full sequential suite via `tests/run-test.sh`

**Note:** Run `npm run clean` first if Flo Cafe desktop app is running (occupies port 3001).

## Focused suites

| Command | Scope |
|---------|-------|
| `npm run test:smoke` | Server startup + login |
| `npm run test:security` | Security hardening |
| `npm run test:upgrade-path` | DB migration from fixture |
| `npm run test:backup` | Backup + restore |
| `npm run test:coverage:baseline` | c8 on auth/tax/payments |
| `npm run test:m1-gate` | M1 tooling verification |
| `npm run test:e2e` | Playwright browser tests |
| `npm run audit:db` | DB integrity walk |

## Database safety verification

| Step | Test |
|------|------|
| Fresh migrate | `test:schema-health` |
| Upgrade path | `test:upgrade-path` |
| Backup | `test:backup` |
| Restore | `test:backup` (production restore path) |

## Pre-release checklist

1. `npm run lint`
2. `npm run build && npm run build:frontend`
3. `npm test`
4. `npm run test:coverage:baseline`
5. `npm run test:e2e`
6. Manual smoke on target OS
7. Verify CHANGELOG.md updated

## TARGET additions (M2+)

- Shift management tests (when implemented)
- Refund workflow tests (when implemented)
