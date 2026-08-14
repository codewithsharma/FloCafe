# Post-Phase-4.15 — Production & Pilot Readiness Audit

**Date:** 2026-08-14  
**Branch:** `modular-verticles`  
**HEAD at audit start:** `5fee6df` (`feat: add inventory wastage stock action`)  
**Schema:** v75  
**Product:** Opervia (repo: FloCafe / `flo-desktop` 3.0.5)  
**Scope:** Phases 3.x and 4.1–4.15 are complete. This is an **audit**, not a feature phase. **Phase 4.16 was not created.**  
**Working tree before audit:** clean. Production code was **not** modified.

**Methodology:** Ten parallel read-only audits (Restaurant, Retail, Finance, Inventory, Isolation, Recovery, Hardware, Security, QA, Ops) plus a final reviewer reconciliation. Evidence is repository code, existing tests, and ops docs — not a live café hardware walkthrough. Default `npm test`, backend/frontend lint, `npm run build`, and `npm run build:frontend` were executed as gates.

**Prior baseline:** P1.6 (2026-08-13) was **READY WITH CONDITIONS** for a first-café TRAINING/QA path. This audit **updates** that baseline after Phase 4.1–4.15 and **separates Restaurant from Retail**.

---

## 1. Executive Verdict

| Vertical       | Verdict                         |
| -------------- | ------------------------------- |
| **Restaurant** | **PILOT READY WITH CONDITIONS** |
| **Retail**     | **NOT PILOT READY**             |

Overall platform label for a mixed “Opervia is production-ready” claim: **NOT PILOT READY** — because Retail is not. For the north-star KPI (**3 cafés × 30 days × zero critical failures**), evaluate **Restaurant only**.

**Restaurant.** Takeaway billing, FIN-01 collectible outstanding, refunds, shifts, day close, and main-API composition are good enough for a **controlled café pilot**. There is **no product P0** on the money path, restore of a missing/empty database, or RBAC bypass. Remaining items are P1 product defects plus **human/ops gates** (signed artifact, PIN escrow, OPS-01, printer on the café machine, training/sign-off). Treat the first café as **takeaway-first**; billed table merge is intentionally unimplemented (Phase 4.13 discovery).

**Retail.** Main API remount 404s for restaurant modules are correct. Two product P0s still fail a retail pilot: the KDS companion always binds port 3002 and returns HTTP 200, and Products admin fail-opens restaurant `addons` so catalog load can 404. Do not start a retail store on this tree.

**Do not** treat unsigned TRAINING/QA binaries as PILOT/PRODUCTION. **Do not** invent Phase 4.16 from this document.

---

## 2. Readiness Score

Scores use a published rubric. They are not marketing numbers and are not comparable to the 2026-08-12 overall 64/100 product-audit score (different dimensions).

### Rubric (same weights for both verticals)

| Dimension             | Weight | What it measures                                  |
| --------------------- | -----: | ------------------------------------------------- |
| Money writes          |    20% | FIN-01, payments, refunds, no double-collect      |
| Core checkout journey |    15% | Login → catalog → cart → pay → receipt → refund   |
| Vertical isolation    |    15% | UI, routes, APIs, companion processes fail-closed |
| Inventory             |    10% | Service-owned mutations, ledger, restock          |
| Recovery / offline    |    10% | Billing when cloud/print/KDS fail; DB recovery    |
| Hardware              |     8% | Print after commit; printer/drawer/KDS on site    |
| Security              |     8% | Role checks on API, not only UI hide              |
| Tests                 |     7% | Default suite vs money/isolation/phase-4 coverage |
| Ops / release         |     7% | Signed artifact, runbooks, backup policy          |

A vertical with any **product P0** cannot score above **59**.

### Restaurant: **78 / 100**

| Dimension     | Score | Why                                                                               |
| ------------- | ----: | --------------------------------------------------------------------------------- |
| Money writes  |    88 | FIN-01 holds; no P0 double-collect. Stored status / Gross-Net = P1.               |
| Core checkout |    85 | Takeaway order → pay → refund covered by integration tests. Dine-in merge frozen. |
| Isolation     |    90 | Restaurant is the default vertical; main remount is correct for this install.     |
| Inventory     |    75 | Writes owned by `inventory.ts`. Cancel-after-pay / void catch-up = P1.            |
| Recovery      |    70 | Billing is local-first. Unopenable DB and KDS bind failure can quit the POS.      |
| Hardware      |    55 | Print is after payment commit. Café printer/KDS **not verified** on site.         |
| Security      |    80 | No P0 RBAC bypass. Chef pending-cancel and Drive backup-now = P1.                 |
| Tests         |    62 | `npm test` is green but omits every `test:phase-4.*` and inventory-ledger.        |
| Ops / release |    60 | Runbooks exist. Signed/notarized PILOT artifact still pending.                    |

