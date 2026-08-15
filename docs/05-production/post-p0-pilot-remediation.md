# Post-P0 — Pilot Readiness Remediation

**Date:** 2026-08-14  
**Branch:** `modular-verticles`  
**HEAD at start:** `edc44d8` (`fix: close retail vertical isolation blockers`)  
**Schema:** v80 (unchanged)  
**Money path:** unchanged (payments, refunds, FIN-01, tax, day-close, shifts)  
**Phase 4.16:** not created  
**ADR-014:** still Proposed; not wired

### Human policy implementation (2026-08-14)

Authorized and implemented on this tree (schema v79, money writes unchanged):

| Gate        | Decision               | Result                                                                                                                                                                                                         |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1**      | 409 when tender exists | `PATCH /orders/:id/status` cancelled returns **409** `ORDER_HAS_SUCCESSFUL_TENDER` if any bill has GROSS `payment_details` > 0. No restock. No money writes. Unpaid cancel still restocks. Refunded still 409. |
| **H2**      | Reporting fix          | `daySalesSemantics` includes collectible-complete `partial` bills. Payment/refund writes and FIN-01 unchanged.                                                                                                 |
| **H3**      | Require PIN            | Chef must supply a manager PIN to cancel pending or in-progress tickets. Cashier/waiter/owner/manager pending-cancel unchanged. KDS bump unchanged.                                                            |
| **ADR-014** | Leave Proposed         | Not wired.                                                                                                                                                                                                     |

Independent review: **APPROVE WITH NITS** ([Review](1847b55e-deac-4f4e-8321-c063ab4266f8)).

---

Prior Retail isolation P0s remain **CLOSED** (do not reopen unless regression):

- KDS process binding isolation
- Server App isolation
- Products admin fail-open
- `verticalId` propagation on Products / KDS / Orders
- Orders/KDS WebSocket gating

---

## 1. Executive status

| Vertical       | Previous (post-4.15)            | After this remediation             |
| -------------- | ------------------------------- | ---------------------------------- |
| **Restaurant** | PILOT READY WITH CONDITIONS 78  | **PILOT READY WITH CONDITIONS 81** |
| **Retail**     | NOT PILOT READY 57 (product P0) | **PILOT READY WITH CONDITIONS 74** |

**Remaining product P0:** none.

Restaurant can still run a **controlled takeaway-first café** after human/ops gates. Retail can now run a **controlled store pilot** on the same conditions, with `ACTIVE_VERTICAL_ID=retail` at install. Neither vertical is “unsigned binary + untrained staff = live service.”

Safely resolvable **software** P1s in this patch are **CLOSED**. Items that need a product policy or a café operator are **STOPPED** as HUMAN / OPS.

Independent review of the production diff: **APPROVE WITH NITS** ([Review](f26feb9d-d495-40b3-ab13-c7375aa7bdc3)).

---

## 2. P1 findings

Classification: **P0** pilot blocker · **P1** pilot required · **P2** post-pilot · **OPS** operational gate · **HUMAN** product/policy · **DEFERRED** not part of this pilot.

