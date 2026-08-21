# P18 Deep Audit

**Status:** COMPLETE (audit + implementation)  
**Implementation:** `docs/qa/P18-ORDER-IDEMPOTENCY-IMPLEMENTATION-REPORT.md`  
**Date:** 2026-08-21  
**Branch:** `restaurant-vertical`  
**HEAD:** _(see implementation report)_  
**Schema tip:** **v88**  
**Live pilot:** **NO-GO** (unchanged)  
**Production code modified (audit phase):** **NONE**; implementation authorized separately

### Implementation resolution (2026-08-21)

| Gap                                           | Resolution                                 |
| --------------------------------------------- | ------------------------------------------ |
| P18-GAP-001 Order create Idempotency optional | **FIXED** — required on create + add-items |
| P18-GAP-002 Matrix Planned lag                | Deferred (docs)                            |
| P18-GAP-003 Durable POS queue                 | Deferred (out of scope)                    |
| P18-GAP-004 Phase C XSS/JWT                   | Deferred                                   |
| P18-GAP-005 REAL→cents                        | Deferred                                   |
| P18-GAP-006 Consumptions UI                   | Deferred                                   |
| P18-GAP-007 Soft FK                           | Deferred                                   |
| P18-GAP-008 Offline KDS matrix                | Deferred                                   |
| P18-GAP-009 R16 human gates                   | Unchanged — human track                    |

Suite: `npm run test:p18` (merge tier).

---

## Executive Summary

After five consecutive engineering harden waves (P13–P17), Operavia Restaurant is **engineering-ready with conditions** and **live Go-Live NO-GO** for human/ops reasons only (signed/notarized RC, OPS-02 site drills, Master PIN escrow, executive sign-off).

P18 must **not** invent a greenfield product OS. The highest _organizational_ priority is **R16 / OPS-02** (not a code phase). The highest _evidence-backed engineering_ residual that still fits a controlled harden slice is **mandatory order-create Idempotency-Key** (parity with payment keys; closes P17 GAP-009 double-order / double-consume on keyless retry).

**Recommended P18 (if engineering is authorized before/alongside R16):**

> **ORD-IDEM-HARDENING — Order Create Idempotency Hardening**

**Alternative valid decision:** do not authorize P18 code yet; execute R16 human gates first. Either is acceptable. Shipping another feature wave does **not** flip Live GO.

P18 relationship to production readiness: **Unrelated** (feature harden) / R16 is **Blocking**.

---

## Current Baseline

| Field                                      | Value                                                             |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Branch                                     | `restaurant-vertical` (clean; ahead of origin by P13–P17 commits) |
| Tip                                        | `9e0cda3`                                                         |
| Schema                                     | **v88**                                                           |
| P13                                        | COMPLETE — `test:data-audit`                                      |
| P14                                        | COMPLETE — `test:p14` (52)                                        |
| P15                                        | COMPLETE — `test:p15` (34)                                        |
| P16                                        | COMPLETE — `test:p16` (47); commit `3cb3806`                      |
| P17                                        | COMPLETE — `test:p17` (42); commit `2d89064`                      |
| Critical / inventory / void-cancel / audit | PASS (post-P17 regression)                                        |
| Build                                      | TypeScript PASS; Frontend PASS                                    |
| Production                                 | **NO-GO**                                                         |

Authoritative SoT:

| Role             | Path                                                |
| ---------------- | --------------------------------------------------- |
| Product plan     | `docs/00-product/capability-matrix.md` (~320 rows)  |
| Code evidence    | `docs/00-product/feature-list.md` (stamp lag)       |
| QA catalog       | `docs/qa/FEATURE-INVENTORY.md`                      |
| Execution memory | `.ai/context.md`, `.ai/tasks.md`, `.ai/risks.md`    |
| Wave sequencing  | `docs/00-product/restaurant-os-roadmap.md` (R0–R16) |

---

## P13–P17 Verification

| Phase | What it closed                                                                | Must not re-open as “new gap”          |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------- |
| P13   | Mutation audit atomicity deepen                                               | Critical missing money audits          |
| P14   | Order-status CAS; payment≠cancel overwrite; POS sticky-attempt hygiene        | Already-shipped conflict CAS           |
| P15   | Sensitive-action PIN/tender/LAN/Drive audits                                  | Sensitive-action controls Existing     |
| P16   | Sale/recipe CAS floors; cancel/void/refund **SKU** policy tests               | Inventory CAS / restaurant restock 403 |
| P17   | `cost_cents` prefer; FE BOM; recipe CAS/atomic/idempotency; recipe↔P16 policy | Recipe stack rebuild; addon BOM; WAC   |

