<!-- Last updated: 2026-08-15, schema v83 -->

# R9 Slice 5 — Operations Finance Reports v1

**Status:** COMPLETE
**Schema:** **v83** (unchanged)
**Suite:** `npm run test:r9.5`
**Authorization:** R9 program governance — development only; live go-live remains **NO-GO**.

## Scope delivered

| Area     | Delivered                                                       |
| -------- | --------------------------------------------------------------- |
| Sales    | Reuses `queryDaySalesSemantics` Gross/Refunds/Net (UTC window)  |
| Expenses | Posted totals + by-category (`amount_cents`); voided excluded   |
| Compose  | `net_after_expenses` presentation = Net Sales − posted expenses |
| API      | `GET /api/reports/ops-finance`                                  |
| CSV      | `GET /api/reports/export/expenses.csv` + `expense.exported`     |
| UI       | `/reports` ops finance panel + expenses CSV download            |
| RBAC     | Owner/Manager only                                              |

## Explicitly not in Slice 5

Food-cost report (S6) · R12 BI · Gross/Net-in-Z · tax-engine · REAL cutover · ADR-014

## OPS-02 truth

Live café validation: **DEFERRED**
Controlled Pilot: **READY WITH CONDITIONS**
Live Go-Live: **NO-GO**