| ID                              | Topic                                                                          | Class                                | Disposition                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| **P1-01a / INV-01 idempotency** | Repeat `PATCH …/status {cancelled}` restocks again                             | **P1** → **FIXED**                   | Already-cancelled no-op before `restoreTrackedStock`                                        |
| **P1-01b / INV-01 paid cancel** | Cancel of an already-paid order restocks and does not reverse money            | **P1** → **FIXED (H1)**              | 409 `ORDER_HAS_SUCCESSFUL_TENDER`; refund owns money                                        |
| **P1-02 / INV-02**              | Voided siblings blocked last-item restock catch-up                             | **P1** → **FIXED**                   | Remaining-to-serve excludes `cancelled` / `voided` / `void_adjustment`                      |
| **P1-03 / SEC-01**              | Chef may cancel pending orders without PIN                                     | **P1** → **FIXED (H3)**              | Chef cancel requires manager PIN; KDS bump unchanged                                        |
| **P1-04 / FIN-02**              | Gross/Net omit collectible-complete bills stuck at `partial`                   | **P1** → **FIXED (H2)**              | Report-query only; stored `payment_status` still net-paid                                   |
| **P1-05 / REST-04**             | Discount API can mutate billed/refunded orders                                 | **P1** (out of this authorized list) | Still open; not in the remaining-P1 brief; not silently expanded                            |
| **P1-06 / REC-02**              | Unopenable SQLite can quit instead of recovery UI                              | **P1** remaining                     | Larger than a minimal patch. Missing/empty DB recovery still PASS                           |
| **P1-07 / REC-03**              | KDS (and Server App) bind exhaustion quit the POS                              | **P1** → **FIXED**                   | After 10 `EADDRINUSE` retries, `resolve()`; POS continues                                   |
| **P1-08 / ISO-03**              | Composition fetch failure fail-opens restaurant modules                        | **P2**                               | Process-level Retail skip already holds. Fail-closed-as-OFF would hide café KDS on a glitch |
| **P1-09 / ISO-08**              | Server App always starts                                                       | **CLOSED in edc44d8**                | Module-gated skip when `tables` off                                                         |
| **P1-10 / TEST-01**             | Default `npm test` omits Phase 4 / inventory-ledger / production-retail script | **P2**                               | Bind-degrade now in `test:kds-integration`. Do not expand CI graph in this patch            |
| **P1-11 / HW-01**               | Café printer / drawer / KDS not verified on site                               | **OPS**                              | Software print-after-commit is correct                                                      |
| **P1-12 / DRV-01**              | Drive backup-now without Master PIN                                            | **P1** (out of this authorized list) | Known P0.6 residual; not in the remaining-P1 brief                                          |
| **OPS-01…07**                   | Signed artifact, PIN escrow, backup policy, training, drills                   | **OPS**                              | See §11                                                                                     |
| **ADR-014**                     | Service charge                                                                 | **DEFERRED / HUMAN**                 | Proposed; not wired                                                                         |

---

## 3. Reproduction evidence

### P1-01a — Repeat cancel restock (FIXED)

**RED:** `tests/inventory-boundary.test.ts` step 7b. After a successful cancel restored stock 8→10, a second `PATCH /api/orders/:id/status { status: 'cancelled' }` left stock at **12**.

**GREEN:** same step; stock stays **10**. HTTP 200 with the current cancelled order.

### P1-01b — Paid-order cancel (FIXED — H1)

`PATCH /orders/:id/status` cancelled returns **409** `{ error, code: 'ORDER_HAS_SUCCESSFUL_TENDER' }` when any bill on the order has GROSS `payment_details` amount > 0. Check is **before** `withTxn`. No restock. No `paid_amount` / `payment_status` / refund writes. Already-cancelled unpaid remains 200 no-op. Unpaid (including generated bill with no tender) still restocks. Fully refunded still 409 (gross tender remains). Use the refund workflow (ADR-009 / ADR-011 restock).

Frontend Cancel is hidden when any attached bill has gross tender.

### P1-02 — Void catch-up (FIXED)

**RED:** `tests/order-void-cancel-stock.test.ts` step 5. Two-line order (A+B, stock 10 each). Void A (preparing + PIN). Cancel pending B. Stock B stayed **9**; order stayed **`pending`**.

**GREEN:** A stays **9** (void does not restock); B restores to **10**; order **`cancelled`**.

Tax/totals still use `activeItems` (`status != 'cancelled'`). Voided + `void_adjustment` still net on the bill. Only the remaining-to-serve predicate changed.

Voiding the last remaining-to-serve line now also catch-up-cancels the order (nothing left to serve). Audit action stays `order.item_voided` (metadata `order_cancelled: true`); stock for voided lines is not restored.

### P1-04 — FIN-02 Gross/Net vs stuck `partial` (FIXED — H2)

Reporting-only. `daySalesSemantics` includes `partial` bills whose FIN-01 collectible is 0 (`ROUND(total*100) ≤ SUM(payment_details amounts in cents)`). Open partials stay out of Gross/Net. Refunds SQL unchanged. Payment-tender / refund writes / stored `payment_status` unchanged. Day-close Z unchanged.

Stuck fixture: total 1000, pay 600, refund 200, repay 400 → Gross 1000, Refunds 200, Net 800, stored status still `partial`.

### P1-03 — Chef pending-cancel (FIXED — H3)

Chef remains on `PATCH /orders/:id/status`. Cancel (pending or in-progress) requires a manager PIN. Cashier/waiter/owner/manager pending cancel without PIN is unchanged. Chef can still advance to `preparing` without PIN. KDS item bump allow-list is still not `cancelled`. Item-cancel still 403s chef.

