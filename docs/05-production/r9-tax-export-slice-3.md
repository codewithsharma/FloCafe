<!-- Last updated: 2026-08-15, schema v83 -->

# R9 Slice 3 — Tax Reporting Depth + Accountant Export

**Status:** COMPLETE  
**Schema:** **v83** (unchanged — no migration)  
**Suite:** `npm run test:r9.3`  
**Authorization:** Development slice only — does **not** authorize live go-live, signed RC, or OPS-02 site PASS.

## Scope delivered

| Area    | Delivered                                                                        |
| ------- | -------------------------------------------------------------------------------- |
| JSON    | Existing `GET /api/reports/tax-components` via shared `queryTaxComponentsReport` |
| CSV     | `GET /api/reports/export/tax-components.csv` — same aggregator + UTC window      |
| Audit   | `tax.exported` on successful CSV (`entity_type=tax_report`)                      |
| UI      | `/reports` tax-components panel + export (Owner/Manager)                         |
| RBAC    | Owner/Manager allowed; Cashier/Waiter/Chef 403                                   |
| Offline | Local SQLite SoR; no cloud / filing                                              |

## CSV columns (canonical from aggregator)

`start_date,end_date,bill_count,report_tax_amount,component_title,rate,tax_amount`

(`taxable_amount` is not in the aggregator — omitted.)

## Explicitly not in Slice 3

Day-close/Z polish · ops finance reports · food-cost report · GSTR/IRN/e-invoice/filing · tax-engine rewrite · UTC→tenant TZ · REAL cutover · ADR-014 · R9 Slice 4+.

## OPS-02 truth

Live café validation: **DEFERRED**  
Controlled Pilot: **READY WITH CONDITIONS**  
Live Go-Live: **NO-GO**
