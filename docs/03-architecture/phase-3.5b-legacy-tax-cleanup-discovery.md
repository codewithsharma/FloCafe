# Phase 3.5B — Legacy Tax Column Cleanup: Discovery & Safety Gate

**Date:** 2026-08-14  
**Mode:** DISCOVERY ONLY — **no production code changes**  
**Schema:** **v75** (current) — unchanged  
**Prerequisite commits:** Phase 3.5A `5d223e9`; Phase 3.4 `053421e`  
**Closeout:** **DEFERRED** — pending pilot evidence and later architectural/API decision (2026-08-14 human decision). Not Mode B. Not DROP.

Related: [phase-2-closeout-and-phase-3-gate.md](phase-2-closeout-and-phase-3-gate.md) §6, [phase-2.13-product-tax-ownership.md](phase-2.13-product-tax-ownership.md), [phase-3.5-scope-discovery.md](phase-3.5-scope-discovery.md)

---

## 1. Authoritative requirement

| Rank                 | Source                                              | What it says                                                                                                     |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **1 (canonical)**    | `phase-2-closeout-and-phase-3-gate.md` §6 Phase 3.5 | Objective includes **“legacy tax column cleanup”**. Depends on **stable 3.1–3.4 + pilot evidence**.              |
| Debt row (same file) | Legacy `tax_type`/`tax_rate` column cleanup         | **Phase 3 work (late)** — “Forced none/0; **remove after consumer proof**”                                       |
| Ownership            | `phase-2.13-product-tax-ownership.md` §9–16         | Columns classified **LEGACY_COMPATIBILITY**; future: “**Drop or stop returning** … after consumers prove unused” |
| Backlog              | `.ai/tasks.md`                                      | Remaining Phase 3.5 optional item (post-3.5A)                                                                    |

**STRATEGY.md / AGENTS.md:** no specific Phase 3.5B tax-column cleanup requirement.

### What this is NOT

| Workstream                                                 | Relation                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Order/bill `tax_amount` / `tax_snapshot` / `tax_breakdown` | **SNAPSHOT_DATA** — keep; not cleanup targets                               |
| `order_items.tax_type`                                     | **Line effective behavior** from Tax engine — not product legacy            |
| Tax packs / categories                                     | Shipped platform; orthogonal                                                |
| Phase 2.11 snapshot freeze                                 | Done; opposite of removal                                                   |
| P0.3 REAL→cents                                            | Separate, docs-only until approved                                          |
| FIN-01                                                     | Payment outstanding vs gross tender — does **not** read product tax columns |

---

## 2. Candidate fields (only)

| Field               | Current purpose                                                             | Authoritative?                |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| `products.tax_type` | Pre–tax-pack product tax mode; now **forced `'none'`** on create/update/CSV | **No** — LEGACY_COMPATIBILITY |
| `products.tax_rate` | Pre–tax-pack product rate; now **forced `0`**                               | **No** — LEGACY_COMPATIBILITY |

**Authoritative product tax config (do not touch in 3.5B):** `products.tax_category_id`, `products.tax_behavior`.

**Schema version:** **v75**. Migrations **v36/v37** added category/behavior + snapshot columns. **No migration drops** `tax_type`/`tax_rate`. Ideal schema in `main/db.ts` still defines them on `products`.

---

## 3. Data-flow map

```
products.tax_type / tax_rate
  writers: products.ts POST/PUT (forced none/0), menu-csv.ts import, seeds/tests
  readers: products.ts SELECT → API JSON; FE Product type (unused in UI);
           tax.ts Product interface declares fields but calculateItemTax ignores them
  money path: NOT used for order/bill totals, refunds, day-close, FIN-01
```