Weighted: `0.20×88 + 0.15×85 + 0.15×90 + 0.10×75 + 0.10×70 + 0.08×55 + 0.08×80 + 0.07×62 + 0.07×60` = **77.7 → 78**.

### Retail: **57 / 100**

| Dimension     | Score | Why                                                                                                    |
| ------------- | ----: | ------------------------------------------------------------------------------------------------------ |
| Money writes  |    82 | Same tender/refund services. Exchange coordinator exists (ADR-012) but is not a single DB transaction. |
| Core checkout |    50 | SKU/barcode/restock/exchange exist; Products admin can fail the whole catalog load.                    |
| Isolation     |    20 | KDS `:3002` HTTP 200; renderer `isModuleEnabled()` without `verticalId` defaults to restaurant.        |
| Inventory     |    78 | Restock/wastage/valuation exist; still INV-01/02.                                                      |
| Recovery      |    70 | Same local-first POS process as Restaurant.                                                            |
| Hardware      |    50 | Same print-after-commit; no retail-specific hardware drill.                                            |
| Security      |    72 | Same role matrix; companion processes expand the attack/ops surface.                                   |
| Tests         |    38 | `tests/production-retail.test.ts` exists; **no** `test:production-retail` script; not in `npm test`.   |
| Ops / release |    45 | No retail install runbook; café docs assume Restaurant.                                                |

Weighted raw ≈ 57. Product P0 cap (59) does not change the result.

---

## 3. P0 Findings

Product P0s apply to **Retail only**. Restaurant has **zero product P0s**. Unsigned binaries and OPS-01 are **human/ops conditions**, not product P0s (consistent with P1.6).

| ID                   | Finding                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Impact                                                                        | Required action                                                                                                                                                | Class                          |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **P0-1 / ISO-01**    | KDS companion always starts; port 3002 returns HTTP 200 on Retail | `main/index.ts:697-698` always `await startKdsServer()` with no vertical/module gate. `kds-server.ts` serves `/` without composition check. Main API `/api/kds` remount 404 is correct; **the companion port is not.**                                                                                                                                                                                                                                              | Cross-vertical leakage. A retail install exposes a kitchen display surface.   | Do not start KDS (and do not serve `:3002`) unless the `kds` module is enabled for the committed vertical.                                                     | **PRODUCTION DEFECT** (Retail) |
| **P0-2 / RETAIL-01** | Products admin fail-opens restaurant addons; catalog load can 404 | `frontend/src/app/(dashboard)/products/page.tsx:131` `isModuleEnabled('addons')` with **no** `verticalId`. `isModuleEnabled` without id uses `getActiveVerticalId()`; renderer bundle can fall back to compile-time `ACTIVE_VERTICAL_ID = 'restaurant'` (`main/modules/verticals.ts:34`, `registry.ts:141-142`). `Promise.all` includes `GET /addon-groups`; one 404 toasts `failedToLoad` for the whole catalog. POS/Tables already pass composition `verticalId`. | Merchant cannot reliably manage SKUs. Accidental restaurant chrome on Retail. | Pass composition `verticalId` into Products (and any other `isModuleEnabled` call) the same way Tables/POS already do. Isolate addon fetch from catalog fetch. | **PRODUCTION DEFECT** (Retail) |

No financial double-write, restore-broken, or owner-role bypass was found that meets the P0 bar for Restaurant.

---

## 4. P1 Findings

Should be fixed or **formally accepted** before the relevant pilot. Not immediate financial corruption.

### Product / engineering

