# Opervia — next 10 phases (4.6–4.15)

**Baseline:** Phase 4.5 complete — Retail exchange (`a42493a`) · schema **v75** · ADR-011 / ADR-012 accepted.

**Principle:** one shared commerce platform + vertical composition. Not restaurant-backend + retail-backend.

This roadmap is derived from repository evidence (Phase 4 discovery, feature-list, STRATEGY freezes, `.ai/*`, ADRs, existing APIs). Candidate pool items that are frozen or premature were **rejected**, not deferred quietly into implementation.

---

## Roadmap table

| Phase | Capability                                     | Vertical                             | Risk                         | Schema                         | Money                              | Status       |
| ----: | ---------------------------------------------- | ------------------------------------ | ---------------------------- | ------------------------------ | ---------------------------------- | ------------ |
|   4.6 | ADR-013 Retail product variants / SKU identity | Retail (shared catalog identity)     | Medium (policy)              | NO now (ADR may require later) | NO                                 | **COMPLETE** |
|   4.7 | Restaurant 86 (sold-out) workflow              | Restaurant first; shared `is_active` | Low                          | NO                             | NO                                 | **COMPLETE** |
|   4.8 | Reports multi-day range picker                 | Shared                               | Low                          | NO                             | Read-only                          | **COMPLETE** |
|   4.9 | Customer deactivate lifecycle                  | Shared                               | Low                          | NO                             | NO                                 | **COMPLETE** |
|  4.10 | FIN-01 collectible outstanding display         | Shared                               | Medium (money UX)            | NO                             | Display only — no writes           | **COMPLETE** |
|  4.11 | Inventory on-hand valuation report             | Shared                               | Low                          | NO                             | NO                                 | PENDING      |
|  4.12 | Retail POS fulfillment-type honesty            | Retail                               | Low                          | NO                             | NO                                 | PENDING      |
|  4.13 | Restaurant table merge discovery               | Restaurant                           | Medium                       | TBD                            | TBD (open orders only)             | PENDING      |
|  4.14 | Configurable service charge ADR                | Restaurant (tax infra shared)        | High                         | TBD                            | YES — ADR required                 | PENDING      |
|  4.15 | Wastage stock decrease action                  | Shared                               | Low–medium (inventory write) | NO                             | Inventory write; not tender/refund | PENDING      |

---

## Why these 10

### 4.6 — ADR-013 Retail product variants / SKU identity

- **Why:** `docs/04-product/phase-4.6-retail-product-variants-discovery.md` already exists (2026-08-14). Verdict **ADR REQUIRED**. Catalog is one `products` row = one stock bucket. Typed `variants` stubs are unused. A matrix without identity rules would break ADR-011 restock and ADR-012 exchange.
- **Dependency:** Phase 4.5 complete (identity of sellable `product_id` is now load-bearing).
- **Value:** Locks the only safe variant story before anyone invents a second stock identity.
- **Risk:** Policy disagreement (ops-only Option A vs parent_id hybrid).
- **ADR:** **Yes — this phase IS the ADR.** No matrix implementation. No schema bump.

### 4.7 — Restaurant 86 workflow

- **Why:** Feature-list **PARTIAL** — `products.is_active` exists; `PUT /api/products/:id` already writes it (owner/manager); POS loads `?active=1`. No dedicated floor 86, no cashier path, easy to confuse with stock=0.
- **Dependency:** None on 4.6 (does not need a variant model).
- **Value:** Café floor completeness; Retail keeps using the same flag from Products admin.
- **Risk:** Low if v1 is owner/manager + existing column only.
- **ADR:** No, unless cashiers must 86 without full product PUT (then a tiny availability adapter is still no-schema).

### 4.8 — Reports multi-day range picker

- **Why:** Phase 4.4 shipped `GET /api/reports/export/bills.csv` with `start_date`/`end_date` and a **93-day cap**. UI still exports a **single** selected date. `/summary`, `/sales`, `/tax-components`, `/topProducts` already accept date windows. `.ai/risks.md` records the UX gap.
- **Dependency:** 4.4 complete.
- **Value:** Accountant off-ramp for a week/month without new money math.
- **Risk:** Low (read-only). Do not switch UTC bounds to tenant TZ (that would need ADR).
- **ADR:** No, if UTC half-open window is unchanged.

### 4.9 — Customer deactivate

- **Why:** Phase 3.6E shipped show-inactive + `POST /customers/:id/reactivate`. Deactivate API is **None** (3.6E doc). `PUT` does not write `is_active`. Historical DELETE soft-delete was removed.
- **Dependency:** 3.6E.
- **Value:** Completes the shared customer lifecycle without loyalty/wallet/money changes.
- **Risk:** Low (flag only).
- **ADR:** No.

### 4.10 — FIN-01 collectible outstanding display

- **Why:** `QA-FIN01-STATUS-01` — APIs correctly refuse further pay after gross settlement + refund, but UI may still show `payment_status=partial` / net `balance` > 0. Phase 4 discovery listed this as secondary polish. Rejection behavior must **not** be weakened.
- **Dependency:** FIN-01 closed (gross-tender outstanding).
- **Value:** Operators stop trying to re-collect; reports/orders UI matches payment truth.
- **Risk:** Medium if anyone mutates `bills.payment_status`. **Display-only** keeps it SAFE NOW.
- **ADR:** Required **only** if the phase proposes writing bill status. Default: no ADR, no writes.

### 4.11 — Inventory on-hand valuation report