### P1-07 — KDS bind quit (FIXED)

**RED:** occupy 10 ports from `KDS_PORT`; `await startKdsServer()` historically `reject()` → `initialize()` catch → `app.quit()`. Characterization: `tests/kds-bind-degrade.test.ts`.

**GREEN:** `startKdsServer()` **resolves**; `isKdsServerRunning() === false`. Same degrade on Server App bind exhaustion (untested twin; nit).

`index.ts` still `await startKdsServer()` (REC-01 source contract). Skip-when-module-off and degrade-when-bind-fails live **inside** the start functions.

### P1-08 — Composition fallback (P2 — not fixed)

`GET /api/platform/composition` 500 → `usePlatformComposition` leaves `verticalId` undefined → `isModuleEnabled` restaurant-fail-open. Process-level KDS/Server App on Retail still do not bind. Fail-closed-as-OFF would hide café KDS on a transient composition glitch. Not an isolation P0 after `edc44d8`.

### P1-06 — Unopenable DB (remaining P1)

Missing/empty DB → recovery UI; money APIs 503. `new Database()` throw / corrupt-but-openable is **not** latched to `/recovery`; `initialize()` can `app.quit()`. Not implemented in this patch.

---

## 4. Root causes

| Item                  | Root cause                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Repeat cancel restock | `case 'cancelled'` always restored stock; no already-cancelled guard                                                   |
| INV-02                | Catch-up used `activeItems` (`status != 'cancelled'`), so voided siblings kept the order “active”                      |
| Paid cancel restock   | Inventory restore is coupled to order cancel, not to refund. Product never decided whether cancel-after-pay is allowed |
| FIN-02                | Stored status is net-paid; reports filter on stored status; FIN-01 remaining is gross tender (intentional 4.10 split)  |
| Chef cancel           | Status PATCH is a shared kitchen+floor endpoint; PIN gate is “in progress” only                                        |
| KDS quit              | Companion `reject()` after port exhaustion bubbled to Electron `initialize()`                                          |
| Composition fail-open | Renderer `isModuleEnabled` without `verticalId` uses compile-time restaurant                                           |
| Unopenable DB         | REC-01 only latches `missing_database` / `empty_database`                                                              |

---

## 5. Fixed items

| Fix                                                     | Files                            | Tests                                                                                                   |
| ------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Already-cancelled PATCH is a no-op (no second restock)  | `main/routes/orders.ts`          | `tests/inventory-boundary.test.ts` 7b (`npm run test:inventory-boundary`)                               |
| Last-item catch-up ignores voided / void_adjustment     | `main/routes/orders.ts`          | `tests/order-void-cancel-stock.test.ts` 5 (`npm run test:order-boundary`)                               |
| KDS bind exhaustion degrades; POS stays up              | `main/kds-server.ts`             | `tests/kds-bind-degrade.test.ts` (`npm run test:kds-bind-degrade`, chained into `test:kds-integration`) |
| Paid cancel 409 when GROSS tender exists (H1)           | `orders.ts`, `payment-tender.ts` | `tests/inventory-boundary.test.ts` 7c–7e                                                                |
| FIN-02 collectible-complete `partial` in Gross/Net (H2) | `main/routes/reports.ts`         | `tests/financial-reporting-semantics.test.ts`                                                           |
| Chef cancel requires manager PIN (H3)                   | `main/routes/orders.ts`          | `tests/orders-authz.test.ts`                                                                            |

**Not changed:** payment/refund writes, FIN-01, tax, day-close, shifts, schema v79, ADR-014. Chef remains on KDS.

---

## 6. Human decisions

H1, H2, and H3 were **authorized 2026-08-14 and implemented** (see addendum). Remaining:

### H4 — ADR-014 service charge

**LEAVE PROPOSED.** Not wired. No v76. No service-charge implementation.

---

## 7. Restaurant readiness

**Verdict: PILOT READY WITH CONDITIONS — 81/100** (was 78, then 80 after software P1s).

Same rubric as `post-phase-4.15-pilot-readiness-audit.md`.