| ID                  | Finding                                                                                                  | Evidence                                                                                                                                                                                                                                                                                         | Impact                                                                           | Required action                                                                                                                          | Class                                  | Applies                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| **P1-01 / INV-01**  | Cancel restores stock with no paid-bill or already-cancelled guard                                       | `main/routes/orders.ts:1228-1245` — `cancelled` path calls `restoreTrackedStock` for non-voided items, then updates status. Repeat PATCH restocks again.                                                                                                                                         | Inventory inflation after a paid sale or double-cancel.                          | Guard already-cancelled and paid-bill (refund path owns money; cancel must not restock paid lines).                                      | **PRODUCTION DEFECT**                  | Both                                     |
| **P1-02 / INV-02**  | Voided lines block last-item restock catch-up                                                            | Catch-up treats voided / `void_adjustment` siblings as still “active,” so cancelled remainder may not restock; table can stay held.                                                                                                                                                              | Stuck floor state; missing restock.                                              | Filter voided lines out of the “order still active” catch-up predicate.                                                                  | **PRODUCTION DEFECT**                  | Restaurant (tables); inventory generally |
| **P1-03 / SEC-01**  | Chef may PATCH pending orders to `cancelled`                                                             | `orders.ts:1114-1116` `requireRole(..., 'chef', ...)`. Manager PIN only when in-progress (`orders.ts:1158-1165`).                                                                                                                                                                                | Kitchen role can cancel unpaid pending tickets without PIN.                      | Restrict cancel to owner/manager/cashier/waiter (or require PIN for chef).                                                               | **ACCIDENTAL GAP**                     | Restaurant                               |
| **P1-04 / FIN-02**  | Gross/Net omit FIN-01 repay bills stuck at `partial`                                                     | `payment-tender.ts:574-579` sets `paid` vs `partial` from **net** `paid_amount` vs total, which can wipe refund-aware status. `reports.ts:218-226` Gross/Net only `payment_status IN ('paid','partially_refunded','refunded')`. Phase 4.10 was **display-only** by design (do not write status). | Day sales under-count bills that are collectible-complete but stored `partial`.  | Report from gross-tender / collectible semantics, or include the stuck-`partial` FIN-01 case. Do **not** “fix” by rewriting bill status. | **PRODUCTION DEFECT** (reporting)      | Both                                     |
| **P1-05 / REST-04** | Discount API allows mutation of non-completed orders that already have bills, including refunded/partial | `orders.ts:1407-1429` blocks only `completed` / `cancelled` order status and split checks — not settled/refunded bills.                                                                                                                                                                          | Discount after money movement.                                                   | Block discount when a bill exists in a settled/refunded state.                                                                           | **PRODUCTION DEFECT**                  | Both                                     |
| **P1-06 / REC-02**  | Unopenable / corrupt SQLite can quit instead of recovery UI                                              | REC-01 covers missing/empty DB. `DatabaseRecoveryRequiredError` does not latch a hard `new Database()` throw into `/recovery`.                                                                                                                                                                   | Operator sees a crash instead of restore.                                        | Latch unopenable DB into the existing recovery UI.                                                                                       | **ACCIDENTAL GAP**                     | Both                                     |
| **P1-07 / REC-03**  | KDS bind failure (`EADDRINUSE` after retries) quits the whole POS                                        | `index.ts:698` `await startKdsServer()`; initialize catch → `app.quit()`.                                                                                                                                                                                                                        | Billing dies because a companion port is busy.                                   | Degrade: log + continue POS; do not quit.                                                                                                | **PRODUCTION DEFECT**                  | Both (worse on Retail)                   |
| **P1-08 / ISO-03**  | Renderer KDS/Orders omit `verticalId`; fetch failure fail-opens KDS                                      | `kds/page.tsx:24-31` `isFeatureAvailable('kds', flagOn)` / catch `isFeatureAvailable('kds', true)` with no `verticalId`.                                                                                                                                                                         | Restaurant: hiccup shows KDS. Retail: UI twin of P0-1.                           | Pass composition `verticalId`; fail-closed on fetch error.                                                                               | **PRODUCTION DEFECT**                  | Retail P0-adjacent; Restaurant P1        |
| **P1-09 / ISO-08**  | Server App always starts on `:3003`                                                                      | `index.ts:700-701` `await startServerApp()` ungated.                                                                                                                                                                                                                                             | Extra LAN surface on Retail; Restaurant may want it.                             | Gate on the server-app module / vertical.                                                                                                | **ACCIDENTAL GAP**                     | Retail required; Restaurant optional     |
| **P1-10 / TEST-01** | Default `npm test` omits every `test:phase-4.*` and `test:inventory-ledger`                              | `package.json` `test` script vs `test:phase-4.1`…`4.15` and `test:inventory-ledger`. `tests/production-retail.test.ts` comments `npm run test:production-retail` but **that script does not exist**. `tests/product-tags-parse.test.ts` is also unwired (QA-INV-TAGS-01).                        | Green CI ≠ Phase 4 / Retail / tags regression.                                   | Wire those suites into the pilot-build gate.                                                                                             | **ACCIDENTAL GAP**                     | Both                                     |
| **P1-11 / HW-01**   | Café printer, cash drawer, and KDS hardware **not verified** on a production machine                     | Print APIs and unit/integration tests exist; P1.6 checklist still **NOT VERIFIED**. Print is **after** `applyPaymentBatch` (`bills.ts` pay then separate print).                                                                                                                                 | First café can take money and fail to print. Money is not rolled back (correct). | On-site printer + drawer + KDS drill before live service.                                                                                | **ACCIDENTAL GAP** (ops evidence)      | Restaurant                               |
| **P1-12 / DRV-01**  | Drive `POST /google-drive/backup-now` is owner JWT **without** Master PIN                                | Local `/backup` and `/download` use PIN. Drive backup-now does not.                                                                                                                                                                                                                              | Stolen owner JWT can push a DB copy to Drive.                                    | Require Master PIN (known P0.6 residual).                                                                                                | **PRODUCTION DEFECT** (authz residual) | Both                                     |

### Human / ops (conditions — not product P0)

