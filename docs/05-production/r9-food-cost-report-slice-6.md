<!-- Last updated: 2026-08-15, schema v83 -->

# R9 Slice 6 — Food-cost Report v1

**Status:** COMPLETE
**Schema:** **v83** (unchanged)
**Suite:** `npm run test:r9.6`
**Authorization:** R9 program governance — development only; live go-live remains **NO-GO**.

## Scope delivered

| Area    | Delivered                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------- |
| COGS    | Theoretical sum of `recipe_consumption_lines.line_cost_cents` for `consumed` rows in UTC window |
| %       | `theoretical COGS / Net Sales` using shared `queryDaySalesSemantics`                            |
| Honesty | Counts lines with null `line_cost_cents` as insufficient                                        |
| API     | `GET /api/reports/food-cost` Owner/Manager                                                      |
| UI      | `/reports` food-cost panel                                                                      |
| RBAC    | Cashier/Waiter/Chef 403                                                                         |

## Explicitly not in Slice 6

Actual vs theoretical BI (R12) · WAC/FIFO · addon BOM · refund recipe reverse · R10+

## OPS-02 truth

Live café validation: **DEFERRED**
Controlled Pilot: **READY WITH CONDITIONS**
Live Go-Live: **NO-GO**
