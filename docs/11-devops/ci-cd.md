# CI/CD

> M1 baseline verified. See [`m1-engineering-baseline.md`](../15-project-management/m1-engineering-baseline.md).

## CURRENT STATE

### Workflows (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to `main` | Lint, build, test, coverage, Playwright |
| `release.yml` | version tags | Platform installers + GitHub release |
| `nightly-release.yml` | nightly, push main | Cross-platform build matrix |
| `tax-pack-release.yml` | tax-pack tags | Sign and publish tax packs |

### CI jobs (`ci.yml`)

| Job | Runs when | Steps |
|-----|-----------|-------|
| `dependency-review` | PR only | High-severity dependency check |
| `changes` | Always | Path filter for frontend/backend/kds/db |
| `tax-category-invariant` | Always | `npm run test:tax-engine` |
| `linux-baseline` | Path filter match | lint, tsc, build, `npm test`, M1 gate, coverage |
| `e2e-playwright` | Path filter match | build, Playwright E2E |

### M1 additions (linux-baseline job)

After `npm test`:

1. `npm run test:m1-gate` — verifies coverage tooling + schema v66
2. `npm run test:coverage:baseline` — c8 report for auth/tax/payments
3. Upload `coverage/` artifact (14-day retention)

**No coverage threshold failure** — measurement only.

### Dependabot

`.github/dependabot.yml` — dependency updates

### Local CI parity

Developers can reproduce CI locally:

```sh
npm ci
npx @electron/rebuild -f -w better-sqlite3
npm run lint:backend
npx tsc --noEmit
cd frontend && npm ci && npm run lint && cd ..
npm run build:frontend
npm test
npm run test:m1-gate
npm run test:coverage:baseline
npm run build
cd frontend && npx playwright install chromium && npx playwright test
```

## TARGET STATE

- Add CodeQL workflow
- Optional coverage trend tracking (no arbitrary gates)
