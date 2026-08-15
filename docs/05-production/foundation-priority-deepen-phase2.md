# Foundation Priority Deepen — Phase 2

**Date:** 2026-08-15  
**Status:** COMPLETE  
**Schema:** v81 (unchanged — no REAL drop, no cutover migration)  
**Baseline:** Foundation Phase 1 `8db82ec`  
**Predecessor:** `docs/05-production/foundation-priority-deepen.md`

Completes remaining foundation debt authorized by `audit-v3/DEV_PRIORITY_VERIFICATION.md` before R7.  
**Does not start R7.** Does not implement new Restaurant OS domains. Does not touch Retail / Phase 4.16 / frozen features.

---

## Baseline (start of Phase 2)

| Area | Baseline |
|---|---|
| `main/db.ts` | ~4061 LOC after Phase 1 migrations extract |
| `orders.ts` | Thin facade + concern modules (Phase 1) |
| TypeScript `any` | ~906 main / ~115 orders |
| P0.3 money | Phase 1 dual-write columns only; readers mostly REAL |
| P1.3 | Functional matrix closed; process-kill harness open |
| Zod | Core money routes + categories; many non-core routes unvalidated |

---

## Work completed

### 1. P0.3 Phase 2 — reader migration + dual-write consistency

- Extended `main/lib/money.ts`: `preferCents`, bill/product helpers, `orderTotalCents`, `dualFromMajor` / `dualFromCents`.
- **Writers dual-write REAL + `*_cents`:** order create/items/discount/cancel, bills generate/resync/split/discount, products create/update, payment tender + refund (Phase 1 retained).
- **Readers prefer `*_cents` with REAL fallback:** payment settlement, refunds, bill generate inputs, recipe consumption unit cost, reports day-window gross/net aggregates (`COALESCE(*_cents, ROUND(real*100))`).
- **Not done (explicit):** drop REAL columns; force UI/API cents-only contracts.

### 2. TypeScript `any` reduction (priority paths)

| Scope | Before | After | Target |
|---|---|---|---|
| `main/` (typed `any` patterns) | ~906 / ~748 mid | **~577** | &lt;600 |
| `main/routes/orders/` | ~115 | **~14** | &lt;50 |

Focus: auth user helpers, catch `unknown`, settlement row types, money/mutation routes. No global meaningless rewrite.

### 3. Process-kill / crash-mid-transaction harness

- `tests/helpers/process-kill-worker.cjs` — child `BEGIN IMMEDIATE`, mutates, never commits, hangs until SIGKILL.
- `tests/process-kill-recovery.test.ts` + `npm run test:process-kill`.
- Scenarios: payment bill update, inventory stock + ledger insert, purchase-adjacent product cost/stock update.
- Evidence: after SIGKILL, parent reopens DB and asserts full rollback (status/paid/stock/movements/cost unchanged).

### 4. Zod expansion

- Middleware: `validateParams` / `validateQuery` beside `validateBody`.
- New schemas: `validation/{staff,tables,shifts,kds,payment-methods,settings}.ts`.
- Wired: staff, tables (list/create/update/status), shifts (list/open/close/force-close), settings discount/kds/loyalty, payment-methods, KDS pairing/item status/priority.

### 5. Documentation

- This Phase 2 deliverable.
- Living context/schema references remain on **v81**.
- Historical phase documents not rewritten.

### 6. `db.ts` / `orders.ts`

- No further blind split of `db.ts` (still ~4061; migrations already extracted).
- Orders facade left intact (no re-refactor).

---

## Files / modules changed (representative)

| Area | Paths |
|---|---|
| Money | `main/lib/money.ts`, `main/routes/orders/{create,items,discount,cancel}.ts`, `main/routes/bills.ts`, `main/routes/products.ts`, `main/routes/reports.ts`, `main/services/{payment-tender,refund,recipe-consumption}.ts` |
| Typing | `main/routes/orders-shared.ts`, order concern modules, priority catch/`any` cleanups |
| Zod | `main/middleware/validate.ts`, `main/validation/*`, wired routes |
| Tests | `tests/money-cents-phase2.test.ts`, `tests/process-kill-recovery.test.ts`, `tests/helpers/process-kill-worker.cjs`, `package.json` scripts |
| Docs | this file; `.ai/*` living notes |

