# Development Priority Verification Report

**Date:** 2026-08-15
**Schema version:** v79
**App version:** 3.0.5

## Scorecard

| #   | Priority Item                  | Tier  | Status      | One-Line Evidence                                                       |
| --- | ------------------------------ | ----- | ----------- | ----------------------------------------------------------------------- |
| 1   | Split main/db.ts               | 🔴 T1 | 🔨 PARTIAL  | 6151 LOC (−93); `main/database/{time,order-row}.ts` only; no `main/db/` |
| 2   | Split main/routes/orders.ts    | 🔴 T1 | 🔨 PARTIAL  | 2612 LOC (−231); `orders-shared.ts` + `orders-validation.ts`; still fat |
| 3   | Drop any density (money paths) | 🔴 T1 | ❌ NOT DONE | orders 31`:any`+82`as any`=113; main total 836 (−~7.5% &lt;10%)         |
| 4   | Money REAL → INTEGER cents     | 🟠 T2 | ❌ NOT DONE | P0.3 unchecked; bills/products money cols still REAL                    |
| 5   | P1.3 failure matrix            | 🟠 T2 | 🔨 PARTIAL  | `test:r4.1` covers dup+crash; P1.3 checkbox still open; kill path debt  |
| 6   | Drive backup-now + Master PIN  | 🟠 T2 | ✅ DONE     | `settings.ts:840` `requireMasterPin` on `/google-drive/backup-now`      |
| 7   | Schema version in docs         | 🟡 T3 | 🔨 PARTIAL  | Living core docs → v79; several product/ops/PM docs still v75/v66       |
| 8   | Commit dirty R4 tree           | 🟡 T3 | ✅ DONE     | R4 files tracked in `cbfb264`; tree only has audit-v2 + r6 WIP          |
| 9   | Zod on remaining routes        | 🟡 T3 | 🔨 PARTIAL  | New `validation/recipe.ts`; 27+ route files still without Zod           |

## Summary Counts

- ✅ Done: 2 / 9
- 🔨 Partial: 5 / 9
- ❌ Not Done: 2 / 9
- 🔴 Regressed: 0 / 9

## Key Measurements (before/after)

| File                       | Previous LOC | Current LOC | Change       |
| -------------------------- | ------------ | ----------- | ------------ |
| main/db.ts                 | 6244         | 6151        | −93 (−1.5%)  |
| main/routes/orders.ts      | 2843         | 2612        | −231 (−8.1%) |
| frontend/settings/page.tsx | 6654         | 6654        | 0            |

| Metric                                    | Previous      | Current                                     | Change                      |
| ----------------------------------------- | ------------- | ------------------------------------------- | --------------------------- |
| `: any` in orders.ts                      | (part of 112) | 31                                          | —                           |
| `as any` in orders.ts                     | (part of 112) | 82                                          | —                           |
| Combined any in orders.ts                 | 112           | 113                                         | +1                          |
| Total `any` in main/ (`: any` + `as any`) | ~904          | 836 (492+346)                               | −~68 (−7.5%)                |
| Schema version in code                    | v78           | v79                                         | +1                          |
| Working tree clean?                       | No (R4 dirty) | No (audit-v2/, tests/r6-purchasing.test.ts) | R4 committed; different WIP |

**Other Step 1 recordings**

- `main/db/` folder: **NO**
- Orders split: `main/routes/orders-shared.ts`, `main/routes/orders-validation.ts`; **NO** `main/routes/orders/` folder
- `ACTIVE_VERTICAL_ID` in `.env.example`: lines 20–22 (present, commented)
- Test suite count: **213** `tests/**/*.test.ts`
- Validation dir: `auth.ts`, `inventory.ts`, `orders.ts`, `payments.ts`, `products.ts`, `recipe.ts`, `refund-restock.ts`, `refunds.ts`

## Item-by-Item Detail

### [1] Split main/db.ts

**Status:** 🔨 PARTIAL
**Evidence:** `wc -l main/db.ts` → 6151; `ls main/db/` → `NO main/db/ FOLDER`; `main/database/time.ts` (123 LOC), `main/database/order-row.ts` (133 LOC) exist; latest migration `version: 79` at `main/db.ts:4968`.
**What changed:** Small helper extraction into `main/database/` (~256 LOC); `db.ts` still monolithic (−1.5% only, far below 20%).
**What remains:** No `main/db/` package split; schema/migrations/seeds still inline in `main/db.ts`.

### [2] Split main/routes/orders.ts

**Status:** 🔨 PARTIAL
**Evidence:** `wc -l main/routes/orders.ts` → 2612; `orders-shared.ts` 293 LOC; `orders-validation.ts` 30 LOC; no `orders-create|void|payment|held` files; no `main/routes/orders/` folder; `orders.ts` still owns route handlers (e.g. `router.get('/', …)` at line 66+).
**What changed:** Shared helpers and note validation extracted; LOC down 231.
**What remains:** Original file is not a thin router; create/void/payment/held concerns not split into separate route modules.

### [3] Drop any density (money paths)

**Status:** ❌ NOT DONE
**Evidence:** `grep -c ": any" main/routes/orders.ts` → 31; `grep -c "as any"` → 82 (combined 113 vs prior 112); `find main -name '*.ts' | xargs grep ': any'` → 492; `as any` → 346; combined 836 vs ~904; no `main/types/` or `main/interfaces/`.
**What changed:** Total main/ any down ~7.5% (&lt;10% threshold); orders combined count essentially flat (+1).
**What remains:** N/A (not PARTIAL — reduction is marginal per criteria).