| ID         | Finding                                                          | Evidence                                                | Impact                                | Required action                                           |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| **OPS-01** | Guest Wi-Fi + `kds_lan`/`lan` is forbidden                       | P0.1 / P0.6 / `docs/13-operations/runbook.md`           | Cleartext HTTP/WS on guest LAN.       | Enforce staff SSID only on site.                          |
| **OPS-02** | No signed/notarized PILOT/PRODUCTION artifact                    | P1.6 checklist; local pack was adhoc-signed TRAINING/QA | Live café on an unsigned binary.      | Build from a clean tagged commit with production signing. |
| **OPS-03** | Master PIN escrow not completed                                  | P1.6 PENDING                                            | Unrecoverable restore if PIN is lost. | Dual-control escrow before go-live.                       |
| **OPS-04** | Numeric backup policy still pending approval                     | `docs/13-operations/backup-restore.md`                  | RPO/RTO not operator-owned.           | Approve retention + off-box copy.                         |
| **OPS-05** | CEO/CTO/pilot-owner sign-off and café training                   | `docs/13-operations/pilot-signoff.md`                   | Untrained operators.                  | Training + signed `pilot-signoff.md`.                     |
| **OPS-06** | New-machine JWT restore **NOT VERIFIED**                         | P1.6 D12                                                | Replacement POS may not recover JWT.  | Drill on a spare machine.                                 |
| **OPS-07** | Keep `ACTIVE_VERTICAL_ID` unset or `restaurant` on café installs | Phase 3.2 / `.ai/risks.md`                              | Accidental Retail composition.        | Install checklist item.                                   |

---

## 5. P2 Findings

Useful; a café can operate without these. Do not treat as pilot blockers.

| ID        | Finding                                                                                                  | Evidence                                                                  | Impact                                                  | Required action                                                           | Class                       |
| --------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| **P2-01** | Stored `payment_status` / `balance` remain net-after-refund                                              | Phase 4.10 closed **display**; FIN-01 collectible is UI/API remaining-due | Orders list can look “partial” when collectible is zero | Do not write status to match. Accept until a dedicated status ADR.        | INTENTIONAL (4.10) residual |
| **P2-02** | Reports CSV uses UTC calendar days; day-close uses tenant TZ                                             | Phase 4.8; `.ai/risks.md`                                                 | Boundary mismatch vs Z                                  | Document for accountants; do not change without product decision          | INTENTIONAL                 |
| **P2-03** | `topProducts` can include voided lines                                                                   | Reports insights                                                          | Inflated popularity                                     | Filter voids                                                              | ACCIDENTAL                  |
| **P2-04** | WebUSB drawer kick can report success when hardware did not open                                         | Phase 3.6F tests vs hardware                                              | Operator thinks drawer opened                           | Hardware drill; optional firmware ACK later                               | ACCIDENTAL                  |
| **P2-05** | POS client print path may skip `print_logs` that server print writes                                     | Dual print paths                                                          | Incomplete print audit                                  | Unify logging                                                             | ACCIDENTAL                  |
| **P2-06** | Dual 58mm / 80mm column maps                                                                             | Receipt formatter                                                         | Cosmetic wrap on 58mm                                   | Tune after first café printer                                             | POLISH                      |
| **P2-07** | Exchange coordinator is sequential, not one SQLite transaction                                           | ADR-012 accepted this shape                                               | Crash mid-exchange can leave refund without sale        | Document recovery; do not silently rewrite                                | INTENTIONAL residual        |
| **P2-08** | Valuation is catalog `cost` × qty, not WAC/FIFO                                                          | Phase 4.11                                                                | Do not call it WAC                                      | Label as catalog-cost                                                     | INTENTIONAL                 |
| **P2-09** | Default billing postpaid                                                                                 | Order then bill                                                           | Fine for café; retail may prefer pay-first later        | Product choice                                                            | INTENTIONAL                 |
| **P2-10** | JWT in `localStorage` + CSP `'unsafe-inline'`                                                            | P0.6 Phase C deferred                                                     | XSS → API                                               | Phase C — not this audit                                                  | INTENTIONAL deferment       |
| **P2-11** | 86 API can 200 on Retail (documented 4.7)                                                                | Phase 4.7                                                                 | Extra restaurant API if mounted                         | Fail-closed remount already 404s restaurant modules; 86 lives on products | ACCIDENTAL / documented     |
| **P2-12** | Shared order API still accepts dine-in/delivery on Retail                                                | Phase 4.12: UI coerces takeaway; API kept shared                          | History/Restaurant compatibility                        | Do not reject `delivery` on shared API                                    | INTENTIONAL                 |
| **P2-13** | CSV menu import via `/menu-csv` 404s on Retail (correct) but UI may still offer restaurant import chrome | Isolation agent                                                           | Confusing admin                                         | Hide import when module off                                               | ACCIDENTAL                  |
| **P2-14** | REAL money type (P0.3)                                                                                   | Docs-only until approved                                                  | Rounding residual                                       | Frozen — not a pilot rewrite                                              | INTENTIONAL freeze          |

