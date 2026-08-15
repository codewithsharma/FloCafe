# Foundation Priority Deepen (post–audit-v3)

**Date:** 2026-08-15  
**Status:** COMPLETE (Phase 1) — see Phase 2: `foundation-priority-deepen-phase2.md`  
**Schema:** v81  
**Baseline:** R6 `8e6a8fe`

Addresses `audit-v3/DEV_PRIORITY_VERIFICATION.md` open/partial items before further R-waves.

---

## Scorecard update

| # | Item | After deepen |
|---|---|---|
| 1 | Split `db.ts` | **GREEN progress** — `main/database/migrations.ts` (~2440 LOC); `db.ts` ~4040 (−~37%) |
| 2 | Split `orders.ts` | **GREEN** — `main/routes/orders/{list,create,items,status,mutate,discount,cancel,index}.ts` + thin facade |
| 3 | Drop `any` | **PARTIAL** — money util + settlement types; full &lt;600 target still open |
| 4 | REAL → cents | **Phase 1 DONE** — v81 dual-write columns + `main/lib/money.ts`; REAL retained; no cutover |
| 5 | P1.3 matrix | **CLOSED** for formal matrix (`test:r4.1`); process-kill harness still debt |
| 6 | backup-now PIN | Already DONE |
| 7 | Schema docs | Living docs aligned toward **v80/v81** |
| 8 | Commit R4 tree | Already DONE |
| 9 | Zod coverage | **PARTIAL+** — `validation/categories.ts` wired; purchasing Zod already present |

---

## P0.3 Phase 1 (dual-write)

Additive INTEGER cents on:

- `products.price_cents`, `products.cost_cents`
- `orders.*_cents` money fields
- `order_items.*_cents`
- `bills.*_cents` including `paid_amount_cents` / `balance_cents`

Backfill: `CAST(ROUND(real * 100) AS INTEGER)`.  
Payment tender dual-writes bill paid/balance cents.  
Purchasing receive dual-writes `products.cost_cents`.

**Not done:** drop REAL, force all readers to cents, UI/API contract change.

---

## Regression

Mandatory R1–R6 + H1–H4 + refunds/ledger/backup after this deepen.