### [4] Money stored as REAL → migrate to integer cents

**Status:** ❌ NOT DONE
**Evidence:** `.ai/tasks.md:41` `- [ ] P0.3 Money representation migration…`; `main/db.ts` CREATE TABLE money cols still REAL (`products.price` ~5210, `bills.total`/`paid_amount` ~5432–5433, `payments.amount` ~5449); `.ai/tasks.md:23` records REAL→cents **STOP**; no `main/services/money.ts` or `main/lib/money.ts`; `Math.round(amount * 100)` still in `payment-tender.ts` / `payment-cash.ts`.
**What changed:** Explicit stop/plan noted in R4.1; shift/cash float already uses `*_cents INTEGER` (unrelated to product/bill money migration).
**What remains:** N/A (schema money columns unchanged; P0.3 unchecked).

### [5] P1.3 Failure Matrix

**Status:** 🔨 PARTIAL
**Evidence:** `.ai/tasks.md:77` still `- [ ] P1.3 Failure/recovery testing matrix`; formal matrix in `docs/05-production/r4-1-foundation-stabilization.md:93–101`; tests in `tests/r4-1-foundation-stabilization.test.ts` lines 145–224 (duplicate pay, logical crash, printer doc pointer); named files `payment-crash-recovery|duplicate-payment|printer-offline.test.ts` **absent**; process-kill mid-txn listed as remaining debt in matrix.
**What changed:** R4.1 added matrix doc + `npm run test:r4.1` scenarios for duplicate + logical crash; printer deferred to H1 suite.
**What remains:** Backlog P1.3 checkbox unchecked; no dedicated crash/duplicate/printer-offline test files; process-kill / full offline-power-token matrix incomplete.

### [6] Drive backup-now without Master PIN

**Status:** ✅ DONE
**Evidence:** `main/routes/settings.ts:837–840` — `router.post('/google-drive/backup-now', requireRole('owner'), requireMasterPin, …)`; middleware at `main/middleware/master-pin.ts:11` `export function requireMasterPin`.
**What changed:** Master PIN middleware added to backup-now (was owner-only).
**What remains:** —

### [7] Schema version in living docs (v75/v66 → current)

**Status:** 🔨 PARTIAL
**Evidence:** Code `version: 79` at `main/db.ts:4968`; updated living docs include `docs/03-architecture/architecture.md:11,42` (v79), `docs/00-product/feature-list.md:1,9` (v79), `capability-matrix.md`, `PRD.md`, `vision.md`, `ops-01`/`ops-02`. Stale living/product/ops examples: `docs/00-product/restaurant-os-blueprint.md` header schema v75; `restaurant-simulation.md` v75; `restaurant-os-offline-contract.md` v75; `docs/13-operations/pilot-runbook.md:55` still says engineering **v75**; `docs/11-devops/ci-cd.md:30` schema v66; many `docs/15-project-management/*` still v66/v70.
**What changed:** Core architecture + product evidence docs aligned to v79.
**What remains:** Multiple living product/ops/PM docs still cite v75 or v66 as current.

### [8] Commit dirty R4 working tree

**Status:** ✅ DONE
**Evidence:** `git ls-files` shows `main/services/inventory-count.ts`, `inventory-units.ts`, `tests/r4-inventory-os.test.ts` tracked; commit `cbfb264 feat: complete R4 Restaurant Inventory OS`; `git status --short` → only `?? audit-v2/` and `?? tests/r6-purchasing.test.ts` (not the prior R4 dirty set).
**What changed:** R4 inventory work committed; prior dirty inventory routes/services cleared from WIP.
**What remains:** —

### [9] Zod on remaining non-core routes

**Status:** 🔨 PARTIAL
**Evidence:** `ls main/validation/` includes new `recipe.ts` (R5, commit `a6ac124`); money Zod extended per R4.1 (`billGenerateBodySchema` etc. used from `main/routes/bills.ts`); routes still without validation/Zod import include (measured): `addon-groups.ts`, `audit-logs.ts`, `categories.ts`, `customers.ts`, `database-tools.ts`, `database.ts`, `kds.ts`, `kds-info.ts`, `kitchen.ts`, `kitchen-stations.ts`, `menu-csv.ts`, `more-apps.ts`, `order-items.ts`, `payment-methods.ts`, `platform.ts`, `pos-info.ts`, `printers.ts`, `reports.ts`, `server-app-info.ts`, `settings.ts`, `shifts.ts`, `staff.ts`, `support-ticket.ts`, `tables.ts`, `tax.ts`, `tax-packs.ts`, `whatsapp.ts`, `index.ts`.
**What changed:** Added `validation/recipe.ts` + money body schemas on bills/orders paths.
**What remains:** Majority of non-core route files still ad-hoc (no `main/validation/` / Zod body validation).

## What To Do Next

Open / partial items in priority order:

1. **T1 #1** — Finish split of `main/db.ts` (meaningful package extraction / &gt;20% LOC reduction).
2. **T1 #2** — Finish split of `main/routes/orders.ts` into concern-based route modules; thin router.
3. **T1 #3** — Reduce `any` on money paths (`orders.ts` &lt;50; main total &lt;600).
4. **T2 #4** — Money REAL → INTEGER cents (P0.3 + migration + cent utility).
5. **T2 #5** — Close P1.3 checkbox; cover remaining failure scenarios (process-kill / full matrix).
6. **T3 #7** — Align remaining living docs to schema v79.
7. **T3 #9** — Zod-cover remaining non-core routes.
