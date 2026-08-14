# Post-P0 — Pilot Readiness Remediation

**Date:** 2026-08-14  
**Branch:** `modular-verticles`  
**HEAD at start:** `edc44d8` (`fix: close retail vertical isolation blockers`)  
**Schema:** v75 (unchanged)  
**Money path:** unchanged (payments, refunds, FIN-01, tax, day-close, shifts)  
**Phase 4.16:** not created  
**ADR-014:** still Proposed; not wired

This is a **P1 classification + minimal software-fix** pass. It is not a feature phase.

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
| **Restaurant** | PILOT READY WITH CONDITIONS 78  | **PILOT READY WITH CONDITIONS 80** |
| **Retail**     | NOT PILOT READY 57 (product P0) | **PILOT READY WITH CONDITIONS 72** |

**Remaining product P0:** none.

Restaurant can still run a **controlled takeaway-first café** after human/ops gates. Retail can now run a **controlled store pilot** on the same conditions, with `ACTIVE_VERTICAL_ID=retail` at install. Neither vertical is “unsigned binary + untrained staff = live service.”

Safely resolvable **software** P1s in this patch are **CLOSED**. Items that need a product policy or a café operator are **STOPPED** as HUMAN / OPS.

Independent review of the production diff: **APPROVE WITH NITS** ([Review](f26feb9d-d495-40b3-ab13-c7375aa7bdc3)).

---

## 2. P1 findings

Classification: **P0** pilot blocker · **P1** pilot required · **P2** post-pilot · **OPS** operational gate · **HUMAN** product/policy · **DEFERRED** not part of this pilot.

| ID                              | Topic                                                                          | Class                                | Disposition                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **P1-01a / INV-01 idempotency** | Repeat `PATCH …/status {cancelled}` restocks again                             | **P1** → **FIXED**                   | Already-cancelled no-op before `restoreTrackedStock`                                                          |
| **P1-01b / INV-01 paid cancel** | Cancel of an already-paid order restocks and does not reverse money            | **HUMAN**                            | Not implemented. Training vs code-block vs skip-restock is a product decision                                 |
| **P1-02 / INV-02**              | Voided siblings blocked last-item restock catch-up                             | **P1** → **FIXED**                   | Remaining-to-serve excludes `cancelled` / `voided` / `void_adjustment`                                        |
| **P1-03 / SEC-01**              | Chef may cancel pending orders without PIN                                     | **HUMAN**                            | Accidental RBAC. KDS UI never cancels. Do not silently drop chef                                              |
| **P1-04 / FIN-02**              | Gross/Net omit collectible-complete bills stuck at `partial`                   | **HUMAN**                            | Display/reporting hole (B+D). Money writes and FIN-01 are correct. Report-query change would change Gross/Net |
| **P1-05 / REST-04**             | Discount API can mutate billed/refunded orders                                 | **P1** (out of this authorized list) | Still open; not in the remaining-P1 brief; not silently expanded                                              |
| **P1-06 / REC-02**              | Unopenable SQLite can quit instead of recovery UI                              | **P1** remaining                     | Larger than a minimal patch. Missing/empty DB recovery still PASS                                             |
| **P1-07 / REC-03**              | KDS (and Server App) bind exhaustion quit the POS                              | **P1** → **FIXED**                   | After 10 `EADDRINUSE` retries, `resolve()`; POS continues                                                     |
| **P1-08 / ISO-03**              | Composition fetch failure fail-opens restaurant modules                        | **P2**                               | Process-level Retail skip already holds. Fail-closed-as-OFF would hide café KDS on a glitch                   |
| **P1-09 / ISO-08**              | Server App always starts                                                       | **CLOSED in edc44d8**                | Module-gated skip when `tables` off                                                                           |
| **P1-10 / TEST-01**             | Default `npm test` omits Phase 4 / inventory-ledger / production-retail script | **P2**                               | Bind-degrade now in `test:kds-integration`. Do not expand CI graph in this patch                              |
| **P1-11 / HW-01**               | Café printer / drawer / KDS not verified on site                               | **OPS**                              | Software print-after-commit is correct                                                                        |
| **P1-12 / DRV-01**              | Drive backup-now without Master PIN                                            | **P1** (out of this authorized list) | Known P0.6 residual; not in the remaining-P1 brief                                                            |
| **OPS-01…07**                   | Signed artifact, PIN escrow, backup policy, training, drills                   | **OPS**                              | See §11                                                                                                       |
| **ADR-014**                     | Service charge                                                                 | **DEFERRED / HUMAN**                 | Proposed; not wired                                                                                           |

---

## 3. Reproduction evidence

### P1-01a — Repeat cancel restock (FIXED)

**RED:** `tests/inventory-boundary.test.ts` step 7b. After a successful cancel restored stock 8→10, a second `PATCH /api/orders/:id/status { status: 'cancelled' }` left stock at **12**.

**GREEN:** same step; stock stays **10**. HTTP 200 with the current cancelled order.

