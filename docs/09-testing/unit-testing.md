# Unit Testing

## CURRENT STATE

### Frameworks
- `node:test` + `node:assert` for pure logic (`tax-engine.test.ts`, `currency.test.ts`, `phone.test.ts`)
- Custom assert patterns in Electron runner tests

### Unit-testable modules
| Module | Test file |
|--------|-----------|
| Tax engine | tests/tax-engine.test.ts |
| Tax components | tests/tax-components.test.ts |
| Currency format | tests/currency.test.ts |
| Phone parsing | tests/phone.test.ts |
| Receipt columns | tests/receipt-column-width.test.ts |
| Translations | tests/translations.test.ts |

### Runner
```sh
ts-node --transpile-only -P tests/tsconfig.json tests/<file>.test.ts
# or
node tests/run-electron-node-test.cjs tests/<file>.test.ts
```
