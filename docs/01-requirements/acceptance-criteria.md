# Acceptance Criteria

## CURRENT STATE — Release gates

From `AGENTS.md` and CI:

| Criterion | Verification |
|-----------|--------------|
| Lint passes | `npm run lint` |
| Backend compiles | `npm run build` |
| Frontend exports | `npm run build:frontend` |
| Full test suite | `npm test` |
| Playwright E2E | CI `e2e-playwright` job |
| DB upgrade path | `tests/upgrade-path.test.ts` |
| Security regression | `test:security`, `test:cors`, `test:url-allowlist` |

## Feature acceptance templates

### Order checkout (CURRENT)
- [ ] Order created with correct tax breakdown
- [ ] Bill total matches sum of items + tax - discounts
- [ ] Payment recorded with idempotency
- [ ] Receipt print logged in `print_logs`

### Migration (CURRENT)
- [ ] Fresh install reaches schema v66
- [ ] v1.5.0 fixture upgrades without data loss
- [ ] Pre-migration backup created

## TARGET STATE criteria (PROPOSED)

### Shift management
- [ ] Opening shift records float amount
- [ ] Closing shift reconciles expected vs actual cash
- [ ] Cannot process cash payment without open shift