| Field                                  | Writers                                                                        | Readers                                                                                 | Authoritative?     | Safe to remove?                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| `products.tax_type`                    | `main/routes/products.ts` INSERT/UPDATE; `main/routes/menu-csv.ts`; test seeds | Product API SELECT/response; FE `types.ts` (no UI reads); ignored by `calculateItemTax` | No                 | **Not yet** — API still returns; dual-write continues; boundary tests assert none/0 |
| `products.tax_rate`                    | Same                                                                           | Same                                                                                    | No                 | **Not yet** (same)                                                                  |
| `products.tax_category_id`             | products, menu-csv, tax-packs, FE forms                                        | Tax calc, packs, FE, CSV                                                                | **Yes**            | **No**                                                                              |
| `products.tax_behavior`                | products, menu-csv, FE                                                         | Tax calc, CSV                                                                           | **Yes**            | **No**                                                                              |
| `order_items`/`orders`/`bills` `tax_*` | Order/bill money path                                                          | Reports, printing, cloud SUM(tax_amount), FE breakdowns                                 | **Yes** (snapshot) | **No**                                                                              |
| `order_items.tax_type`                 | Engine effective behavior on line                                              | Inclusive/exclusive rollups                                                             | **Yes** (line)     | **No**                                                                              |

### Checklist answers (Tasks 1.1–1.13)

1. **Columns:** `products.tax_type`, `products.tax_rate` only for this cleanup label.
2. **Purpose:** Upgrade compatibility placeholders (forced none/0).
3. **Writers:** Product create/update + menu CSV + fixtures.
4. **Readers:** Product list/detail API; type declarations; **not** tax calculation.
5. **Authoritative?** No.
6. **Reports?** No (reports use bill/item snapshot tax).
7. **Refunds?** No.
8. **Day-close?** No.
9. **Exports?** Menu CSV does **not** export these; cloud sales uses `bills.tax_amount`.
10. **API?** Yes — still selected and returned on products.
11. **Frontend?** Types only; product form components do not reference `.tax_type`/`.tax_rate`.
12. **Drop migrations?** None exist.
13. **Schema version:** v75.

---

## 4. Money-path safety

| Concern                      | Impact of removing product legacy columns only                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Order / bill totals          | **None** if calc continues via category/behavior + packs                                                   |
| Tax calculation              | **None** — already ignores product legacy columns (`tax.ts` comment ~L427–430; `tests/tax-engine.test.ts`) |
| Payment / refund / FIN-01    | **None** — FIN-01 uses `bill.total` + `payment_details` gross tender                                       |
| Day-close                    | **None**                                                                                                   |
| Financial reports / printing | **None** (use snapshot columns)                                                                            |
| Historical bills             | **None** if order/bill snapshot columns untouched                                                          |
| REAL→cents                   | **Out of scope** — must not be bundled                                                                     |

**Risk that remains:** a DROP or API-shape change without consumer proof can break clients/tests/upgrade paths even if money math is unchanged.

---

## 5. Schema decision (Task 4)

Cleanup is **underspecified** as one of:

| Mode                                                           | Classification                          | Allowed under Task 4 gate?                                                          |
| -------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Keep columns; continue force none/0 (status quo)               | A                                       | N/A — not cleanup                                                                   |
| Stop dual-write and/or stop returning fields; **keep columns** | **B** Code-only                         | Possible _after_ ADR + consumer proof                                               |
| `ALTER TABLE` DROP columns                                     | **C** New migration (+ **E** API break) | **STOP** — needs explicit approval beyond this discovery                            |
| Backfill historical product rows                               | **D**                                   | Not required for force-none/0 (already written); DROP would need upgrade-path proof |

**If DROP (C/E) is chosen → STOP per Task 4.** Do not implement in this phase without a separate architectural approval.

**Migration / backup / rollback (if DROP were ever approved later):**

- Additive-only history to date; DROP is first destructive tax-column change since packs.
- Upgrade-path + `schema-health` + backup/restore must prove old DBs and restored backups still open.
- API clients expecting `tax_type`/`tax_rate` keys break.
- Rollback: restore DB from backup or re-ADD columns (values lost unless dual-kept).