### P1-01b — Paid-order cancel (HUMAN — not fixed)

`main/routes/orders.ts` `case 'cancelled'` restores tracked stock for non-voided lines and stamps `cancelled_at`. It does **not** read bills, `payment_details`, or refunds. Money is left as-is.

Frontend `OrderCard` hides **item** cancel when paid, but whole-order Cancel is shown whenever order status is not `completed`/`cancelled`. Full pay sets order `completed` (hides the button); split/uncompleted paid tickets still show Cancel. The API still accepts cancel on completed orders if a client sends PATCH.

### P1-02 — Void catch-up (FIXED)

**RED:** `tests/order-void-cancel-stock.test.ts` step 5. Two-line order (A+B, stock 10 each). Void A (preparing + PIN). Cancel pending B. Stock B stayed **9**; order stayed **`pending`**.

**GREEN:** A stays **9** (void does not restock); B restores to **10**; order **`cancelled`**.

Tax/totals still use `activeItems` (`status != 'cancelled'`). Voided + `void_adjustment` still net on the bill. Only the remaining-to-serve predicate changed.

Voiding the last remaining-to-serve line now also catch-up-cancels the order (nothing left to serve). Audit action stays `order.item_voided` (metadata `order_cancelled: true`); stock for voided lines is not restored.

### P1-04 — FIN-02 Gross/Net vs stuck `partial` (HUMAN)

Classification **B + D** (display/reporting defect + test gap). **Not** a money-write defect.

- Tender write (`payment-tender.ts:574-579`) sets `payment_status` from **net** `paid_amount` vs total (`paid` vs `partial`).
- FIN-01 collectible remaining is **gross** tender (`payment-tender.ts:354-368`). `BILL_NO_OUTSTANDING_BALANCE` holds.
- `daySalesSemantics` (`reports.ts:212-226`) Gross/Net only `payment_status IN ('paid','partially_refunded','refunded')`.
- A later collect after refund can overwrite refund-aware status back to `partial`.
- Day-close Z is **tender-based** (`getShiftPaymentSummary` / `payment_details`), not Gross/Net. Z is not this hole.

Repro shape: bill total 1000, pay 600, refund 200, repay 400 → collectible 0, net `paid_amount` 800, stored `partial` → omitted from Gross/Net.

Changing the report filter **would change reported Gross/Net**. Stopped for human authorization.

### P1-03 — Chef pending-cancel (HUMAN)

`PATCH /orders/:id/status` `requireRole(..., 'chef', ...)`. Manager PIN only when in-progress. Chef on a **pending** ticket with no in-progress items can cancel without PIN.

KDS UI never sends cancel (item PATCH allow-list is `pending|preparing|ready|served`). Item-cancel 403s chef. This is API RBAC policy, not a kitchen-screen bug.

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

| Fix                                                    | Files                   | Tests                                                                                                   |
| ------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Already-cancelled PATCH is a no-op (no second restock) | `main/routes/orders.ts` | `tests/inventory-boundary.test.ts` 7b (`npm run test:inventory-boundary`)                               |
| Last-item catch-up ignores voided / void_adjustment    | `main/routes/orders.ts` | `tests/order-void-cancel-stock.test.ts` 5 (`npm run test:order-boundary`)                               |
| KDS bind exhaustion degrades; POS stays up             | `main/kds-server.ts`    | `tests/kds-bind-degrade.test.ts` (`npm run test:kds-bind-degrade`, chained into `test:kds-integration`) |
| Server App bind exhaustion degrades                    | `main/server-app.ts`    | Same pattern as KDS; no dedicated test (review nit)                                                     |

**Not changed:** payment-tender, refunds, reports, tax, day-close, shifts, chef roles, paid-bill 409, schema, ADR-014.

TDD: characterization tests RED, then smallest production diff, then GREEN.

---

## 6. Human decisions

Do **not** implement until an explicit choice.

### H1 — Cancel-after-pay / restock (P1-01b)

**Current:** paid (or completed) order cancel restocks inventory and does **not** reverse tender. Refunds own money (ADR-009). Retail restock is a second explicit call (ADR-011).

**Options (do not pick silently):**

1. Train operators: never cancel a paid ticket; use refund (+ optional restock on Retail).
2. Code: 409 cancel when a bill has successful tender; force refund.
3. Code: allow cancel but skip restock when paid (inventory stays deducted; money stays).

Training **cannot** make repeat PATCH idempotent (that is now fixed). Training **can** be accepted for paid cancel if the café SOP forbids it and staff are signed off.

**Safest recommendation (not implemented):** keep refund as the money path; if a code change is later authorized, **skip restock + 409 when any successful tender exists**, rather than inventing a cancel-refund. That still needs product sign-off.

### H2 — FIN-02 report inclusion (P1-04)

**Current:** money writes and FIN-01 are correct. Gross/Net under-count collectible-complete `partial` bills.

**Options:**