---

## 6. Financial Integrity Verdict

| Question                         | Answer                                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can bills be trusted?            | **YES WITH CONDITIONS.** Totals come from the tax/order path; FIN-01 remaining-due is `bill.total − gross successful tender`. Stored `payment_status` can disagree with collectible (P2-01 / P1-04). |
| Can payments be trusted?         | **YES WITH CONDITIONS.** Idempotency-Key is mandatory. Single-process `withTxn` — no P0 double-collect found. Cash over-tender is intentional change. Non-cash over remaining is 400.                |
| Can refunds be trusted?          | **YES WITH CONDITIONS.** ADR-009 refund service; print is best-effort outside the money txn. Restaurant refund restock is **intentionally off** (ADR-011). Retail restock is a second explicit call. |
| Can shifts be trusted?           | **YES WITH CONDITIONS.** Cash payments require an open shift. First qualifying payment stamps `shift_id`. Lost `flo_terminal_id` can orphan a shift (known ops risk).                                |
| Can day close be trusted?        | **YES WITH CONDITIONS.** Z is a **frozen cash snapshot** (Cash In / Cash Refunds / Net Cash). Do not treat Z as Gross/Net sales.                                                                     |
| Can reports be reconciled?       | **YES WITH CONDITIONS.** Gross/Refunds/Net exist, but FIN-02 drops stuck-`partial` FIN-01 bills. CSV is UTC; Z is tenant TZ.                                                                         |
| Can inventory remain consistent? | **YES WITH CONDITIONS.** All stock writes go through `main/services/inventory.ts`. INV-01 (repeat cancel restock) and INV-02 (void catch-up) are P1, not P0 double-sale decrements.                  |

**No P0 double-write, replay collect, or cross-transaction corruption was demonstrated on the current tree.** Do not redesign the money path.

FIN-01 remains frozen: collectible outstanding = `bill_total − gross_successful_tender`. Refunds never recreate capacity.

---

## 7. Restaurant Pilot Journey

**Scope tested:** code paths + existing integration/UI tests (not a live café). Default vertical: `ACTIVE_VERTICAL_ID` unset → `restaurant`.

| Step                            | Result                                                  | Evidence class                                            |
| ------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Open app / first-run            | PASS in tests                                           | `test:first-run`, REC-01                                  |
| Authentication                  | PASS                                                    | `test:security`, staff authz                              |
| Product / menu                  | PASS                                                    | products routes + Flo UI tests                            |
| Addons                          | PASS (Restaurant module on)                             | `test:order-item-addons`, kitchen addons                  |
| Tables                          | PASS for occupy/free; **merge not built**               | `test:flo-tables`; 4.13 discovery                         |
| Order + hold                    | PASS                                                    | `test:held-orders`, integration lifecycle                 |
| KDS / KOT                       | PASS in automated KDS suites; **hardware NOT VERIFIED** | `test:kds-integration`, `test:kds-contract`               |
| Payment (cash / card / partial) | PASS                                                    | `test:integration-payments`, FIN-01 refunds §19–21        |
| Receipt                         | PASS API; hardware unverified                           | `test:receipt-printing`, `test:bills-print-api`           |
| Refund                          | PASS                                                    | `test:refunds`                                            |
| Inventory effects               | PASS decrement on tracked sale; cancel restock = P1     | inventory-boundary (not in default `npm test`)            |
| Shift                           | PASS                                                    | shift suites inside `test:security`                       |
| Day close + Z                   | PASS                                                    | `test:day-close`, `test:day-close-z`                      |
| Reporting                       | PASS with FIN-02 hole                                   | `test:financial-reporting`; 4.8 not in default `npm test` |

**Operator confusion (not P0):** stored status vs remaining due; Z is cash-only; 86 is Restaurant-only; billed checks cannot merge.

**Recovery:** printer/WhatsApp/cloud failure must not block pay (local-first). KDS port conflict can still quit the app (P1-07).

**Pilot shape:** takeaway + simple dine-in (one table, no billed merge). Do not promise table merge or service charge.

---

## 8. Retail Pilot Journey

**Scope tested:** composition tests + Phase 4.1–4.12/4.15 suites (mostly **outside** default `npm test`) + renderer gating review.

| Step                 | Result                          | Notes                                                 |
| -------------------- | ------------------------------- | ----------------------------------------------------- |
| Login                | PASS                            | Shared auth                                           |
| Catalog              | **FAIL / UNRELIABLE**           | P0-2 Products admin `addons` fail-open                |
| Barcode / SKU search | PASS in 4.1 tests               | POS `product-search` + wedge                          |
| Cart                 | PASS with 4.12 takeaway-only UI | API still accepts dine-in/delivery (intentional)      |
| Payment / receipt    | PASS (shared money path)        | Same FIN-01                                           |
| Order history        | PASS (shared)                   |                                                       |
| Refund               | PASS                            |                                                       |
| Restock              | PASS in 4.2 tests               | Retail-only `POST /refunds/:id/restock`               |
| Exchange             | PASS in 4.5 tests               | Sequential coordinator (P2-07)                        |
| Low stock            | PASS in 4.3 tests               |                                                       |
| Valuation            | PASS in 4.11 tests              | Catalog cost, not WAC                                 |
| Reporting            | PASS with FIN-02                |                                                       |
| Restaurant UI leak   | **FAIL**                        | P0-1 KDS `:3002`; P1-08 `/kds` fail-open; P0-2 addons |

