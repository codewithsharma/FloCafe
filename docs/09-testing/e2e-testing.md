# E2E Testing

## CURRENT STATE

### Playwright
Location: `frontend/e2e/`
Config: `frontend/playwright.config.ts`

| Spec | Tests |
|------|-------|
| kds-login.spec.ts | KDS standalone login + session |
| layout-integrity.spec.ts | POS grid layout, touch targets |
| prepaid-payment-reconciliation.spec.ts | Prepaid decimal totals |

### Server bootstrap
`tests/e2e-server.cjs` — starts API + KDS with seeded data

### Credentials
`manager@flo.local` / `E2ePass123!`

### Run
```sh
npm run test:e2e
```

## TARGET STATE
- POS full checkout flow E2E
- Settings backup/restore smoke
- Multi-browser KDS + POS concurrent test
