# V1 Role × GUI Matrix — Autonomous QA

**Roles (code authority):** `owner` · `manager` · `cashier` · `waiter` · `chef`  
**Password (e2e QA only):** `E2ePass123!`  
**Emails:** `{role}@flo.local`

| Role    | Login   | Landing (expected) | Dashboard | POS | Tables | Orders | Inventory | KDS | Reports | Settings | Support | Result |
| ------- | ------- | ------------------ | --------- | --- | ------ | ------ | --------- | --- | ------- | -------- | ------- | ------ |
| owner   | PENDING | `/dashboard`       |           |     |        |        |           |     |         |          |         |        |
| manager | PENDING | `/pos`             |           |     |        |        |           |     |         |          |         |        |
| cashier | PENDING | `/pos`             |           |     |        |        |           |     |         |          |         |        |
| waiter  | PENDING | `/support`         |           |     |        |        |           |     |         |          |         |        |
| chef    | PENDING | `/support`         |           |     |        |        |           |     |         |          |         |        |

Legend: ✅ allowed & works · 👁 visible but blocked · ❌ leak (should not access) · — N/A · ⏳ pending

## Nav visibility (runtime)

_Filled during Phase 1 GUI login for each role._

## Restricted action probes

| Action                 | owner | manager | cashier | waiter | chef |
| ---------------------- | ----- | ------- | ------- | ------ | ---- |
| Open shift             |       |         |         |        |      |
| Place order / pay      |       |         |         |        |      |
| Refund                 |       |         |         |        |      |
| Discount               |       |         |         |        |      |
| Stock adjust           |       |         |         |        |      |
| Staff create           |       |         |         |        |      |
| Settings / backup      |       |         |         |        |      |
| KDS bump               |       |         |         |        |      |
| Direct URL `/settings` |       |         |         |        |      |
| Direct URL `/pos`      |       |         |         |        |      |
| Direct URL `/reports`  |       |         |         |        |      |
