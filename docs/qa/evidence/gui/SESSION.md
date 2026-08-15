# GUI Manual Session — 2026-08-15

**Driver:** Cursor browse MCP (real Chromium)  
**Server:** `node tests/run-electron-node-test.cjs tests/e2e-server.cjs`  
**API:** http://localhost:3001 · KDS companion: http://localhost:3002  
**Role tested:** manager (`manager@flo.local`)  
**Not tested this session:** owner / cashier / waiter / chef GUI walkthroughs; Electron native shell; Tables (fixture has `tables_required=false`); Expenses/Audit deep links; responsive breakpoints

## Results

| #   | Flow                              | Result                                    | Evidence                |
| --- | --------------------------------- | ----------------------------------------- | ----------------------- |
| 1   | Login manager                     | **PASS** → `/pos/`                        | `01-pos-login.png`      |
| 2   | Add E2E Coffee to cart            | **PASS** (ref click flaky; coords worked) | `02-pos-cart.png`       |
| 3   | Checkout tax ฿4.20 / total ฿64.20 | **PASS**                                  | `03-checkout.png`       |
| 4   | Cash pay Confirm                  | **PASS** Order `#ORD-20260815-0001` paid  | `04-pos-paid.png`       |
| 5   | Receipt print without printer     | **EXPECTED FAIL** toast + dialog          | `04-pos-paid.png`       |
| 6   | Orders list shows paid order      | **PASS** Completed / Paid / ฿64.20        | `05-orders.png`         |
| 7   | Kitchen via sidebar               | **PASS** ticket in Waiting                | `06-kds.png`            |
| 8   | Hard reload `GET /kds/`           | **FAIL** `Cannot GET /kds/`               | reproduced twice        |
| 9   | Customers empty state             | **PASS**                                  | `07-customers.png`      |
| 10  | Inventory products table          | **PASS** E2E Coffee listed                | `08-inventory.png`      |
| 11  | Reports Gross/Net ฿64.20          | **PASS** cross-module                     | `09-reports.png`        |
| 12  | Operations day-close card         | **PASS** loads                            | `10-operations.png`     |
| 13  | Team staff list                   | **PASS** E2E manager + QR Guest           | `11-team.png`           |
| 14  | Settings sections                 | **PASS**; hard reload OK                  | `12-settings.png`       |
| 15  | KDS standalone login              | **PASS**                                  | `13-kds-standalone.png` |
| 16  | Mark item Preparing               | **PASS** Waiting 0 / Preparing 1          | `14-kds-preparing.png`  |
| 17  | Logout confirm                    | **PASS**                                  | —                       |
| 18  | Invalid login                     | **PASS** “Invalid email or password”      | `15-invalid-login.png`  |

## Defects found

### QA-GUI-KDS-DEEPLINK-01 (P2)

- **Steps:** While authenticated, open `http://localhost:3001/kds/` as a hard navigation (address bar / reload).
- **Expected:** Kitchen Display SPA loads (same as client-side sidebar nav).
- **Actual:** Plain text `Cannot GET /kds/` (HTTP error page, title `Error`).
- **Workaround:** Navigate via sidebar from another dashboard route (client router).
- **Notes:** `/orders/`, `/settings/` hard reloads worked in this session. Likely static-export / Express SPA fallback gap for `/kds` specifically.

### QA-GUI-CLICK-TARGET-01 (P3 / tooling)

- Accessibility-ref clicks sometimes hit wrong Y (dialog Close / header). Coordinate clicks from `getBoundingClientRect()` were reliable.

## Coverage delta vs prior QA pack

| Metric                             | Before               | After this GUI session                           |
| ---------------------------------- | -------------------- | ------------------------------------------------ |
| Live GUI screens exercised         | ~3 (Playwright only) | **~12** manager screens + KDS standalone         |
| Critical dine-in prepaid E2E (GUI) | Playwright only      | **Manual PASS** with DB-visible order + reports  |
| Button/action live coverage        | ~0%                  | Still partial — **NOT** exhaustive button matrix |
| Role GUI coverage                  | 0%                   | **1/5** (manager only)                           |

## Next GUI work remaining

1. Seed/login **cashier, waiter, chef, owner** — allow/deny nav + actions
2. Tables / dine-in table occupy (enable `tables_required`)
3. Fix or characterize **`/kds/` deep-link**
4. Expenses, Audit, Purchasing, Recipes, QR guest UI
5. Electron desktop shell (browse MCP ≠ full Mac Electron control)