Verified residuals **left intentionally** (not regressions):

- Order create Idempotency-Key **optional** (P17 GAP-009)
- Menu SKU + recipe dual deduct **documented intentional**
- Soft FK on recipe ingredients **deferred** (migration)
- Offline Conflict / App restart / Offline KDS remain **🟡 Hardening**
- Audit / Data integrity remain **🟡** (deny-triggers deferred)
- Live Go-Live **NO-GO** (R16)

---

## Product Capability Map

Evidence-backed summary (not a full 320-row reprint):

### Platform — largely 🟢 Existing

Auth/JWT, RBAC (`requireRole`), settings, backup/restore paths, corrupt-DB fail-closed (R14), Electron sandbox Phase A/B, WS Origin+payload (P2), LAN `network_mode`, cloud sync outbox (non-blocking). Residuals: CSP+JWT Phase C; cleartext LAN; Master PIN 4-digit.

### POS — 🟢 Existing + 🟡 Hardening residuals

Orders, cart, lifecycle, tables (R2), taxes, coupons (R11), prepaid/split, modifiers/addons. Hardening: void order, discounts, receipt generation. Matrix lag: void item / item notes / 86 / partial pay still marked Planned though largely shipped.

### Inventory — 🟢 Existing (R4/R5/R6/P5/P16/P17)

Stock, ledger, adjust, wastage, counts, low stock, auto-86, recipes+consume, valuation, suppliers/PO/receive. Deferred: typed ledger, reserved_qty, transfers, returns, WAC/FIFO.

### Finance — 🟢 Existing (R9)

Payments (manual tenders), expenses, tax export, day-close/Z, cash recon (shift-gated), ops-finance, food-cost report, audit UI. Live readiness still gated by OPS-02 drills.

### Workforce — 🟢 Existing (R8)

Staff/roles/shifts/roster. Attendance/payroll Planned/Out of scope.

### CRM — 🟢 Existing (R7)

Customers, notes, segments, loyalty integrate. Gift cards/campaigns Later/Planned.

### Ordering — 🟢 Existing thin (R10)

QR pay-at-counter. Online payment **Frozen**. Aggregators **Frozen**.

### Multi-location — 🔴 Frozen

### Integrations — mixed

Print queue (R13) + health (P10) Existing; WhatsApp Existing; terminals/gateways **Frozen**.

---

## Feature Inventory Reconciliation

| Source            | Finding                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Matrix            | ~320 rows; prefer Hardening; many Planned rows **lag** shipped code (86, cash drawer, partial pay, modifier groups, void item, item notes) |
| FEATURE-INVENTORY | Existing + Hardening catalog for QA; P5–P17 notes present                                                                                  |
| feature-list.md   | Stamp lag (historical PARTIAL claims) — do not rebuild                                                                                     |
| `.ai`             | Schema tip in prose sometimes stale (v87 mention); P17 COMPLETE accurate                                                                   |
| P3 backlog        | After KDS-H-OUTBOX → Auto-86 → reports → alerts → sensitive actions — **largely executed** as P4–P15                                       |

**Do not inflate Missing.** Most “missing” Planned rows are Later/Frozen or matrix lag.

Approximate posture for **meaningful pilot capabilities** reviewed this audit:

| Class                  |                                                           Count (approx.) | Notes                   |
| ---------------------- | ------------------------------------------------------------------------: | ----------------------- |
| 🟢 Existing            |                                  majority of POS/Inv/Finance/CRM/KDS core | Do not rebuild          |
| 🟡 Partial / Hardening |                                 ~16 matrix Hardening + API-only thin gaps | Prefer next eng         |
| 🔴 Missing (real)      | supplier returns; durable POS mutation queue; mandatory order Idempotency | Few                     |
| ⚫ Broken              |                                                none newly proven post-P17 | FE BOM was fixed in P17 |
| 🔵 Planned             |                                                    ~71 matrix; many stale | Authorize only          |
| ⚪ / 🔴 Out of scope   |                                     multi-location, gateways, payroll, AI | Closed                  |

---

## Production Gate Analysis