**Verdict:** Retail must not enter a store pilot until P0-1 and P0-2 are closed and `test:production-retail` is a real gate.

---

## 9. Vertical Isolation Verdict

| Layer                   | Restaurant                                            | Retail                                  | Proof                                                                                                                                  |
| ----------------------- | ----------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **UI**                  | Full floor (tables, KDS, addons, 86, delivery chrome) | Must hide restaurant chrome             | POS/Tables pass `verticalId`. Products/KDS/Orders often do **not**. Renderer without `verticalId` → restaurant modules appear enabled. |
| **Routes**              | `/tables`, `/kds` live                                | Should EmptyState / fail-closed         | `/tables` gated in 4.1. `/kds` fail-opens on settings fetch error.                                                                     |
| **APIs (main :3001)**   | Modules mounted                                       | Restaurant prefixes **404**             | Fail-closed remount: `/api/tables`, `/api/kds`, `/api/addon-groups`, `/api/menu-csv`. `test:fail-closed-remount`.                      |
| **Companion processes** | KDS :3002 + Server App :3003 always start             | **Same — leak**                         | `index.ts:697-701`. Isolation **fails** here.                                                                                          |
| **Authorization**       | `requireRole` is role-based, not vertical-based       | Same users, fewer modules               | Module off → 404, not 403. Correct for remount. Direct URL to unmounted API = 404.                                                     |
| **Data behavior**       | Tables occupy/free; KDS notify; addons                | Takeaway UI coerce; restock/exchange on | Shared commerce tables. No restaurant backend fork (constraint honored).                                                               |

**Summary:** Main API composition holds. **Process + renderer composition does not fully hold for Retail.** Café installs must keep `ACTIVE_VERTICAL_ID` unset or `restaurant`.

---

## 10. Offline / Recovery Verdict

Local-first billing is the product law. Cloud must never block pay.

| Dependency                                     | Billing (order / pay / refund money write) | Notes                                                                   |
| ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| App restart                                    | Works                                      | SQLite WAL; open shift may need manager force-close if terminal id lost |
| Network / cloud / WhatsApp / Drive unavailable | **Works**                                  | Outbound-only `cloud-sync`; WhatsApp optional                           |
| Printer unavailable                            | **Money works**                            | Print is after commit; operator reprints                                |
| KDS tablet unavailable                         | **Money works**                            | Tickets queue locally; kitchen blind                                    |
| KDS **port bind failure on POS host**          | **POS can quit**                           | P1-07 — this is the exception                                           |
| LAN failure                                    | Localhost POS works; tablets do not        | `network_mode=localhost` default                                        |
| Missing / empty DB                             | Recovery UI, money routes 503              | REC-01 **PASS** (P1.5/P1.6 DR)                                          |
| Unopenable corrupt DB                          | **May quit**                               | P1-06                                                                   |
| Restore                                        | Master PIN; schema-aware                   | P1.2 GREEN WITH CONDITIONS; new-machine JWT **NOT VERIFIED**            |

**Core billing remains operational when non-core dependencies fail**, except companion-server bind failure and unopenable DB.

---

## 11. Hardware Verdict

| Device                     | Software readiness                                                 | Failure mode vs money                             |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| Network thermal printer    | Implemented; tests mock sockets                                    | Print fail → log; **no money rollback** (correct) |
| USB printer                | Implemented                                                        | Same                                              |
| WebUSB                     | Receipt + refund parity (3.6G); drawer kick (3.6F)                 | False-success possible (P2-04)                    |
| Receipt / refund / Z print | APIs + formatters exist                                            | Best-effort; Z is cash snapshot only              |
| Cash drawer kick           | ESC/POS `ESC p` via `dispatchPrint`; not coupled to payment writes | Kick fail ≠ unpaid bill                           |
| 58mm / 80mm                | Dual maps                                                          | Cosmetic (P2-06)                                  |
| KDS / KOT print            | Implemented                                                        | Kitchen ops, not money                            |

**Hardware failure must not corrupt money state — this invariant holds in code.** Café printer + drawer + KDS remain **ops P1** until an on-site drill is recorded.

---

## 12. Security Verdict

**No authorization bypass of owner/manager-only money or restore APIs was found** in this audit (direct `requireRole` review + existing `test:staff-authz`, `test:orders-authz`, `test:authz-phase3`).