`audit-v2/` and `audit-v3/` remain untracked artifacts (not committed).

---

## Tests

| Suite | Script / file |
|---|---|
| Money Phase 2 goldens | `npm run test:money-cents` |
| Process-kill recovery | `npm run test:process-kill` |
| Foundation R4.1 | `npm run test:r4.1` |
| R1–R6 | `test:r1` … `test:r6` |
| H1–H4 | respective `test:h*` |
| Refunds / ledger / backup / authz / isolation | focused suites as in AGENTS verification matrix |

---

## Migration safety

- Schema remains **v81**.
- Additive `*_cents` columns only; REAL retained.
- Dual-write keeps REAL and cents consistent on mutation paths.
- Prefer-cents readers fall back when cents NULL (legacy / pre-dual-write rows).
- No silent rewrite of financial totals beyond documented `toCents` / `Math.round(major*100)` fallback.
- SQLite remains local source of record; offline-first unchanged; no cloud dependency introduced.

---

## REAL / cents compatibility strategy

1. **Write:** always set REAL + matching `*_cents` together via `dualFromMajor` (or cents-first tender paths).
2. **Read:** `preferCents(cents, major)` — integer cents win; else convert REAL.
3. **Reports:** SQL `COALESCE(*_cents, CAST(ROUND(real*100) AS INTEGER))` then present major units as today.
4. **Future cutover (not this phase):** stop writing REAL → backfill audit → drop REAL in a dedicated migration with upgrade-path tests.

---

## Process-kill recovery evidence

| Scenario | Mutation in open txn | After SIGKILL |
|---|---|---|
| Payment | bill → paid / balance 0 | unpaid, paid 0, balance restored (REAL + cents) |
| Inventory | stock −5 + movement row | stock restored; no orphan movement |
| Purchase-adjacent | stock + cost/cost_cents change | stock + cost unchanged |

Harness uses real process kill, not thrown exceptions.

---

## Zod coverage expanded

Priority non-core surfaces now shape-validated at the HTTP boundary (params/query/body as applicable). Domain rules remain in services. No second validation framework.

---

## Remaining debt

| Item | Notes |
|---|---|
| Drop REAL / final money cutover | Explicit future phase; blocked until dual-write proven in pilots |
| `db.ts` further extracts | Only when a bounded concern is clear; do not blind-split |
| Broader `any` (printers/thermal/KDS extras) | Below target already; optional cleanup |
| Zod on remaining settings/business/tax/cloud bodies | Second pass |
| Full purchase-receive kill via PO service path | Covered at product mutation layer; deeper PO txn optional |

---

## Final foundation scorecard

| Area | Before Phase 2 | After Phase 2 | Status |
|---|---|---|---|
| `db.ts` split | Migrations extracted; ~4061 LOC | Unchanged (no unsafe further split) | GREEN hold |
| `orders.ts` split | Facade + modules | Unchanged | GREEN |
| Drop `any` | ~906 / orders ~115 | **main ~577 / orders ~14** | GREEN |
| REAL → cents | Phase 1 dual-write | **Phase 2 prefer-cents + dual-write writers** | GREEN (cutover deferred) |
| P1.3 process-kill | Open debt | **Harness + tests** | GREEN |
| Zod coverage | Partial | **Staff/tables/shifts/KDS/settings/payment-methods** | GREEN+ |
| Schema docs | v81 living | v81 living + this Phase 2 doc | GREEN |

---

## R7 readiness recommendation

**YES — foundation is ready for R7 authorization**, with these constraints:

- Do not drop REAL or change money API contracts in R7.
- Do not grow `db.ts` / `orders.ts` / Settings without extracting boundaries first (R4.1 governance).
- Keep FIN-01, RBAC, audit, idempotency, CAS, refund, KDS, inventory, recipe, and purchasing invariants under regression when R7 lands.

**STOP:** Do not start R7 in this change set.
