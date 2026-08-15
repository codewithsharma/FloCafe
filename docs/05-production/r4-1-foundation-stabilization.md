# R4.1 — Foundation Stabilization

**Date:** 2026-08-15  
**Status:** COMPLETE (with documented STOP on full REAL→cents persistence)  
**Schema:** v79 (unchanged by this slice)  
**Baseline HEAD before slice:** `a6ac124` (R5 already on branch)  
**Suite:** `npm run test:r4.1`

---

## Purpose

Correctness / architecture / money-integrity / validation / release-hygiene.  
**Not** a product feature phase. **No R5 expansion** in this slice (BOM/recipes already present from prior authorized R5 commit; not modified here beyond shared order/db paths).

---

## Audit verification

| Finding | Verified? | Action |
| --- | --- | --- |
| `main/db.ts` ~6k LOC | Yes (~6382 → ~6151 after extraction) | Extracted `database/time.ts`, `database/order-row.ts`; facade re-exports |
| `main/routes/orders.ts` ~2.8k LOC | Yes | Extracted `orders-shared.ts` (~293 LOC helpers) |
| High `any` density | Yes (~921 in `main/`) | Prioritized Zod + money-path typing; full wipe not in scope |
| REAL currency columns | Yes | **STOP** — plan only (see Money) |
| P1.3 matrix incomplete | Partial | Formal scenarios in `test:r4.1` + pointer to H1 printer suite |
| Drive backup-now without Master PIN | Yes | **Fixed** — `requireMasterPin` |
| Stale schema docs (v75/v66) | Yes | Living docs bumped toward **v79** |
| Zod gaps on money routes | Yes | Bill generate + bill discount + order status/discount schemas |

---

## db.ts extraction

**Status:** PARTIAL COMPLETE  

| Module | Role |
| --- | --- |
| `main/database/time.ts` | `now`, UTC/business day bounds, `parseDbTimestamp` |
| `main/database/order-row.ts` | addon snapshot + JSON parse helpers |
| `main/db.ts` | Still owns connection, migrations, backup/restore, schema; re-exports extracted APIs |

**Governance:** further feature work must not grow `db.ts` without extracting the corresponding domain first.

**Remaining:** migrations/schema/backup/restore/connection split (planned; not completed in this slice to avoid restore risk).

---

## orders.ts extraction

**Status:** PARTIAL COMPLETE  

| Module | Role |
| --- | --- |
| `main/routes/orders-shared.ts` | Idempotency, PIN rate limit, addon limits, list hydration |
| `main/routes/orders.ts` | HTTP routes (create/items/status/discount/cancel/restore) |

**Remaining:** split create/status/discount/cancel into `main/routes/orders/*.ts` package (mapped; not fully applied).

---

## Money audit

**Status:** COMPLETE (inventory) — **persistence migration STOPPED**

Currency still stored as SQLite `REAL` on products/orders/bills/order_items (and hybrid `refunds.amount` REAL + `amount_cents` INTEGER).  
Quantities (stock, movements, recipe qty) remain REAL intentionally.  
Shifts cash + recipe cost lines already use integer cents.

**STOP condition (honored):** Full REAL→integer-cents cutover requires dual-write plan (P0.3 / financial contract §F), upgrade fixtures, and human approval. Not applied in R4.1.

### Rounding policy (when migration is authorized)

1. Persist `*_cents INTEGER` alongside REAL during dual-write.  
2. Convert with `Math.round(real * 100)` and record drift report.  
3. Dual-read prefer cents when present.  
4. Cutover only after goldens (pay/refund/tax/discount/recon) pass.  
5. Do not drop REAL until integrity report is clean.

---

## Money `any` reduction

| Scope | Before (approx) | After |
| --- | --- | --- |
| `main/` `\bany\b` | ~921 | ~903 (`BillSettlementRow` / `StoredPaymentLine` on tender/refund; Zod money bodies) |
| Priority paths | payment/refund/discount HTTP | Zod + `BillSettlementRow` / `StoredPaymentLine` |

Remaining high-risk `any`: fat route handlers (`orders.ts`, `bills.ts`), tax engine rows, printer payloads.

---

## P1.3 failure matrix

| Scenario | Result |
| --- | --- |
| Duplicate payment after reconnect | PASS (idempotent replay; one tender line) |
| Payment retry after settled | PASS (400) |
| Logical crash / failed tender (over-card) | PASS (no tender written) |
| Printer failure | Covered by existing H1 suite (referenced) |
| Process-kill mid-`withTxn` | Remaining debt (SQLite txn atomicity assumed; no kill harness) |

---

## Backup Master PIN

**Status:** COMPLETE  

`POST /api/settings/google-drive/backup-now` now requires `requireRole('owner')` + `requireMasterPin`.

---

## Zod validation

**Status:** COMPLETE for prioritized money routes  

- `billGenerateBodySchema`, `billDiscountBodySchema`  
- `orderStatusBodySchema`, `orderDiscountBodySchema`  

---

## Documentation hygiene

Living schema claims updated to **v79** where this slice touched them. Historical phase docs left as snapshots.

---

## Architecture rule

> No new feature may materially increase the responsibility of `main/db.ts`, `main/routes/orders.ts`, or the Settings page without extracting the corresponding domain boundary first.

---

## Regression

See final report. Mandatory R1–R4 and H1–H4 required green.

---

## Out of scope / STOP

- Full REAL→cents schema cutover  
- Complete db.ts / orders.ts package split  
- R5 BOM changes, purchasing, frozen features, Phase 4.16  
