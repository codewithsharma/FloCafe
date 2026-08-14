# Phase 3.5C — Service Extraction Discovery

**Date:** 2026-08-14  
**Mode:** DISCOVERY ONLY — **no production code changes**  
**Schema:** **v75** — unchanged  
**Prerequisites:** 3.1–3.4 COMPLETE; 3.5A COMPLETE (`5d223e9`); 3.5B DEFERRED (`b5d4de5`)

Related: [phase-2-closeout-and-phase-3-gate.md](phase-2-closeout-and-phase-3-gate.md) §3 / §6, [extraction-readiness.md](extraction-readiness.md), [phase-2.14-order-domain-boundary.md](phase-2.14-order-domain-boundary.md), [phase-2.15-payment-domain-boundary.md](phase-2.15-payment-domain-boundary.md), [phase-3.5-scope-discovery.md](phase-3.5-scope-discovery.md)

**This document is not COMPLETE.** It is a gate, not an implementation plan to execute.

---

## Objective

Evaluate whether Phase 3.5’s optional **“further service extracts”** item has **one narrow, justified** extract that preserves API, DB, transactions, money, tax, vertical isolation, and tests.

Do not extract because a file is large. Do not invent a target. Do not start a package.

---

## Authoritative constraint

Closeout §6 Phase 3.5 allows further extracts **only where coupling is actually blocking**, after 3.1–3.4. Package extraction is **Future** unless readiness + product demand.

Named leftover in closeout §3:

> Further `bills.ts` extract (generate/split/print) — **Polish** — Tender already extracted

Named leftover in `order.ts`:

> Money rollup extraction **deferred**; full facade extraction of create / addItems **deferred**

Option C in `phase-3.5-scope-discovery.md`: “one documented Order/Payment slice.”

---

## Current architecture (relevant)

Already extracted (do not re-extract):

| Domain                    | Service                                          | Route                                    |
| ------------------------- | ------------------------------------------------ | ---------------------------------------- |
| Payment tender            | `payment-tender.ts` (callers keep `withTxn`)     | `bills.ts` HTTP pay                      |
| Refunds                   | `refund.ts` (owns `withTxn`)                     | `refunds.ts` thin                        |
| Inventory writes + ledger | `inventory.ts`                                   | `inventory.ts` read; writes via products |
| Tax calc                  | `tax.ts` + `tax-engine.ts`                       | `tax.ts` thin; packs separate            |
| Shifts                    | `shift.ts` (owns `withTxn`)                      | `shifts.ts` thin                         |
| Day-close                 | `day-close.ts` (owns `withTxn`)                  | `reports.ts` HTTP wrapper                |
| KDS notify                | `kds.ts` (3.4 internal `isModuleEnabled('kds')`) | `kds.ts` HTTP still fat                  |
| Receipt log               | `receipt.ts` (owns small print `withTxn`)        | `bills.ts` print HTTP                    |

Still fat / marker-only:

| Location                 | LOC (approx) | Notes                                                                 |
| ------------------------ | ------------ | --------------------------------------------------------------------- |
| `main/routes/orders.ts`  | ~2524        | Create/add-items/discount/cancel/restore **inside route `withTxn`**   |
| `main/services/order.ts` | ~69          | Ownership **markers only** — no create/cancel functions               |
| `main/routes/bills.ts`   | ~1013        | Generate / split / discount / list still in route `withTxn`           |
| `main/db.ts`             | ~5169        | Mixed infra + KDS projection + sequences — closeout: **Future** split |

Transaction rule used in this discovery: **do not move `withTxn` ownership.** Pattern from Inventory/Payment: callers keep the transaction.

---

## Candidates considered

