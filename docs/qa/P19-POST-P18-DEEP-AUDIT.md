# P19 Post-P18 Deep Audit

**Status:** COMPLETE (audit only — implementation NOT STARTED)  
**Date:** 2026-08-21  
**Branch:** `restaurant-vertical`  
**HEAD:** `faf3b70` (P18 hash fill) · P18 code `ea61ac9`  
**Schema tip:** **v88**  
**Live pilot:** **NO-GO** (unchanged)  
**Production code modified:** **NONE**

---

## Executive Summary

After six consecutive engineering harden waves (P13–P18), Operavia Restaurant is **engineering-ready with conditions**. Live Go-Live remains **NO-GO exclusively for human/ops/signing reasons** (signed RC, OPS-02 site drills, Master PIN escrow, executive sign-off). No engineering P19 feature clears those gates.

**Recommended P19 outcome:**

> **P19 ENGINEERING HOLD** — complete **R16 / OPS-02** first.

**If** a parallel engineering slice is later authorized while humans execute R16, the highest-value contained harden is:

> **QR-ORD-IDEM — Public QR order create Idempotency** (extend P18 to guest create; **v88 compatible**).

Do not force another feature wave for momentum. Do not start durable offline queues, Phase C CSP/JWT, or REAL→cents as P19 without separate explicit authorization.

---

## Current Baseline

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Branch     | `restaurant-vertical` (clean; ahead of origin) |
| Tip        | `faf3b70`                                      |
| P18        | COMPLETE — `ea61ac9`; `test:p18` 46 PASS       |
| Schema     | **v88**                                        |
| P13–P17    | COMPLETE (prior commits)                       |
| Production | **NO-GO**                                      |

Authoritative SoT unchanged: capability matrix, FEATURE-INVENTORY, `.ai/*`, R0–R16 roadmap.

---

## P13–P18 Verification

| Phase | Closed                                            | Do not re-open                         |
| ----- | ------------------------------------------------- | -------------------------------------- |
| P13   | Mutation audit atomicity                          | Critical missing money audits          |
| P14   | Order-status CAS; sticky payment attempts         | Already-shipped conflict CAS           |
| P15   | Sensitive-action PIN/tender/LAN/Drive             | Sensitive-action Existing              |
| P16   | Sale/recipe CAS; cancel/void/refund SKU policy    | Inventory CAS / restaurant restock 403 |
| P17   | Recipe cost_cents; BOM FE; CAS/atomic/idempotency | Recipe rebuild / addon BOM             |
| P18   | Mandatory staff create/add-items Idempotency-Key  | Staff create keyless path              |

**Intentional residuals (not regressions):** QR create keyless; cancel/discount keys optional; durable POS queue missing; Phase C deferred; REAL cutover deferred; R16 human gates open.

---

## Production Readiness Recheck

| Blocker                       | Type                    | Can P19 eng solve?                          |
| ----------------------------- | ----------------------- | ------------------------------------------- |
| Signed/notarized RC           | Signing                 | **NO**                                      |
| OPS-02 site drills            | Ops                     | **NO**                                      |
| Master PIN escrow             | Ops/security governance | **NO**                                      |
| Café backup/restore DR proof  | Ops                     | **PARTIAL** (eng suites ≠ site)             |
| Backup policy + exec sign-off | Business                | **NO**                                      |
| JWT/CSP written acceptance    | Security governance     | **PARTIAL** (acceptance doc ≠ Phase C code) |

Evidence: `docs/05-production/r16-production-release-blocker.md`, `docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`, `.ai/tasks.md` open R16 item.

**Engineering vs Live:** Engineering CONDITIONAL GO / pilot-ready with conditions. Live **NO-GO**.

---

## Candidate A — QR Idempotency

**State:** Staff create/add-items protected (P18). Public `POST /api/public/qr/orders` has **no** Idempotency-Key.

**Evidence:**

- `main/services/qr-ordering.ts` — stock + recipe in `withTxn`; no key store
- `frontend/src/app/qr/page.tsx` — no key; `submitting` flag only
- Soft guard: `assertTableCanOpen` → 409 when table already has active order (tables module on)
- Actor: `usr-system-qr-guest`

**Risk:** Lost-response / retry after table freed → second order + second stock/recipe. Concurrent double-submit mostly blocked by occupancy when tables enabled. Tables off → true double-create.