---

## 6. Compatibility audit

| Scenario                                  | Assessment                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh DB                                  | Columns exist in ideal schema; forced none/0 on write                                                                                                |
| Existing / upgraded DB                    | Columns retained through v75; upgrade tests preserve legacy values then prove they do **not** drive tax until categorized                            |
| Backup/restore                            | Columns present in dumps; DROP would change restore shape                                                                                            |
| Old bills / refunds / reports             | Use snapshot tax — **independent** of product legacy columns                                                                                         |
| Restaurant / Retail                       | Shared `product`+`tax` modules; cleanup is vertical-neutral **if** limited to product legacy fields                                                  |
| “Meaning of financial records unchanged?” | **YES** for money math if only product legacy fields change and snapshots untouched. **NO clear YES** for API/schema DROP without consumer inventory |

---

## 7. Verdict

### PHASE 3.5B REQUIRES ARCHITECTURAL DECISION

**Why not READY:**

1. Closeout depends on **pilot evidence**; P1.6 remains human/ops gated.
2. Docs allow **two incompatible scopes**: “stop returning” (B) vs “drop columns” (C+E).
3. **Consumer proof incomplete:** API still returns fields; FE unused ≠ all consumers unused (forks, scripts, tests).
4. Task 4 hard-stop: anything beyond A/B (especially DROP) must not proceed from this discovery alone.
5. Expanding into snapshot/`tax_breakdown` “legacy path” or REAL→cents would violate money-path non-negotiables.

**Why not DEFERRED-only:** The work item is real and scoped to two non-authoritative columns; a human can choose a **code-only** slice after pilot/consumer proof without schema DROP. That choice is the decision — not “never.”

### Decisions required before any implementation

1. **Mode:** B only (stop return / stop write, keep columns) **vs** C+E (DROP) **vs** defer until after live pilot.
2. **Consumer proof artifact:** grep + contract tests + explicit “API may omit `tax_type`/`tax_rate`” approval.
3. Confirm **no** REAL→cents, snapshot, or report changes in the same change set.

---

## 8. Provisional acceptance criteria (only if Mode B later approved)

Not an implementation authorization — planning sketch for Mode B:

- Product create/update/CSV still persist authoritative `tax_category_id` / `tax_behavior`.
- Tax engine goldens unchanged (uncategorized → no tax regardless of leftover column values).
- Historical bills/refunds/day-close/FIN-01/report tax-components unchanged.
- `test:product-tax-boundary`, `test:tax-engine`, `test:tax-boundary`, upgrade-path, Restaurant/Retail isolation remain green.
- **No** schema version bump; **no** DROP.
- Rollback: revert commit (columns still present).

**If Mode C (DROP) is ever proposed:** separate ADR + migration plan + API deprecation window — out of scope for a “small Phase 3.5B” until approved.

---

## Final gate (discovery)

```text
PHASE 3.5B REQUIRES ARCHITECTURAL DECISION
```

**STOP — no implementation.**

---

## 9. Closeout — human decision (2026-08-14)

**DEFER Phase 3.5B until pilot evidence.**

| Item                              | Status                                |
| --------------------------------- | ------------------------------------- |
| Schema                            | **v75** — unchanged                   |
| `products.tax_type`               | **Remains**                           |
| `products.tax_rate`               | **Remains**                           |
| API contract                      | **Unchanged** (fields still returned) |
| Writers                           | **Unchanged** (still forced none/0)   |
| Readers                           | **Unchanged**                         |
| Migration                         | **NONE**                              |
| Tax semantics                     | **Unchanged**                         |
| Historical financial records      | **Untouched**                         |
| Mode B (stop-return / stop-write) | **Not chosen**                        |
| DROP (separate ADR + migration)   | **Not chosen**                        |

Future work, if ever authorized after pilot evidence, remains a later choice between Mode B and DROP. This closeout does not pick either.

```text
PHASE 3.5B DEFERRED
```