Live **NO-GO** because:

1. Signed/notarized RC **BLOCKED** (no identities; adhoc signature)
2. OPS-02 site drills **PENDING HUMAN/SITE**
3. Master PIN escrow **PENDING**
4. Backup/restore café DR + policy approval **PENDING**
5. Executive / pilot sign-off **PENDING**
6. Written JWT/CSP residual acceptance (or Phase C) **required for live**

Classification: **Signing + Ops + Governance** — not an open product P0 defect list.

| Work                                       | vs Live gate                             |
| ------------------------------------------ | ---------------------------------------- |
| R16 / OPS-02 / signed RC                   | **Blocking**                             |
| P18 Order Idempotency (recommended)        | **Unrelated** (integrity polish)         |
| Phase C XSS/JWT                            | **Indirect** (live acceptance condition) |
| REAL→cents cutover                         | **Indirect**                             |
| Addon BOM / multi-location / profitability | **Unrelated** / Frozen-Later             |

**P18 must not be sold as the path to Go-Live.**

---

## Order Idempotency

**Problem:** `POST /api/orders` **accepts** `Idempotency-Key` but does **not require** it (`orderIdempotencyKey` → `null`). Payment **requires** the key.

**Current:** POS FE usually sends a stable key (`checkout-coordinator` + localStorage fingerprint). Keyless or unstable-key clients (or cleared storage + retry) create a **new order** → new `order_item_id`s → **second menu stock decrement** (if tracked) + **second recipe consume**.

**Expected (harden):** Server rejects order create/add-items without valid Idempotency-Key (parity with payment/stock adjust/PO receive), with tests for keyless reject + keyed replay.

| Aspect                | Verdict                                                                         |
| --------------------- | ------------------------------------------------------------------------------- |
| Real production risk? | **Yes (P1 residual)** — mitigated on happy-path POS; hole is server optionality |
| Duplicate payment?    | **Low** — payment key mandatory                                                 |
| Duplicate KDS?        | Follows duplicate order                                                         |
| Severity              | **P1** ops/integrity — P17 GAP-009                                              |

---

## Menu SKU / Recipe Deduction

**Intentional dual ledger**, not a bug:

- `decrementTrackedStock` → menu SKU `sale` when `track_inventory=1`
- `consumeRecipeForOrderItem` → ingredient BOM consume

Documented in R5 / P16 / P17. Misconfiguration risk if operators treat finished-good SKU as both tracked sellable and ingredient without understanding. **Not a P18 rebuild.**

---

## Foreign-Key Integrity

`recipe_ingredients.ingredient_product_id` has **no SQL FK** to `products` (FK only to `recipes`). Soft-delete / orphan → consume 404 / JOIN drop. **P2**; formal FK needs migration → **stop** unless authorized. Same soft-FK pattern exists elsewhere by design in SQLite evolution — do not mass-add FKs in P18.

---

## Cancel / Void / Refund

Matches **P16/P17 policy** (encoded in tests):

| Event                     | SKU restore    | Recipe reverse |
| ------------------------- | -------------- | -------------- |
| Partial pending cancel    | No             | No             |
| Void                      | No (write-off) | No             |
| Full cancel / last-item   | Yes            | Yes            |
| Restaurant refund restock | 403            | No             |

**Policy ambiguity residual:** served-item soft-cancel, cashier void UX — P15/P16 noted; not P0 integrity. Do not invent new policy in P18.

---

## Offline / Reconnect

| Layer                              | State                                   |
| ---------------------------------- | --------------------------------------- |
| KDS outbox + FE backoff            | P4 **shipped**; matrix still 🟡         |
| Order-status CAS / payment guard   | P14 **shipped**                         |
| POS sticky attempts                | Partial (prepaid/postpaid)              |
| General durable POS mutation queue | **Missing**                             |
| Cloud sync outbox                  | Existing (non-blocking; not POS replay) |
| Device/DR failure recovery         | Planned / not claimed                   |

---

## KDS

Core + alerts + outbox **Existing/shipped**. Matrix Offline KDS / recovery remain Hardening (soak, no per-client ACK, mutate-intent not in server outbox). **Not** the highest next slice vs order idempotency.

---

## Payments

Manual tenders Existing; gateways Frozen; duplicate payment protection **strong** (mandatory Idempotency-Key). UPI verification deferred. Gaps are Frozen/Later, not P18.