**Severity:** **P1** (not P0 while tables occupancy mitigates naive double-click).

**Schema:** **NONE** — reuse `order_idempotency` with guest/synthetic `user_id` + sticky FE key (same pattern as P18).

**Fit for contained phase:** **YES** — if eng resumes.

---

## Candidate B — Durable Offline Mutation Queue

**State:** Local-first = Electron + local SQLite API. Sticky `localStorage` prepaid/postpaid attempts (P14). **No** IndexedDB mutation queue. React Query `mutations.retry: 0`. Cart in-memory.

**Severity:** P1–P2 under `:3001` down / true browser offline — **not** the product’s primary offline contract.

**Classify:** Full queue = **major architecture** (likely new tables). Thin sticky-key deepen ≠ full queue.

**Schema:** Migration **likely** for full queue → stop without authorize.

**P19?** **NO** as default — too large; P18/audit already deferred.

---

## Candidate C — Phase C Security

**Residuals:** CSP `'unsafe-inline'` (`http-observability.ts`); JWT in `localStorage` (`auth.ts`); cleartext LAN JWT (ops accept); Master PIN 4-digit + in-memory lockout.

**Severity:** **P1** eng residual; Master PIN escrow is **P0 ops**.

**Classify:** Real CSP+HttpOnly = **major**. Written residual acceptance = governance, not feature code.

**P19?** **NO** as silent code phase — design spike or written acceptance only.

---

## Candidate D — REAL / Cents Precision

**State:** Dual-write + `preferCents` readers (P0.3 Phase 1–2). Create still major→cents. Inventory qty REAL (P16 accepted).

**Proven money bug:** **None reported** (production-readiness docs).

**Schema:** Cutover **requires migration** + upgrade-path tests.

**P19?** **NO** — theoretical cleanliness; XL; needs explicit money authorize.

---

## Candidate E — Remaining Mutation Idempotency

| Surface          | Key                     | Natural guard                                     | Sev |
| ---------------- | ----------------------- | ------------------------------------------------- | --- |
| Order cancel     | Optional                | Status at target + CAS; recipe reverse idempotent | P2  |
| Item cancel/void | None                    | `already_cancelled`; void no restock              | P2  |
| Discount         | Optional; FE fresh UUID | Tender 409; rewrite + duplicate audit if keyless  | P2  |

**P19?** Thin deepen possible; **lower priority** than QR create (stock/recipe create risk) and **far below** R16.

---

## Candidate F — KDS Durable State

**State:** P4 `kds_delivery_outbox` + FE backoff shipped. Matrix still 🟡 Offline KDS. Residuals: no per-client ACK; chef pending PATCH in `sessionStorage` only.

**Severity:** **P2**. Ticket SoR remains SQLite.

**P19?** Soak + docs promote preferred over rebuild.

---

## UX / API Parity Findings

| Gap                                        | Class                      |
| ------------------------------------------ | -------------------------- |
| QR keyless create                          | P1 integrity (Candidate A) |
| Consumptions API no UI                     | P2/P3 deferred             |
| Chef recipes API ≠ GUI                     | Intentional (P17)          |
| Matrix Planned lag (86, cash drawer, etc.) | Docs maintenance — not P19 |

No generic UI polish phase recommended.

---

## Data Integrity Findings

| Flow                               | Post-P18                                         |
| ---------------------------------- | ------------------------------------------------ |
| Staff order create/add-items retry | Protected (P18)                                  |
| QR create retry                    | Residual P1                                      |
| Cancel restock                     | Guarded by status/CAS; recipe reverse idempotent |
| Payment                            | Mandatory key (unchanged)                        |
| Restaurant refund restock          | Still 403 by policy                              |

---

## Test Coverage Findings

| Area                             | Gap                                      |
| -------------------------------- | ---------------------------------------- |
| QR double-submit / lost-response | Missing (feature gap + test gap)         |
| Staff create keyless             | Closed by P18                            |
| Offline durable queue            | N/A (not built)                          |
| Phase C                          | Policy/tests elsewhere                   |
| Cancel sticky key FE             | Partial (R1 keyed paths; FE often omits) |

---

## Feature Inventory Reconciliation

- POS-01 updated for P18 mandatory keys — accurate.
- Matrix still marks some shipped rows Planned (86, cash drawer, partial pay) — **docs lag**, maintenance task.
- Offline Conflict / App restart / Offline KDS remain 🟡 Hardening — accurate residual posture.
- Do not invent Missing for Frozen (multi-location, gateways).