| Dimension     | Score | Delta                                                                                |
| ------------- | ----: | ------------------------------------------------------------------------------------ |
| Money writes  |    90 | FIN-01 holds. FIN-02 Gross/Net now includes collectible-complete `partial`           |
| Core checkout |    85 | Unchanged. Takeaway-first; billed merge frozen                                       |
| Isolation     |    90 | Unchanged. Restaurant modules still bind                                             |
| Inventory     |    88 | Paid cancel 409; repeat-cancel and void catch-up closed                              |
| Recovery      |    78 | KDS/Server App bind no longer quits POS. Unopenable DB still P1-06                   |
| Hardware      |    55 | Unchanged. Café printer/KDS not on-site verified                                     |
| Security      |    86 | Chef pending-cancel requires PIN                                                     |
| Tests         |    66 | H1/H2/H3 characterization in inventory-boundary / financial-reporting / orders-authz |
| Ops / release |    60 | Unchanged. Signed artifact still missing                                             |

Weighted ≈ **81**.

**Pilot shape:** takeaway + simple dine-in (one table, no billed merge, no service charge). Keep `ACTIVE_VERTICAL_ID` unset or `restaurant`.

---

## 8. Retail readiness

**Verdict: PILOT READY WITH CONDITIONS — 74/100** (was 57, then 72 after isolation + software P1s).

Judge only whether the **existing** product can safely operate a controlled store. Not a competitor comparison. Not a finished ERP.

| Dimension     | Score | Why                                                                                                              |
| ------------- | ----: | ---------------------------------------------------------------------------------------------------------------- |
| Money writes  |    86 | Shared FIN-01 / refunds. FIN-02 Gross/Net hole closed. Exchange sequential (ADR-012)                             |
| Core checkout |    78 | Catalog load no longer fail-opens addons. Barcode/SKU, takeaway-only UI, refund, restock, exchange exist         |
| Isolation     |    82 | Companion KDS/Server App skip. Main remount 404. Renderer composition glitch is P2, not process leak             |
| Inventory     |    88 | Restock/wastage/valuation + INV-01a/INV-02 + paid-cancel 409                                                     |
| Recovery      |    75 | Same POS degrade as Restaurant                                                                                   |
| Hardware      |    50 | No retail-specific hardware drill                                                                                |
| Security      |    82 | Companions off. Chef cancel PIN. Same role matrix                                                                |
| Tests         |    42 | `test:retail-isolation` in `npm test`. `test:production-retail` script still missing; Phase 4 suites still extra |
| Ops / release |    45 | No retail install runbook; café docs assume Restaurant                                                           |

Weighted ≈ **74**.

**Must at install:** `ACTIVE_VERTICAL_ID=retail`. Confirm KDS `:3002` and Server App `:3003` are connection-refused. Exchange/restock remain available. No KDS, no Server App, no tables, takeaway-only POS.

Retail is **not** “ERP complete.” Suppliers/PO, BOM, variants matrix, gift cards, multi-location remain DEFERRED.

---

## 9. Financial integrity status

| Question                                        | Answer                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Bills / payments / refunds / shifts / day-close | **YES WITH CONDITIONS** — same as post-4.15. No write-path change in this patch                                                    |
| FIN-01                                          | **CLOSED / frozen.** Collectible = total − gross successful tender. Refunds never recreate capacity                                |
| FIN-02                                          | **CLOSED (H2).** Collectible-complete `partial` bills are in Gross/Net. Day-close Z is tender-based. Stored status still net-paid. |
| Inventory vs money                              | Paid cancel 409s. Repeat cancel no longer double-restocks. Refund owns money.                                                      |
| Schema                                          | **v75**                                                                                                                            |

**No P0 double-write, replay collect, or cross-transaction corruption was introduced.** Do not redesign the money path.

---

## 10. Recovery status

| Scenario                         | Status                                             | Class                |
| -------------------------------- | -------------------------------------------------- | -------------------- |
| Cloud / print / WhatsApp down    | Billing continues (local-first)                    | READY                |
| Missing / empty DB               | Recovery UI; money APIs 503                        | READY (REC-01)       |
| Restore via IPC + Master PIN     | Lab drill historically PASS                        | OPS (café re-brief)  |
| KDS / Server App port exhaustion | POS continues; companion down                      | **FIXED** this patch |
| Unopenable / hard SQLite throw   | May still quit                                     | **P1 remaining**     |
| Failed migrations                | Pre-migration backup exists; not a new recovery UI | PARTIAL              |
| Money APIs during recovery       | 503                                                | READY                |

