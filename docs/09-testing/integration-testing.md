# Integration Testing

## CURRENT STATE

Integration tests spin up real Express servers with temp SQLite databases.

### Key suites
| File | Coverage |
|------|----------|
| integration-happy-path.test.ts | Order→bill→payment |
| integration-payments.test.ts | Payment edge cases |
| integration-tax.test.ts | Tax calculation E2E |
| integration-order-lifecycle.test.ts | Status transitions |
| integration-bill-reconciliation.test.ts | Discount after bill |
| integration-loyalty*.test.ts | Loyalty earn/redeem |
| kds-integration.test.ts | KDS REST + WS |
| backup-restore.test.ts | DB round-trip |

### Helpers
`tests/helpers/test-setup.ts` — server bootstrap, auth helpers

### HTTP client
`supertest` against Express app