---

## Performance Findings

No new P0 perf defects. Unbounded reports / reconnect storms remain general hygiene — not P19 definition.

---

## Remaining Risks

### P0 (ops / go-live)

- Unsigned RC; OPS-02 unmarked; Master PIN escrow; exec sign-off

### P1 (engineering residual)

- QR create keyless (duplicate order/stock/recipe after table free / tables-off)
- XSS + JWT localStorage (Phase C)
- No durable POS mutation queue (major if pursued)
- REAL cutover deferred (no proven money bug)

### P2

- Cancel/discount optional keys / FE non-sticky
- KDS ACK / session pending PATCH
- Soft FK orphans; matrix Planned lag; print double-retry

---

## P19 Gap Register

### P19-GAP-001 — QR/public order create keyless

- **Problem:** Guest create can duplicate order + stock + recipe on retry after occupancy clears / tables off
- **Evidence:** `qr-ordering.ts`; `qr/page.tsx`; P18 exception
- **Severity:** P1
- **Schema:** NONE (reuse `order_idempotency`)
- **Action:** Contained eng slice **if** authorized after/alongside R16
- **Test:** Double-submit, lost-response replay, fingerprint conflict

### P19-GAP-002 — R16 human gates open

- **Problem:** Live NO-GO
- **Severity:** P0 ops
- **Schema:** none
- **Action:** **Human R16 / OPS-02** — primary next program
- **Eng solve?** NO

### P19-GAP-003 — Phase C CSP + JWT storage

- **Severity:** P1
- **Schema:** none for CSP; session redesign multi-surface
- **Action:** Written acceptance or design spike — not silent P19

### P19-GAP-004 — Durable POS offline mutation queue

- **Severity:** P1–P2 scope
- **Schema:** likely MIGRATION
- **Action:** Defer; stop without authorize

### P19-GAP-005 — Cancel/discount optional Idempotency-Key

- **Severity:** P2
- **Schema:** NONE
- **Action:** Thin deepen later; natural guards cover stock

### P19-GAP-006 — REAL→cents cutover

- **Severity:** architecture debt
- **Schema:** MIGRATION REQUIRED
- **Action:** Explicit money authorize only; not P19 default

### P19-GAP-007 — KDS matrix still Hardening / no per-client ACK

- **Severity:** P2
- **Schema:** NONE for promote
- **Action:** Soak + docs

### P19-GAP-008 — Matrix Planned vs shipped lag

- **Severity:** P3 docs
- **Action:** Maintenance PR — not a feature phase

---

## Candidate Ranking

### #1 — ENGINEERING HOLD / R16–OPS-02 (program)

|                    |                                       |
| ------------------ | ------------------------------------- |
| Business value     | Highest — unlocks live café           |
| Integrity value    | N/A (ops)                             |
| Production impact  | **Blocking**                          |
| Schema             | none                                  |
| Why now            | Only path to Live GO                  |
| Why not “code P19” | Eng cannot sign RC or run site drills |

### #2 — QR-ORD-IDEM (if eng continues)

|                 |                                                         |
| --------------- | ------------------------------------------------------- |
| Business value  | High for QR-enabled cafés                               |
| Integrity value | High (stock/recipe)                                     |
| Current         | Keyless public create                                   |
| Schema          | **v88 NONE**                                            |
| Complexity      | S–M                                                     |
| Why now         | Closes P18 intentional exception; contained             |
| Why not now     | Org priority is R16; QR may be secondary in some pilots |

### #3 — Cancel/discount sticky Idempotency deepen

|             |                                      |
| ----------- | ------------------------------------ |
| Integrity   | Medium (audit/races more than stock) |
| Schema      | NONE                                 |
| Why not now | Natural guards; P2                   |

### #4 — Phase C security (CSP/JWT)

|             |                                      |
| ----------- | ------------------------------------ |
| Security    | High                                 |
| Complexity  | L                                    |
| Why not now | Major; needs design; not thin harden |

### #5 — Durable POS offline queue / REAL cutover (tie — both later)

|             |                                                  |
| ----------- | ------------------------------------------------ |
| Schema      | Migration likely                                 |
| Why not now | Architecture / money authorize; no P0 proven bug |

---

## Recommended P19 Scope

### Feature