| Candidate                                      | Current location                                                                      | Responsibility                                 | Callers                                      | Dependencies                                             | Coupling   | Risk                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| **A. Order create / add-items / money rollup** | `orders.ts`                                                                           | Sale lifecycle + Tax + Inventory orchestration | POS, waiter, API                             | Tax, Inventory, KDS, tables, shift                       | HIGH       | Money + **route owns `withTxn`**; explicitly deferred in `order.ts`                                          |
| **B. Bills generate / split / applyDiscount**  | `bills.ts`                                                                            | Bill row + allocation + tax scale              | POS checkout, split-check UI                 | Tax, `generateBillNumber` (nested `db.transaction`), PIN | HIGH       | Money + **route owns `withTxn`**; named Polish leftover                                                      |
| **C. Tables status side-effect helpers**       | Inline SQL in `orders.ts`, `payment-tender.ts`, `held-orders.ts`, `tables.ts`         | Occupy / free / held                           | Order, Payment, Held-orders, Tables CRUD     | `isModuleEnabled('tables')`                              | MEDIUM     | SQL **variants differ** (conditional vs unconditional); isolation tests pin **gate location** in routes      |
| **D. Addon group-limit validation**            | `validateItemAddonGroupLimits` in `orders.ts`                                         | Addon min/max/qty rules                        | Order create + add-items                     | `addons` module / DB                                     | LOW        | Restaurant-only; small; does not shrink money-path coupling                                                  |
| **E. Customer `tag_counts` sync**              | `syncCustomerTagCounts` in `orders.ts`                                                | Best-effort tag aggregates                     | Order create (already **outside** `withTxn`) | customers table                                          | LOW        | ~30 lines; not a documented Order/Payment slice                                                              |
| **F. `getOrderWithItems` bill hydration**      | `bills.ts`                                                                            | Read + split-check display ratio               | GET bill / GET by order                      | `bill_items`, `attachEffectiveAddons`                    | LOW–MEDIUM | Display **money scaling** (`toFixed(2)`); drift risk if “cleaned up”                                         |
| **G. Bills print leftovers**                   | `markPrinted` / `print-history` in `bills.ts`; `printReceipt` already in `receipt.ts` | Print audit                                    | Bills HTTP                                   | `print_logs`                                             | LOW        | `printReceipt` **already owns `withTxn`**; `markPrinted` does **not** — merging would **move txn ownership** |
| **H. `db.ts` split**                           | `main/db.ts`                                                                          | Schema, migrations, sequences, KDS projection  | Entire main process                          | Everything                                               | HIGH       | Closeout **Future**; not narrow                                                                              |
| **I. Package extraction**                      | n/a                                                                                   | npm workspaces                                 | n/a                                          | n/a                                                      | HIGH       | Closeout: only if readiness + demand                                                                         |

---

## Rejected candidates

| Candidate                                | Reason                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Order create / add-items / rollup** | **DEFER — transaction-boundary + money-path risk.** `ORDER_MONEY_ROLLUP_EXTRACTION = 'deferred'` forbids uncharacterized rollup move. Create `withTxn` also wraps stock + ledger + tax snapshots.                              |
| **B. Bills generate / split / discount** | **DEFER — transaction-boundary + money/tax risk.** Generate uses `applyPayableRounding` + nested `generateBillNumber` txn. Split allocates `bill_items`. Discount scales tax. Named leftover is Polish, not a safe 3.5C slice. |
| **D. Addon validation**                  | Real ownership (`addons`) but **justification is file locality / size of a helper**, not blocking coupling. Restaurant-only; extracting it must not appear in Retail. Fails “meaningful coupling reduction.”                   |
| **E. Customer tag sync**                 | Safe mechanically (already outside txn) but **too small** and not a documented extract. Fails criterion 10.                                                                                                                    |
| **F. Bill read hydration**               | Read-only, but **display money math**. Any rewrite of the ratio/`toFixed` path is a semantic change. Not a Payment-domain extract.                                                                                             |
| **G. Print leftovers**                   | Print **core already extracted**. Folding `markPrinted` into `receipt.ts` would introduce `withTxn` where none exists today.                                                                                                   |
| **H. `db.ts` split**                     | Not narrow; Future.                                                                                                                                                                                                            |
| **I. Packages**                          | Premature package extraction.                                                                                                                                                                                                  |
| **KDS HTTP / WS status duplication**     | Dual `withTxn` (route PATCH + WS handler). Moving either changes txn or duplicates further. Notify already gated in 3.4.                                                                                                       |
| **Customers CRUD service**               | Unnamed; no txn; would be a new abstraction without a blocking seam.                                                                                                                                                           |
| **Held-orders CRUD service**             | Tables gate already closed in 3.4; remaining route is appropriately owned.                                                                                                                                                     |
| **POS page coordinator leftover**        | Frontend polish (`phase-2.16`); not a backend service.                                                                                                                                                                         |
| **Event bus for tables/KDS**             | Closeout **Future**.                                                                                                                                                                                                           |

**Rejected justification: “the file is large.”** `orders.ts` (~2524) and `bills.ts` (~1013) are large because they still own money-path `withTxn` blocks. Size is a symptom of deferred money extracts, not a license to move those blocks.

---

## Strongest remaining candidate (C) — coupling analysis

```
orders.ts / payment-tender.ts / held-orders.ts  (callers keep withTxn)
        ↓  isModuleEnabled('tables')
inline UPDATE tables SET status = …
        ↓
SQLite tables row
```

**Inbound:** dine-in occupy; complete/cancel/convert/last-item-cancel free; paid free-on-fully-paid; hold → `held`; delete hold → available **only if** `status = held`.

**Outbound:** none besides `tables` table + module gate.

**Shared state:** `tables.status` also mutated by `tables.ts` CRUD (different HTTP ownership).

