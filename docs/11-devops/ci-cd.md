# CI/CD

## CURRENT STATE

### Workflows (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| ci.yml | push/PR to main | Lint, build, test, Playwright |
| release.yml | version tags | Platform installers + GitHub release |
| nightly-release.yml | nightly, push main | Cross-platform build matrix |
| tax-pack-release.yml | tax-pack tags | Sign and publish tax packs |

### CI jobs (ci.yml)
1. dependency-review (PR only)
2. changes (path filter)
3. tax-category-invariant
4. linux-baseline (lint, tsc, build, npm test)
5. e2e-playwright

### Dependabot
`.github/dependabot.yml` — dependency updates

## TARGET STATE
- Add CodeQL workflow
- Coverage report artifact
- RestaurantOS fork-specific CI badges