- **Why:** `products.cost` / `cost_price` exists; Products UI already edits it. Feature-list / Phase 4 matrix: valuation **PARTIAL** (column, no report). Ledger and low-stock hub already shipped.
- **Dependency:** Cost field hygiene is optional; report must label **catalog cost × on-hand**, not WAC/FIFO.
- **Value:** Owner inventory dollar view for both verticals.
- **Risk:** Misleading if cost is stale — mitigate with copy, not a costing engine.
- **ADR:** No, if read-only and no new valuation method.

### 4.12 — Retail POS fulfillment-type honesty

- **Why:** Phase 4.1 hid dine-in when `tables` is off and defaulted takeaway. `CartPanel` still offers **delivery** under Retail (filter is only `type !== 'dine_in'`). Phase 4 discovery: checkout still F&B-shaped.
- **Dependency:** 4.1 composition gates.
- **Value:** Retail POS stops looking like café delivery.
- **Risk:** Low (UI composition). Do not delete delivery for Restaurant.
- **ADR:** No.

### 4.13 — Restaurant table merge discovery

- **Why:** Feature-list **NOT BUILT**. Transfer exists: `POST /api/tables/:id/move-order` **409** if the target already has an active order. Merge is the missing floor op. Combining orders/items can touch bills if either table is settled — **policy first**.
- **Dependency:** Tables module; move-order characterization.
- **Value:** High for dine-in cafés; zero Retail impact if gated.
- **Risk:** Medium (order identity). Discovery only in this phase.
- **ADR:** Produce discovery; ADR if combining billed checks is in scope. **No implementation.**

### 4.14 — Configurable service charge ADR

- **Why:** Feature-list **NOT BUILT** for configurable amount; order create hardcodes `service_charge: 0`. Tax engine **already** has `ChargeTaxKind = 'service_charge'` and receipts already print it when > 0. Wiring it is a **money path**.
- **Dependency:** Tax facade / charge snapshots.
- **Value:** Restaurant check completeness without inventing a tip engine.
- **Risk:** High (bills, tax snapshot, FIN-01, day-close).
- **ADR:** **Yes. This phase is ADR/discovery only.** Tips remain out of scope unless the ADR explicitly includes them (default: **exclude tips**).

### 4.15 — Wastage stock decrease

- **Why:** Feature-list **NOT BUILT**. Manual adjust exists (`POST /products/:id/stock`, actions `set|increase|decrease`, ledger `reason` = action). Wastage can be a **fourth action** that decreases stock with `reason=wastage` — no new `movement_type`, schema **v75**.
- **Dependency:** 3.6C contract (do not add free-text reason; a new enum value is the product feature).
- **Value:** Shared inventory honesty for F&B spoilage and retail write-off.
- **Risk:** Low–medium (inventory write, not tender).
- **ADR:** No, if it stays `adjustment` + `reference_type=manual` (or `wastage`) without new CHECK values that require migration. If CHECK must change → **STOP, ADR + migration** (would block this phase).

---

## Rejected from the candidate pool (do not silently revive)

| Candidate                                                          | Why rejected                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Suppliers / purchase orders / receiving                            | `feature-list` **FROZEN**; STRATEGY ERP procurement; Phase 3.5 closeout **Future**     |
| Recipes / BOM                                                      | **FROZEN**                                                                             |
| Stock transfers / multi-location                                   | ADR-006; single-location; STRATEGY freeze                                              |
| Gift cards / store credit                                          | ADR-012: no store credit v1; new money liability                                       |
| Promotions / segmentation / scheduling                             | No existing backbone; large                                                            |
| Ecommerce / online ordering / aggregators                          | STRATEGY freeze (Swiggy/Zomato/ONDC); online ordering not a SAFE NOW slice             |
| Payment terminals                                                  | STRATEGY freeze                                                                        |
| Advanced BI / payroll / marketing                                  | No platform; not SAFE NOW                                                              |
| Variants **matrix implementation**                                 | Discovery forbids it before ADR-013; 4.6 is the ADR, not the matrix                    |
| Tips as a payment line                                             | No columns; money-path; bundled into 4.14 ADR as **explicit non-goal** unless reopened |
| Phase 3.5B / 3.5C / REAL→cents / P1.6 / Nest / Prisma / extraction | Closed or frozen                                                                       |

---

## Dependency graph

```text
4.6 ADR-013 ──(docs only; does not block product slices)─┐
4.7 86 ──────────────────────────────────────────────────┤
4.8 Reports range ───────────────────────────────────────┤
4.9 Customer deactivate ─────────────────────────────────┼── independently releasable
4.10 FIN-01 display ─────────────────────────────────────┤
4.11 Valuation report ───────────────────────────────────┤
4.12 Retail fulfillment types ───────────────────────────┤
4.13 Table merge discovery ── future merge impl (not in this 10)
4.14 Service charge ADR ── future wiring (not in this 10)
4.15 Wastage action ─────────────────────────────────────┘
```

Auto-advance is **serial** (one ACTIVE phase) even though 4.7–4.12 and 4.15 do not depend on 4.6’s ADR outcome. If 4.6 stops on `ADR_REQUIRED` waiting for a human Accept, a **human override** of `ACTIVE.md` may skip to 4.7. Do not skip `BLOCKED` implementation failures.

---

## Expected value vs risk (summary)

| Safer / shippable in this 10          | Paper / gate in this 10 | Explicitly not in this 10                                         |
| ------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.15 | 4.6, 4.13, 4.14         | PO, variants matrix, tips, terminals, aggregators, multi-location |