**P19 ENGINEERING HOLD** (R16 / OPS-02 first)

### Feature ID

`R16-OPS02-HOLD` (program) — not a code Feature ID

### Problem

Live Go-Live is blocked by signing and site operations, not by an open product P0 in the P13–P18 stack. Continuing feature waves does not flip Live GO and risks roadmap drift after six harden phases.

### Current behavior

Engineering suites green with conditions; Live **NO-GO**.

### Expected behavior

1. Produce signed/notarized RC
2. Execute OPS-02 site drills on café hardware
3. Escrow Master PIN; complete backup/restore café proof
4. Written JWT/CSP residual acceptance (or schedule Phase C)
5. Executive / pilot sign-off

### Affected modules

Release ops, signing, site runbooks — **not** application feature code.

### Schema

**v88** — no change.

### Explicitly out of scope (during hold)

Implementing QR idempotency, offline queue, Phase C, REAL cutover, P20, Frozen features — unless separately authorized as **parallel** eng with explicit prompt.

### Parallel eng (optional, separate authorize)

If humans want concurrent eng while R16 proceeds:

| Field        | Value                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| Feature ID   | `QR-ORD-IDEM`                                                                       |
| Name         | Public QR Order Create Idempotency                                                  |
| Problem      | Keyless guest create can duplicate order/stock/recipe                               |
| Expected     | Sticky Idempotency-Key; store under guest/synthetic scope; replay/conflict like P18 |
| Schema       | **v88 compatible**                                                                  |
| Out of scope | Staff path rewrite; offline queue; payment changes                                  |

---

## Alternative: Engineering Hold

**Recommendation:** **YES — primary.**

|                       |                                                                             |
| --------------------- | --------------------------------------------------------------------------- |
| Reason                | Live blockers are human/signing/site; six eng harden waves already complete |
| Current blockers      | Signed RC; OPS-02; escrow; DR site proof; exec sign-off                     |
| Why pause feature eng | Momentum ≠ go-live; matrix prefers not inventing work                       |
| What must complete    | R16 checklist + OPS-02 drills                                               |
| Parallel eng allowed? | Only with explicit authorize (prefer `QR-ORD-IDEM`)                         |

---

## Explicitly Deferred

- QR-ORD-IDEM (until authorize)
- Durable offline mutation queue
- Phase C CSP/JWT implementation
- REAL→cents cutover
- Cancel/discount mandatory keys
- KDS per-client ACK
- Multi-location / gateways / aggregators / payroll
- Addon BOM / WAC / profitability
- P20

---

## Acceptance Criteria

For **HOLD** completion of this audit:

- [x] Post-P18 residuals classified without treating P18 as missing
- [x] R16 blockers verified as non-eng-solvable
- [x] Ranked candidates with schema impact
- [x] Clear primary recommendation + optional parallel eng
- [x] No production code changes

For future **QR-ORD-IDEM** (if authorized): sticky guest key; replay; conflict; stock/recipe once; v88; p13–p18 green.

---

## Proposed Test Plan

**HOLD:** N/A (ops checklists).

**If QR-ORD-IDEM authorized:**

1. Double-submit same key → one order
2. Lost-response replay returns same order id
3. Different payload → conflict
4. Stock/recipe deltas once
5. Tables occupancy interaction
6. Regression p18/p17/p16/r10

---

## Schema Assessment

| Candidate              | Schema                                     |
| ---------------------- | ------------------------------------------ |
| HOLD / R16             | NONE                                       |
| QR-ORD-IDEM            | **v88 NONE**                               |
| Cancel/discount deepen | NONE                                       |
| Phase C                | NONE (or session redesign — multi-surface) |
| Offline queue          | MIGRATION likely                           |
| REAL cutover           | MIGRATION REQUIRED                         |

---

## Stop Condition

This audit is complete. **Implementation is NOT STARTED.**

Next step: **human review** —

1. Execute **R16 / OPS-02** (recommended), and/or
2. Authorize **QR-ORD-IDEM** as parallel eng, or
3. Authorize a different ranked candidate with a new prompt

Do **not** start P20. Do **not** modify production code from this audit.

---

## Appendix — Git Baseline

```text
git status          → clean
git branch          → restaurant-vertical
git log -5          → faf3b70, ea61ac9, 9e0cda3, 2d89064, d6d1357
schema tip          → v88
production diff     → ZERO
```