| Operation                        | Owner                 | Manager | Cashier                           | Waiter  | Chef                     |
| -------------------------------- | --------------------- | ------- | --------------------------------- | ------- | ------------------------ |
| Pay / refund (money)             | Yes                   | Yes     | Pay yes; refund per refund routes | Limited | No (except order status) |
| Restock / stock adjust / wastage | Yes                   | Yes     | No                                | No      | No                       |
| 86 availability                  | Restaurant POS roles  | Yes     | Per 4.7                           | Per 4.7 | Kitchen 86 as designed   |
| Customer deactivate / reactivate | Yes                   | Yes     | No                                | No      | No                       |
| Reports / CSV                    | Yes                   | Yes     | Restricted                        | No      | No                       |
| Day close                        | Yes                   | Yes     | No                                | No      | No                       |
| Cash drawer kick                 | Authenticated POS     | Same    | Same                              | Same    | N/A                      |
| DB backup download               | Owner + PIN           | —       | —                                 | —       | —                        |
| Drive backup-now                 | Owner JWT, **no PIN** | No      | No                                | No      | No                       |

**P1 residuals (not bypasses):** chef cancel pending (P1-03); Drive backup-now without PIN (P1-12); JWT in `localStorage` (P2-10). UI hiding is not authorization — API checks exist for the sensitive routes reviewed.

LAN: default `localhost`. `kds_lan`/`lan` is cleartext on staff network — **OPS-01**, accepted with ops from P0.1.

---

## 13. Test Gap Matrix

Default `npm test` (this audit): **PASS** (exit 0, ~173s). That suite is **not** the full Phase 4 matrix.

| Area                                                        | Existing coverage                          | Missing coverage                                                             | Risk                          |
| ----------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------- |
| Smoke / first-run / security / refunds / shifts / day-close | In `npm test`                              | Packaged Electron E2E is 3 Chromium Playwright specs, not the desktop binary | Medium                        |
| Payments / FIN-01                                           | `integration-refunds`, issue-214           | FIN-02 Gross/Net vs stuck-`partial`                                          | Medium                        |
| Fail-closed main API remount                                | `test:fail-closed-remount`                 | Companion KDS/Server App start gates                                         | **High (Retail)**             |
| Production Retail smoke                                     | `tests/production-retail.test.ts`          | **No npm script; not in `npm test`**                                         | **High (Retail)**             |
| Phase 4.1–4.15                                              | Individual `test:phase-4.*` scripts        | None of them in default `npm test`                                           | High if CI is `npm test` only |
| Inventory ledger / wastage                                  | `test:inventory-ledger`, `test:phase-4.15` | Not in default `npm test`                                                    | Medium                        |
| Product tags parse                                          | `tests/product-tags-parse.test.ts`         | Unwired (QA-INV-TAGS-01)                                                     | Medium (Inventory UI crash)   |
| Printer hardware                                            | Unit/integration with mocks                | No café device CI                                                            | Medium (ops)                  |
| Cancel-after-pay restock                                    | Partial order cancel tests                 | Repeat cancel + paid-bill restock                                            | Medium                        |
| Exchange crash mid-flow                                     | 4.5 happy/error                            | Process kill between refund and sale                                         | Low–medium                    |
| Authz matrix                                                | staff/orders/phase3                        | Chef cancel pending explicitly                                               | Low                           |

Do not inflate coverage: **~149 of ~199 test files** are in the default graph (historical count; Phase 4 files are extra scripts). Flakes: port-in-use when leftover Electron holds 3001–3003 (P1.6 noted); not a product bug.

---

## 14. Operational Readiness

| Runbook             | Status      | Notes                                                                                                       |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| Installation        | **PARTIAL** | `pilot-runbook.md` + release checklist. Per-café install still PENDING. Must use signed artifact (OPS-02).  |
| Backup              | **PARTIAL** | Mechanics **READY** (`backup-restore.md`). Numeric policy **PENDING APPROVAL**. Drive backup-now lacks PIN. |
| Restore             | **READY**   | REC-01 + P1.5 DR PASS (RTO 6.12 min, RPO 18 s in that drill). New-machine JWT **NOT VERIFIED**.             |
| Upgrade             | **PARTIAL** | Pre-migration backup automatic. Upgrade-path tests exist. Café must not skip versions blindly.              |
| Rollback            | **READY**   | Restore previous backup + matching or newer app.                                                            |
| Printer setup       | **PARTIAL** | Docs + Settings UI. On-site verification missing.                                                           |
| KDS setup           | **PARTIAL** | Runbook exists; OPS-01 + `network_mode` + firewall 3001–3003.                                               |
| Support diagnostics | **PARTIAL** | Help → Open Logs Folder; no single “support bundle” export.                                                 |
| Incident recovery   | **READY**   | `incident-response.md`, `pilot-incident-log.md`.                                                            |

