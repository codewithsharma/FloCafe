# Product Manager — Feature Delta Audit (v2)

**Re-audit date:** 2026-08-15
**Baseline:** `audit/03_PRODUCT_MANAGER_AUDIT.md` (2026-08-14)

---

## 1. Feature Inventory Delta

| Feature                     | Previous Status           | Current Status                | Change                         | Evidence                                                                                             |
| --------------------------- | ------------------------- | ----------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Cash drawer kick            | ❌ Missing                | ✅ Complete                   | ✅ FIXED                       | `POST /api/printers/kick-drawer`; `phase-3.6f-cash-drawer-kick.md`; `tests/cash-drawer-kick.test.ts` |
| Refund receipt print        | 🔨 Partial / deferred     | ✅ Complete                   | ✅ FIXED                       | `POST /printers/print-refund`; Phase 3.6A + 3.6G WebUSB; `tests/refund-receipt-print.test.ts`        |
| Inventory movements UI      | 🔨 Partial (API only)     | ✅ Complete                   | ✅ FIXED                       | `/products/movements`; Phase 3.5A; `tests/inventory-ledger-ui.test.ts`                               |
| Retail UX depth             | 🔨 Partial                | 🔨 Partial (deeper)           | 🔨 PARTIAL                     | 4.1 floor usability, 4.3 low-stock, 4.5 exchange, 4.12 fulfillment; still no PO/matrix               |
| Supplier/PO                 | ❌ Missing                | ❌ Missing                    | ❌ STILL OPEN                  | No suppliers/PO tables under `main/`; feature-list `[FROZEN]`/`[NOT BUILT]`                          |
| Subscription/billing        | 🗒️ Stub                   | 🗒️ Stub                       | ❌ STILL OPEN                  | Settings plan/status façade only                                                                     |
| Multi-location              | 🧊 Frozen                 | 🧊 Frozen                     | ❌ STILL OPEN (correct freeze) | STRATEGY + capability matrix Frozen                                                                  |
| Phase 3.4 residuals         | 🔨 In progress / designed | ✅ Complete                   | ✅ FIXED                       | `phase-3.4-correctness-residuals.md` COMPLETE; void×cancel stock=8 test                              |
| i18n unification            | 🔨 Partial                | 🔨 Partial                    | ❌ STILL OPEN                  | Dual catalogs remain (`.ai/patterns.md`)                                                             |
| Accounting export           | ❌ Missing                | ✅ Complete                   | ✅ FIXED                       | `GET /api/reports/export/bills.csv`; Phase 4.4; tests present                                        |
| Tips/service charge         | ❌ Missing                | ❌ Missing (ADR-014 Proposed) | ❌ STILL OPEN                  | ADR-014 not wired; `service_charge: 0` path                                                          |
| Table merge                 | ❌ / Missing              | 🔨 Partial                    | 🔨 PARTIAL                     | R2 unpaid merge/split; billed merge still ADR_REQUIRED                                               |
| Restaurant 86               | Not in v1 inventory       | ✅ Complete                   | 🆕→✅                          | Phase 4.7 `POST /products/:id/availability`                                                          |
| Inventory valuation         | Not in v1 inventory       | ✅ Complete                   | 🆕→✅                          | Phase 4.11                                                                                           |
| Wastage stock               | Not in v1 inventory       | ✅ Complete                   | 🆕→✅                          | Phase 4.15 + R4 wastage reasons                                                                      |
| Floor ops (waiter/transfer) | Thin                      | ✅ Complete (R2)              | ✅ FIXED                       | Schema v76; `npm run test:r2`                                                                        |
| Kitchen OS deepen           | KDS basic                 | ✅ Complete (R3)              | ✅ FIXED                       | Schema v77; `kitchen-status.ts`; `test:r3`                                                           |
| Inventory OS deepen         | Ledger only               | 🔨 Backend deepen (R4 / v78)  | 🔨 PARTIAL                     | Units, counts, idempotent adjust; no BOM; tasks checkbox may lag                                     |
| FIN-01 display              | Display debt              | ✅ Aligned                    | ✅ FIXED                       | Phase 4.10 collectible outstanding UI                                                                |
| Refund merchandise restock  | ❌ / café gap             | 🔨 Retail-only API            | 🔨 PARTIAL                     | ADR-011 `POST /refunds/:id/restock` for retail verticals                                             |