---

## Finance / Reconciliation

Engineering **PASS WITH CONDITIONS** (R9). Day-close/Z/cash recon exist; cash Z empty when shifts disabled (operator confusion **P2**). Live finance readiness = OPS-02 drills, not more report surfaces.

---

## Procurement

R6 **Existing**: suppliers, PO, receive, CAS, idempotency, UI. Missing: returns/debit notes, auto-reorder, WAC — **Later / deepen later**, not forced P18.

---

## Multi-location

**Frozen.** Out of scope for P18.

---

## API / GUI Parity

| Mismatch                                  | Class             |
| ----------------------------------------- | ----------------- |
| Chef recipes read API vs O/M GUI          | Intentional (P17) |
| Consumptions list API, no UI              | Deferred thin UX  |
| Ledger-check API-only                     | P3                |
| Manager rush / table transfer API-thin UI | P2 ops UX         |

---

## UX Findings (material only)

- Matrix lag confuses “what’s shipped” for operators/docs — reconcile docs, don’t rebuild UI
- Consumptions API without list UI — optional thin read-only
- Day-close cash clarity when shifts off — operator education / polish
- No redesign recommended in P18

---

## Security Findings (remaining; do not duplicate P15)

| ID     | Finding                                    | Sev                |
| ------ | ------------------------------------------ | ------------------ |
| XSS-01 | CSP `'unsafe-inline'` + JWT `localStorage` | P1 Phase C         |
| LAN-01 | Cleartext JWT on `kds_lan`/`lan`           | P1 accept-with-ops |
| PIN-01 | Master PIN 4-digit; in-memory lockout      | P1 deferred        |
| WS-01  | Pre-auth connect window                    | P2                 |

---

## Data Integrity Findings

| Path                                      | Status                                 |
| ----------------------------------------- | -------------------------------------- |
| Order→pay→inventory→recipe in `withTxn`   | Sound under production call sites      |
| Keyless order retry                       | **Hole** → duplicate side effects      |
| Partial cancel / void / restaurant refund | Intentional write-off policy           |
| REAL + cents dual-write                   | Prefer-cents readers; cutover deferred |
| Audit append-only                         | Convention; no deny triggers           |

---

## Performance Findings

No new P0 perf defects proven in this audit. Residual classes (unbounded reports, N+1) remain general hygiene — not sufficient alone to define P18.

---

## Test Coverage

Strong: money, cancel/void/stock, recipe (r5/p17), inventory CAS (p16), conflict (p14), sensitive actions (p15), audit (p13), critical tier.

Gaps (test vs feature):

- **No** assert that order create **without** Idempotency-Key is rejected (because it isn’t)
- Offline/Electron/printer HW still CONDITIONAL in GUI QA
- Matrix “workflow tests” Planned rows ≠ missing automated suites (many exist under other names)

---

## Schema Assessment

**Recommended P18 (order Idempotency):** **v88 compatible** — reuse existing order idempotency store; no migration expected.

| Candidate                  | Schema                                       |
| -------------------------- | -------------------------------------------- |
| Order Idempotency harden   | v88 YES                                      |
| POS durable mutation queue | likely new tables → **STOP** if unauthorized |
| Soft FK enforcement        | migration → **STOP**                         |
| REAL drop                  | migration / data plan → separate authorize   |
| Addon BOM / multi-location | out of scope + migration                     |

---

## Remaining Risks

### P0 (ops / go-live — not eng feature)

- Signed RC missing
- OPS-02 unmarked
- Master PIN escrow / café restore proof
- Exec sign-off

### P1 (engineering)

- Order create Idempotency optional (duplicate order/stock/recipe)
- XSS/JWT Phase C
- No durable POS offline mutation queue
- REAL cutover deferred
- Cleartext LAN JWT (ops accept)

### P2

- Soft FK orphans; consumptions UI; forward LWW without `expected_status`; print double-retry; audit deny-triggers; day-close shifts-off cash Z; R6 returns; matrix Planned lag

---

## Concrete Gaps

### P18-GAP-001 — Order create Idempotency-Key optional