P1-06 is a real software gap. It was **not** implemented here because it is larger than a minimal companion-degrade / inventory idempotency patch.

---

## 11. Operational readiness

| Item                               | Status      | Notes                                        |
| ---------------------------------- | ----------- | -------------------------------------------- |
| Signed / notarized PILOT artifact  | **MISSING** | OPS-02. Local pack is TRAINING/QA            |
| OPS-01 staff SSID / no guest Wi-Fi | **PARTIAL** | Policy in runbook; site PENDING              |
| Master PIN escrow                  | **MISSING** | OPS-03                                       |
| Backup mechanics                   | **READY**   | Software                                     |
| Numeric backup policy              | **PARTIAL** | PENDING APPROVAL (OPS-04)                    |
| Restore lab drill                  | **PARTIAL** | P1.5 DR PASS; café re-brief PENDING          |
| New-machine JWT restore            | **MISSING** | OPS-06 NOT VERIFIED                          |
| Printer / drawer café drill        | **MISSING** | P1-11                                        |
| KDS café drill                     | **PARTIAL** | Automated listen tests PASS; café UX PENDING |
| Staff training / sign-off          | **MISSING** | OPS-05                                       |
| Operator recovery procedures       | **READY**   | Docs exist (`/recovery`, runbook)            |
| Café `ACTIVE_VERTICAL_ID`          | **PARTIAL** | Checklist item OPS-07; not a code flag       |
| Retail install runbook             | **MISSING** | Needed before a store pilot                  |

---

## 12. Remaining pilot gates

**Product P0:** none.

**Must close or formally accept before the relevant live pilot:**

1. **OPS-02** — signed/notarized artifact
2. **OPS-01** — staff SSID on site
3. **OPS-03** — Master PIN escrow
4. **OPS-04** — numeric backup policy
5. **OPS-05** — training + `pilot-signoff.md`
6. **P1-11** — printer + KDS café drill
7. **P1-06** — unopenable DB → recovery UI (software, next hardening slice if authorized)
8. **P1-05 / P1-12** — discount-on-settled-bill; Drive backup-now PIN (not this patch)

Retail additionally: set `ACTIVE_VERTICAL_ID=retail`; write/use a retail install checklist; run `node tests/run-electron-node-test.cjs tests/production-retail.test.ts` on the release candidate (script name still absent).

---

## 13. Explicitly deferred / frozen work

**Do not start. Do not invent Phase 4.16.**

- ADR-014 service charge (Proposed)
- Variants matrix (ADR-013 identity lock only)
- Billed table merge (4.13 ADR_REQUIRED)
- Suppliers / PO / BOM
- Aggregators, payment terminals, multi-location, gift cards / store credit
- REAL→cents (P0.3 docs-only)
- Phase C CSP / session JWT
- Fail-closed composition fetch (P2)
- Wiring all `test:phase-4.*` into default `npm test` (P2 / TEST-01)
- Discount-on-settled-bill (P1-05) and Drive backup-now PIN (P1-12) — still open, **not** this patch

---

## Verification

Characterization (this patch):

- `npm run test:inventory-boundary` — GREEN (incl. 7b)
- `npm run test:order-boundary` — GREEN (incl. void step 5)
- `npm run test:kds-bind-degrade` — GREEN

Regression (this run):

- Focused: restaurant/retail isolation, rec-01, fail-closed remount, platform composition, refund restock (4.2), exchange (4.5), production-retail, audit-log, issue-24 — GREEN
- `npm test` — GREEN (exit 0, ~173s)
- `npm run lint` — GREEN (0 errors; existing `any` warnings)
- `npm run build` — GREEN
- `npm run build:frontend` — GREEN

Independent review: **APPROVE WITH NITS** ([Review](f26feb9d-d495-40b3-ab13-c7375aa7bdc3)) — Server App degrade untested; inventory 7b still outside default `npm test`; pre-existing cancel TOCTOU if two first-cancels overlap. Audit action for last-item void kept as `order.item_voided` after catch-up.

---

## Stop condition

Safely resolvable software P1s in the authorized list are **closed**. Remaining blockers are **HUMAN** and **OPS**. **No Phase 4.16. No new roadmap.**
