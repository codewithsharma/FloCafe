<!-- Last updated: 2026-08-15, schema tip unchanged (v84+) -->

# R12 — Void / Cancel Report (thin BI deepen)

**Status:** COMPLETE  
**Schema:** **no bump** — reads existing `audit_logs` only  
**Suite:** `npm run test:r12`  
**Authorization:** Development slice only — does **not** authorize live go-live, signed RC, or OPS-02 site PASS.

## Scope delivered

| Area    | Delivered                                                                 |
| ------- | ------------------------------------------------------------------------- |
| JSON    | `GET /api/reports/voids?start_date=&end_date=` summarizing success audits |
| CSV     | `GET /api/reports/export/voids.csv` — same UTC window + rows              |
| Audit   | `report.voids_exported` on successful CSV (`entity_type=void_report`)     |
| Actions | `order.cancelled`, `order.item_cancelled`, `order.item_voided`            |
| UI      | `/reports` voids panel + CSV export (Owner/Manager)                       |
| RBAC    | Owner/Manager allowed; Cashier/Waiter/Chef 403                            |
| Offline | Local SQLite SoR; no warehouse / cloud BI                                 |

## CSV columns

`start_date,end_date,id,created_at,actor_user_id,actor_name,action,entity_type,entity_id,reason,order_id,product_id,product_name,previous_status`

## Explicitly not in R12 thin slice

Advanced BI warehouse · food-cost rebuild (R9.6) · staff performance / hourly trends warehouse · coupons (R11) · schema migration · GSTR/filing.

## OPS-02 truth

Live café validation: **DEFERRED**  
Controlled Pilot: **READY WITH CONDITIONS**  
Live Go-Live: **NO-GO**