### New features since first audit (not in prior inventory)

| Feature                      | Status  | Evidence                                |
| ---------------------------- | ------- | --------------------------------------- |
| H1 POS transaction integrity | ✅      | `test:h1`; paid cancel 409              |
| H2 KDS offline/recovery      | ✅      | `test:h2`; stale board + advertise gate |
| H3 Permissions/RBAC harden   | ✅      | `test:h3`                               |
| H4 Restore/conflict harden   | ✅      | `test:h4`                               |
| R0 Restaurant OS blueprint   | Docs ✅ | `docs/00-product/restaurant-os-*.md`    |
| R1 POS core completion       | ✅      | `test:r1` 34/34                         |
| Capability matrix as SoT     | Docs ✅ | `docs/00-product/capability-matrix.md`  |

---

## 2. Roadmap Adherence Check

Previous PM phased roadmap:

| Phase           | Plan                                                 | Actual (code evidence)                                                 |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| **1 (0–30d)**   | Signing, Phase 3.4, doc truth, **1 pilot**           | Phase 3.4 ✅; doc truth 🔨; signing ❌; **0 pilots** ❌                |
| **2 (30–90d)**  | Drawer, refund print, 3 cafés, inventory UI, i18n    | Drawer ✅; refund print ✅; inventory UI ✅; i18n ❌; **3 cafés ❌**   |
| **3 (90–180d)** | Accounting export, Retail SKU decision, monetization | Accounting ✅ early; Retail deepened without café KPI; monetization ❌ |
| **4 (180+d)**   | Multi-location, terminals, suppliers                 | Correctly still frozen/unstarted                                       |

**Verdict:** The project is **not** tracking the PM roadmap. Based on code, it behaves like **Phase 2–3 feature completion + R-wave OS expansion** while still stuck on **Phase 1 pilot gates**. Calendar elapsed since first audit: **1 day** — feature velocity is extreme; pilot velocity is zero.

---

## 3. Attention Drift Check

Previous warning: _“Phase 3 platform work is running ahead of STRATEGY's prove cafés first mandate.”_

| Signal                               | Assessment                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| New module/vertical files            | No new vertical brands; Retail composition deepened (4.x)                                       |
| New architecture docs                | R0 blueprint + R1–R3 production docs + OPS packs — large doc surface                            |
| Commits expanding scope vs hardening | Post-audit chain includes R0→R3 features, Phase 4.x, H1–H4; **no signed RC / live café commit** |
| STRATEGY KPI progress                | **Unchanged at 0 cafés**                                                                        |

**Attention drift: WORSE.** Hardening (H1–H4) was legitimate, but immediately followed by R0–R4 product expansion while Gate 1 (signed pilot) never closed. That is exactly the inversion the first PM audit warned about — now accelerated.

---

## 4. PM Score Update

| Dimension              | Previous | Current | Change | Reason                                                                         |
| ---------------------- | -------- | ------- | ------ | ------------------------------------------------------------------------------ |
| Feature Completeness   | 7/10     | 8/10    | ↑      | Drawer, refund print, movements UI, accounting CSV, floor/kitchen/inventory OS |
| Roadmap discipline     | Weak     | Weaker  | ↓      | Phase 1 pilot still open while Phase 2–4 features shipped                      |
| User-proof (real café) | 0        | 0       | →      | No live merchant                                                               |

---

## 5. PM Delta Verdict

The **product** is closer to a complete café OS on paper and in tests; it is **not** closer to having a real user. Attention drift has **worsened**: the first audit asked for freeze-and-pilot; the codebase answered with R-waves. Feature completeness deserves credit; product strategy adherence does not.