- **Problem:** Keyless retry creates new order + double stock/recipe
- **Evidence:** `main/routes/orders-shared.ts` `orderIdempotencyKey`; `create.ts` optional branch; P17 GAP-009
- **Current:** Accept without key
- **Expected:** Require key (payment parity) + replay tests
- **Severity:** P1
- **Business impact:** Duplicate tickets / inventory loss on lost-response retry
- **Files:** `orders-shared.ts`, `orders/create.ts`, `orders/items.ts`, FE clients, tests
- **Schema:** none
- **Action:** Harden (recommended P18)
- **Test:** keyless 400; keyed replay; no double consume

### P18-GAP-002 — Matrix Planned lag vs shipped code

- **Problem:** 86, cash drawer, partial pay, void item, notes still Planned while Existing in inventory
- **Severity:** P2 docs
- **Action:** Docs reconciliation slice (can be parallel; not code P18)
- **Schema:** none

### P18-GAP-003 — No durable POS mutation sync queue

- **Problem:** Restart/offline beyond sticky payment attempts incomplete
- **Severity:** P1–P2 (scope risk)
- **Action:** Separate authorize; likely schema
- **Schema:** likely required → stop without auth

### P18-GAP-004 — CSP + JWT localStorage (Phase C)

- **Problem:** XSS→API
- **Severity:** P1 security
- **Action:** Design spike / Phase C — not silent P18 expand
- **Schema:** none

### P18-GAP-005 — REAL→cents cutover deferred

- **Problem:** Dual columns; prefer-cents readers
- **Severity:** P1 architecture debt
- **Action:** Explicit money-path authorize; migration plan
- **Schema:** migration likely

### P18-GAP-006 — Consumptions API without UI

- **Problem:** Operator cannot browse consumptions list
- **Severity:** P2/P3
- **Action:** Optional thin UI; defer
- **Schema:** none

### P18-GAP-007 — Soft FK recipe ingredients

- **Problem:** Orphans after product soft-delete
- **Severity:** P2
- **Action:** Defer; FK needs migration
- **Schema:** migration

### P18-GAP-008 — Offline KDS matrix still Hardening

- **Problem:** P4 shipped; matrix not promoted; residual ACK gaps
- **Severity:** P2
- **Action:** Soak + docs promote or thin deepen
- **Schema:** none for promote

### P18-GAP-009 — R16 human gates open

- **Problem:** Live NO-GO
- **Severity:** P0 ops
- **Action:** Human R16 — **not P18 code**
- **Schema:** none

---

## P18 Candidate Ranking

### #1 — Order Create Idempotency Hardening (`ORD-IDEM-HARDENING`)

|                   |                                                              |
| ----------------- | ------------------------------------------------------------ |
| Business value    | High — prevents duplicate tickets/inventory on retry         |
| Technical value   | High — closes known P17 residual; payment parity             |
| Current           | Key accepted; POS usually sends; server optional             |
| Gap               | GAP-001                                                      |
| Risk              | Low if scoped to require+replay+client audit                 |
| Dependencies      | Existing `order_idempotency` path                            |
| Schema            | **v88**                                                      |
| Complexity        | S–M                                                          |
| Production impact | Indirect integrity; does not clear NO-GO                     |
| Why now           | Highest integrity hole after P13–P17; fits harden discipline |
| Why not now       | If org prioritizes only R16 humans this week                 |

### #2 — Matrix / docs reconciliation (Planned→Existing)

|                 |                                    |
| --------------- | ---------------------------------- |
| Business value  | Med (clarity)                      |
| Technical value | Low code                           |
| Gap             | GAP-002                            |
| Schema          | none                               |
| Why now         | Prevents roadmap drift             |
| Why not now     | Docs-only; can pair with any phase |

### #3 — Phase C XSS/JWT (CSP nonce + token storage)

|                 |                                    |
| --------------- | ---------------------------------- |
| Business value  | High for live trust                |
| Technical value | High / design-heavy                |
| Gap             | GAP-004                            |
| Complexity      | M–L                                |
| Why now         | Live acceptance residual           |
| Why not now     | Needs design spike; easy to expand |

### #4 — POS durable offline mutation queue

|                |                                            |
| -------------- | ------------------------------------------ |
| Business value | High for flaky LAN                         |
| Gap            | GAP-003                                    |
| Schema         | likely required                            |
| Why not now    | Scope risk; stop if migration unauthorized |

### #5 — REAL→cents cutover

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| Business value | High long-term integrity                               |
| Gap            | GAP-005                                                |
| Schema         | migration                                              |
| Why not now    | Explicit money authorize; upgrade-path tests mandatory |