**Human gates still open:** signed artifact, PIN escrow, OPS-01, backup numbers, training/sign-off.

---

## 15. Intentional Strategic Gaps

These are **not** pilot blockers. Do **not** implement them because competitors have them.

| Gap                                               | Status                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| Aggregators (Swiggy / Zomato / ONDC)              | STRATEGY freeze                                       |
| Payment terminals                                 | STRATEGY freeze                                       |
| Multi-location / multi-tenant SaaS                | ADR-006 first; freeze                                 |
| AI / LLM                                          | STRATEGY freeze                                       |
| Suppliers / PO / receiving                        | STRATEGY freeze                                       |
| Recipes / BOM                                     | STRATEGY freeze                                       |
| Gift cards / store credit                         | Freeze                                                |
| Tips                                              | Out of scope (ADR-014)                                |
| Variants **matrix** UX                            | ADR-013 Accepted identity only; matrix not authorized |
| Service charge **wiring**                         | ADR-014 **Proposed** — human Accept required          |
| Billed-check table merge                          | 4.13 discovery; billed merge ADR_REQUIRED             |
| Unpaid table merge                                | Documented SAFE NOW; **not built**                    |
| Restaurant refund restock                         | ADR-011 — Retail only                                 |
| REAL → cents                                      | P0.3 docs-only                                        |
| Phase 3.5B legacy tax DROP                        | Deferred                                              |
| Phase 3.5C extraction                             | No safe extraction                                    |
| P1.6 Phase C CSP / session JWT                    | Deferred                                              |
| NestJS / Prisma / microservices / schema redesign | Forbidden by this audit                               |
| Phase **4.16**                                    | **Do not invent**                                     |
| Bluetooth printing                                | STRATEGY freeze                                       |

---

## 16. Recommended Next Work

Restaurant is **PILOT READY WITH CONDITIONS**. Do **not** open a feature roadmap. Close gates, then run the café.

Retail is **NOT PILOT READY**. The minimum product work is isolation-only — not a vertical rewrite.

### Restaurant — exact pilot gates

1. **Human:** Production-signed/notarized artifact from a clean tagged commit (OPS-02). TRAINING/QA binaries stay in the lab.
2. **Human:** Master PIN escrow, OPS-01 staff SSID, backup policy numbers, CEO/CTO/pilot-owner sign-off, café training (OPS-03–05, 07).
3. **Ops:** Printer + cash drawer + KDS drill on the café machine; record in the pilot checklist (P1-11). New-machine JWT drill (OPS-06).
4. **Product (accept or fix before live — pick one):**
   - **Accept with training:** never PATCH-cancel a paid order; use refund. **Or**
   - **Fix P1-01 / P1-02** (paid-bill / already-cancelled guard; void catch-up).
5. **Quality:** Include `product-tags-parse` (and Phase 4 money/inventory scripts you rely on) in the artifact’s test gate so Inventory cannot crash on tags.
6. **Keep frozen:** ADR-014, variants matrix, billed merge, aggregators, terminals.

### Retail — minimum to reach a later controlled pilot

1. Do not start KDS or Server App when those modules are off (P0-1, P1-09).
2. Pass composition `verticalId` into Products / KDS / Orders; fail-closed (P0-2, P1-08).
3. Add a real `test:production-retail` script and put it on the retail-pilot gate.

Do **not** start a retail store on this commit.

### After a successful Restaurant pilot

Only then consider (still not 4.16): P1-04 reporting hole, P1-06/07 recovery, P1-03 chef cancel, DRV-01 PIN. Still no Nest/Prisma/forks.

---

## Verification (this audit)

| Gate                      | Result                                  |
| ------------------------- | --------------------------------------- |
| Working tree before       | **Clean** at `5fee6df`                  |
| `npm test`                | **PASS** (exit 0, 2026-08-14)           |
| `npm run lint:backend`    | **0 errors**, 840 pre-existing warnings |
| `frontend` `npm run lint` | **PASS** (exit 0)                       |
| `npm run build`           | **PASS**                                |
| `npm run build:frontend`  | **PASS**                                |
| Production code changed   | **No**                                  |
| Phase 4.16 created        | **No**                                  |

---

## Reviewer note

Final reconciliation ([Reviewer](f30edf48-9560-4e5b-917c-218dadb0ae41)): unsigned artifact, dine-in merge missing, cancel-after-pay, and test gaps are **not** product P0s. KDS-on-retail HTTP 200 and Products addon fail-open **are**. This document follows that bar.

---

## Human decisions required (do not auto-start)

1. Accept or reject a Restaurant café under the gates in §16 (signed artifact + OPS-01 + escrow + printer drill).
2. ADR-014 remains **Proposed** — no wiring.
3. Whether to fix Retail P0s as a dedicated isolation patch (not Phase 4.16).
4. Whether to **code-fix** cancel-after-pay (P1-01) or **train around it** for the first café.
