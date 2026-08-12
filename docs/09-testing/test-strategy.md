# Test Strategy

## CURRENT STATE

### Philosophy
- Backend-heavy automated testing (~95 test files)
- Electron ABI test runner for native SQLite module
- Playwright for critical UI paths (3 specs)
- No measured code coverage

### Test pyramid (actual)
```
        [ 3 Playwright E2E ]
       [ ~30 Integration tests ]
      [ ~60 API/unit/backend tests ]
```

### CI gates
- Every PR: lint, tsc, frontend build, full npm test, Playwright
- Nightly: cross-platform electron-builder --dir

### Critical paths requiring tests before merge
| Path | Test suite |
|------|------------|
| Payments | integration-payments, issue-214 |
| Tax | tax-engine, integration-tax |
| Auth | security, authz-matrix-phase3 |
| Migrations | upgrade-path |
| KDS | kds-integration, kds-contract |

## TARGET STATE (RestaurantOS)
- Add coverage reporting (c8) for payment/tax/auth modules
- Expand Playwright to checkout and settings flows
- Hardware-in-loop printer tests (manual checklist)
- Performance baseline for 1000-product catalog