---

## Recommended P18 Scope

### Feature ID

`ORD-IDEM-HARDENING`

### Feature name

Order Create Idempotency Hardening

### Problem

Order create/add-items allow missing `Idempotency-Key`, enabling duplicate orders and double inventory/recipe consumption on retries. Payment already requires the key.

### Current behavior

Optional key; replay only when present; POS usually sends stable keys.

### Expected behavior

- Require `Idempotency-Key` on order create and add-items (and document QR/public paths explicitly)
- Same-key + same-body → replay
- Same-key + different body → 409
- Missing/invalid key → 400 with stable code
- FE clients audited to always send stable keys (POS, Server App)
- Tests prove no double stock/recipe on retry

### Affected modules

Orders HTTP, orders-shared idempotency helpers, POS/checkout clients, possibly QR create policy decision (document: public QR may keep separate token-scoped idempotency)

### Affected files (expected)

- `main/routes/orders-shared.ts`
- `main/routes/orders/create.ts`
- `main/routes/orders/items.ts`
- `frontend/src/lib/pos/checkout-coordinator.ts` / `pos/page.tsx`
- Server App order create if unstable keys
- `tests/p18-*.test.ts` (new) + extend issue-214 / p17 regressions

### API impact

Stricter: missing key becomes 400 (breaking for undisciplined API clients — intentional)

### Frontend impact

Verify/fix any client omitting or regenerating keys per attempt

### Database impact

**None expected** (v88)

### Security impact

Reduces duplicate mutation surface; still server-authoritative actor

### Audit impact

Preserve existing `order.created` audits; no false success

### Test impact

Dedicated `test:p18`; regression p14–p17, r5, critical, payment integrity

### Dependencies

P14 conflict behavior preserved; P16/P17 inventory/recipe semantics unchanged

### Explicitly out of scope

- Addon BOM, profitability, WAC/FIFO, multi-location
- Durable full offline mutation queue (GAP-003)
- Phase C CSP/JWT rewrite
- REAL column drop
- Soft FK migration
- Restaurant refund restock enablement
- R16 signing/ops
- P19

### Acceptance criteria

- [ ] Order create without Idempotency-Key → 400
- [ ] Add-items without key → 400 (if in scope)
- [ ] Keyed retry → single order; single stock/recipe effect
- [ ] Payment + P16/P17 suites still green
- [ ] Schema remains v88
- [ ] Docs + feature inventory updated
- [ ] No P19 / no Frozen revival

### Recommended implementation order

1. RED tests (keyless reject + replay + no double consume)
2. Require key in create/add-items
3. Audit FE/Server App key stability
4. QR policy note (require or document exception)
5. Regression p13–p17 + critical
6. Implementation report

---

## Explicitly Deferred

- R16 signed RC / OPS-02 / escrow / sign-off (human)
- Phase C XSS/JWT
- POS durable offline queue
- REAL→cents cutover
- Soft FKs / typed ledger / reserved_qty
- Consumptions UI / chef read GUI
- Supplier returns
- Addon BOM / margin OS / actual-vs-theoretical BI
- Multi-location / gateways / aggregators / payroll
- Matrix doc reconciliation (can be parallel docs PR)

---

## Acceptance Criteria

(See Recommended P18 Scope.) Plus organizational: **human review before any implementation.**

---

## Proposed Test Plan

1. Create without `Idempotency-Key` → 400 + code
2. Create with key → 201; replay same key/body → 200 replay; stock/recipe once
3. Same key different body → 409
4. Add-items key discipline
5. Regression: `test:p14` `test:p15` `test:p16` `test:p17` `test:r5` `test:critical` payment integrity
6. Confirm schema tip 88

---

## Stop Condition

This audit is complete. **Implementation is NOT STARTED.**

Next step: **human review** — either:

1. Authorize **P18 ORD-IDEM-HARDENING**, or
2. Hold engineering phases and execute **R16 / OPS-02** first, or
3. Authorize a different ranked candidate (Phase C / docs reconcile) with a new prompt

Do **not** start P19. Do **not** modify production code from this audit.

---

## Appendix — Git Baseline

```text
git status          → clean
git branch          → restaurant-vertical
git log -5          → 9e0cda3, 2d89064, d6d1357, dd137f4, 3cb3806
schema tip          → v88
production diff     → ZERO (audit docs + .ai memory only)
```