**Transaction ownership today:** **callers** (`orders.ts`, `held-orders.ts`, `applyPaymentBatch` inside caller `withTxn`). Must stay there.

**Error/auth:** no dedicated service errors; HTTP auth stays on routes. Table side effects are silent skips when module off.

**Tests:** `restaurant-isolation.test.ts` (behavior + **source grep** that `orders.ts` / `held-orders.ts` contain `isModuleEnabled('tables')`); `held-orders.test.ts`; `payment-without-restaurant.test.ts`; `payment-boundary.test.ts`.

### Why C is still not recommended

1. **SQL is not one function.** Held-orders DELETE uses `AND status = ?`. Unconditional `SET available` would change DB behavior.
2. **Isolation tests pin gate location in the route files.** Moving the gate into a helper without updating those contracts looks like a vertical-safety regression.
3. **Coupling reduction is DRY, not a new domain owner.** Tables HTTP already lives in `tables.ts`. Commerce routes **should** orchestrate table side effects (2.17). An event bus is Future.
4. **Not the documented Order/Payment slice.** Inventing `tables-status.ts` as “the” 3.5C extract violates “do not invent a target.”

**Test coverage if C were forced later:** **YELLOW** — behavioral tests exist; characterization of each UPDATE variant + source-contract update would be required before a move.

---

## Vertical safety

Any extract must remain vertical-agnostic except true restaurant side effects:

| Gate                                | Must preserve                                |
| ----------------------------------- | -------------------------------------------- |
| `ACTIVE_VERTICAL_ID` / process lock | Untouched                                    |
| `isModuleEnabled('tables')`         | Occupy/free/held writes                      |
| `isModuleEnabled('kds')`            | Notify (already inside `kds.ts` + call-site) |
| Inventory capability                | Stock still via Inventory service            |
| Retail                              | Must not gain tables/KDS/addons              |

Candidates A/B would touch money paths shared by Restaurant and Retail — extra reason to refuse.

---

## Transaction safety

| Domain                                                       | Who owns `withTxn` today              | Move in 3.5C?              |
| ------------------------------------------------------------ | ------------------------------------- | -------------------------- |
| Order create/add/status/discount/cancel/restore              | **Route**                             | **No** — DEFER             |
| Bill generate/split/pay/discount                             | **Route** (tender assumes caller txn) | **No** — DEFER             |
| Refund / shift / day-close / inventory adjust / printReceipt | **Service** (already)                 | **No**                     |
| Held-orders                                                  | **Route**                             | Keep if any helper extract |
| Table status UPDATEs                                         | **Inside caller txn**                 | Keep                       |

`generateBillNumber` / `generateOrderNumber` start a **nested** `db.transaction` in `db.ts`. Pulling generate into a new service without characterizing that nest is a hidden DB-behavior change.

---

## Selected candidate

**NONE.**

```text
NO SAFE EXTRACTION FOUND
```

No candidate simultaneously satisfies:

1. Narrow responsibility
2. Clear documented ownership boundary
3. Low coupling
4. Adequate tests without new characterization  
   5–9. No schema / API / money / vertical / txn-boundary change
5. **Meaningful** reduction in architectural coupling

The extracts that would matter (A, B) fail 7 and 9. The extracts that are safe (D, E, leftover print) fail 10 and/or invent a target.

---

## Proposed architecture

**None.** Keep CURRENT:

- Tender / refund / inventory / tax / shift / day-close / KDS notify / receipt log as they are.
- Order create and bill generate remain in routes until a **characterized, callers-keep-`withTxn`** money extract is separately authorized.
- Do not split `db.ts`. Do not add packages.

---

## Rollback

N/A — no implementation.

---

## Acceptance criteria (if a future extract is ever authorized)

A later implementation (not this phase) would need **all** of:

- Callers keep existing `withTxn` (or existing service-owned txn stays put).
- Golden tests: order-boundary, void×cancel stock, payment-boundary, FIN-01, tax-snapshot, restaurant-isolation, synthetic/production retail.
- Source-contract tests updated **with** the move if gate location changes — not silently deleted.
- Each SQL variant preserved (especially held-orders conditional free).
- No schema bump, no API shape change, no REAL→cents, no tax column work (3.5B remains deferred).

---

## Explicit non-goals

- Mode B / DROP of `products.tax_type` / `tax_rate` (3.5B deferred)
- REAL→cents
- Recipes/BOM, suppliers/PO
- npm workspaces / package extraction
- `db.ts` split
- Event bus
- Frontend POS coordinator leftover
- Retail/branding/`audit/` dirty work

---

## Decision

```text
NO SAFE EXTRACTION FOUND
```

**STOP — no implementation.**
