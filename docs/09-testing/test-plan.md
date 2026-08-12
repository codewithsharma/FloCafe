# Test Plan

## Regression suite
`npm test` — full sequential suite via `tests/run-test.sh`

## Focused suites
| Command | Scope |
|---------|-------|
| npm run test:smoke | Server startup + login |
| npm run test:security | Security hardening |
| npm run test:upgrade-path | DB migration from fixture |
| npm run test:e2e | Playwright browser tests |
| npm run audit:db | DB integrity walk |

## Pre-release checklist
1. npm run lint
2. npm run build && npm run build:frontend
3. npm test
4. npm run test:e2e
5. Manual smoke on target OS
6. Verify CHANGELOG.md updated

## TARGET additions
- Shift management tests (when implemented)
- Refund workflow tests (when implemented)