1. Accept the hole for pilot; reconcile those bills from CSV / `payment_details`.
2. Authorize a **report-query-only** change (include collectible-complete `partial`, or Gross from tender). This **changes reported Gross/Net**. Do not write `payment_status` to match (Phase 4.10 freeze).

### H3 — Chef pending-cancel (P1-03)

**Options:** drop chef from order-status cancel; require PIN for chef; leave as-is and train that kitchen uses KDS bump only (KDS UI already cannot cancel).

### H4 — ADR-014 service charge

Accept or reject. **Not wired.** No v76.

---

## 7. Restaurant readiness

**Verdict: PILOT READY WITH CONDITIONS — 80/100** (was 78).

Same rubric as `post-phase-4.15-pilot-readiness-audit.md`.

| Dimension     | Score | Delta                                                                       |
| ------------- | ----: | --------------------------------------------------------------------------- |
| Money writes  |    88 | Unchanged. FIN-01 holds. FIN-02 is reporting, not writes                    |
| Core checkout |    85 | Unchanged. Takeaway-first; billed merge frozen                              |
| Isolation     |    90 | Unchanged. Restaurant modules still bind                                    |
| Inventory     |    85 | +10. Repeat-cancel and void catch-up closed. Paid-cancel policy still HUMAN |
| Recovery      |    78 | +8. KDS/Server App bind no longer quits POS. Unopenable DB still P1-06      |
| Hardware      |    55 | Unchanged. Café printer/KDS not on-site verified                            |
| Security      |    80 | Unchanged. Chef pending-cancel still HUMAN                                  |
| Tests         |    64 | +2. Bind-degrade now in default `npm test` via `test:kds-integration`       |
| Ops / release |    60 | Unchanged. Signed artifact still missing                                    |

Weighted ≈ **80**.

**Pilot shape:** takeaway + simple dine-in (one table, no billed merge, no service charge). Keep `ACTIVE_VERTICAL_ID` unset or `restaurant`.

---

## 8. Retail readiness

**Verdict: PILOT READY WITH CONDITIONS — 72/100** (was 57, product-P0 capped).

Judge only whether the **existing** product can safely operate a controlled store. Not a competitor comparison. Not a finished ERP.

| Dimension     | Score | Why                                                                                                              |
| ------------- | ----: | ---------------------------------------------------------------------------------------------------------------- |
| Money writes  |    82 | Shared FIN-01 / refunds. Exchange is sequential (ADR-012 residual)                                               |
| Core checkout |    78 | Catalog load no longer fail-opens addons. Barcode/SKU, takeaway-only UI, refund, restock, exchange exist         |
| Isolation     |    82 | Companion KDS/Server App skip. Main remount 404. Renderer composition glitch is P2, not process leak             |
| Inventory     |    85 | Restock/wastage/valuation + INV-01a/INV-02 closed. Paid-cancel HUMAN                                             |
| Recovery      |    75 | Same POS degrade as Restaurant                                                                                   |
| Hardware      |    50 | No retail-specific hardware drill                                                                                |
| Security      |    78 | Companions off. Same role matrix                                                                                 |
| Tests         |    42 | `test:retail-isolation` in `npm test`. `test:production-retail` script still missing; Phase 4 suites still extra |
| Ops / release |    45 | No retail install runbook; café docs assume Restaurant                                                           |

Weighted ≈ **72**.

**Must at install:** `ACTIVE_VERTICAL_ID=retail`. Confirm KDS `:3002` and Server App `:3003` are connection-refused. Exchange/restock remain available. No KDS, no Server App, no tables, takeaway-only POS.

Retail is **not** “ERP complete.” Suppliers/PO, BOM, variants matrix, gift cards, multi-location remain DEFERRED.

---

## 9. Financial integrity status

| Question                                        | Answer                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Bills / payments / refunds / shifts / day-close | **YES WITH CONDITIONS** — same as post-4.15. No write-path change in this patch                         |
| FIN-01                                          | **CLOSED / frozen.** Collectible = total − gross successful tender. Refunds never recreate capacity     |
| FIN-02                                          | **HUMAN.** Reporting hole only. Day-close Z is tender-based and is **not** this hole                    |
| Inventory vs money                              | Repeat cancel no longer double-restocks. Paid cancel still restocks without reversing money (**HUMAN**) |
| Schema                                          | **v75**                                                                                                 |

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

1. **HUMAN H1** — paid cancel / restock policy
2. **HUMAN H2** — FIN-02 report query (or accept the hole)
3. **HUMAN H3** — chef pending-cancel (or train KDS-only)
4. **OPS-02** — signed/notarized artifact
5. **OPS-01** — staff SSID on site
6. **OPS-03** — Master PIN escrow
7. **OPS-04** — numeric backup policy
8. **OPS-05** — training + `pilot-signoff.md`
9. **P1-11** — printer + KDS café drill
10. **P1-06** — unopenable DB → recovery UI (software, next hardening slice if authorized)

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
