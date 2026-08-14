# Product Manager Audit — Opervia / FloCafe POS

**Date:** 2026-08-14  
**Role:** Product Manager  
**Product under audit:** Opervia Restaurant (default); Retail = deploy-time vertical composition

---

## 1. Feature Inventory

| Feature                                | Status      | Notes                                                                                          |
| -------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| POS Terminal / Checkout flow           | ✅ Complete | `frontend/.../pos/page.tsx`, `checkout-coordinator.ts`, prepaid/postpaid                       |
| Cart & order management                | ✅ Complete | `frontend/src/store/cart.ts`, held orders, order routes                                        |
| Product/menu catalog                   | ✅ Complete | products/categories/menu CSV; Inventory nav → products                                         |
| Inventory management                   | 🔨 Partial  | Stock + ledger API (`inventory.ts`, `GET /movements`); **no ledger UI**; refunds don’t restock |
| Customer management                    | ✅ Complete | customers routes + page; wallet endpoint                                                       |
| Payment processing (cash, card, split) | ✅ Complete | Manual tenders + split-check; **no card terminal**                                             |
| Discounts, promotions, coupons         | 🔨 Partial  | Discounts work; coupon engine / promo campaigns thin; settled-bill discount gaps in risks      |
| Tax configuration                      | ✅ Complete | Tax packs + engine + settings; snapshots on bills                                              |
| Receipt printing                       | ✅ Complete | Thermal/network/USB/WebUSB; **Bluetooth missing**; refund print deferred                       |
| Shift management / cash drawer         | 🔨 Partial  | Shifts + recon **Complete**; hardware cash drawer kick **Missing** (P1.1)                      |
| Reports & analytics                    | 🔨 Partial  | Daily/sales/tax/top products/insights; no accounting export                                    |
| User roles & permissions               | 🔨 Partial  | 5 hard-coded roles + `requireRole`; no fine-grained permission matrix                          |
| Multi-location support                 | ❌ Missing  | Frozen; ADR-006 not implemented                                                                |
| Offline mode                           | ✅ Complete | Local SQLite SoR; cloud non-blocking                                                           |
| Kitchen Display System (KDS)           | ✅ Complete | In-app + standalone `:3002`; WS updates (Restaurant)                                           |
| Table management                       | ✅ Complete | Tables + occupy/free; merge missing                                                            |
| Modifiers / variants (addons)          | ✅ Complete | Addon groups + POS AddonModal (Restaurant); excluded from Retail                               |
| Returns & refunds                      | 🔨 Partial  | Money refunds Complete; merchandise return/restock Missing                                     |
| Supplier / purchase orders             | ❌ Missing  | Phase 3.5                                                                                      |
| Loyalty / rewards                      | ✅ Complete | Earn/redeem + settings; refunds don’t claw back points                                         |
| WhatsApp messaging                     | ✅ Complete | Optional Baileys integration + page                                                            |
| Google Drive / local backup            | ✅ Complete | Drive optional; local DB tools; recovery UI                                                    |
| Setup / demo onboarding                | ✅ Complete | empty/express/demo seed profiles                                                               |
| Retail vertical                        | 🔨 Partial  | Production composition exists; retail-specific UX depth thin                                   |
| Subscription / billing                 | 🗒️ Stub     | Settings plan/status façade only                                                               |
| Payment terminals (Stripe etc.)        | ❌ Missing  | Frozen P3                                                                                      |
| Tips / service charge config           | ❌ Missing  | Service charge hardcoded 0 in flows                                                            |
| i18n                                   | 🔨 Partial  | en/es/pt dual catalogs                                                                         |
| AI / aggregators                       | ❌ Missing  | Explicitly frozen                                                                              |

---

## 2. User Story Gaps

> As a **cashier**, I need **cash drawer kick on open/pay**, so that the till opens without leaving the POS.  
> As a **manager**, I need **refund receipt printing**, so that customers get proof of refund without a workaround.  
> As an **owner**, I need **inventory movement history in the UI**, so that I can audit stock without SQL.  
> As a **cashier**, I need **returns that restock sellable goods** (when policy says so), so that inventory matches reality after refunds.  
> As an **owner**, I need **accounting export (CSV/CSV-for-Tally)**, so that my accountant doesn’t retype daily sales.  
> As a **manager**, I need **bill payment_status to match collectible outstanding after partial refund**, so that staff aren’t confused by “partial” with no payable balance.  
> As an **owner**, I need a **signed production installer**, so that OS trust dialogs don’t block café go-live.  
> As a **retail clerk**, I need **retail-native UX (barcode-first, no table noise)**, so that Retail feels like a product, not a restaurant with modules off.  
> As an **owner**, I need **multi-location** (later), so that a second store doesn’t mean a second brain.  
> As a **manager**, I need **supplier/PO**, so that I can reorder before stockouts (post-pilot).

---

## 3. Prioritization Matrix

| Feature Gap                                   | User Impact | Effort  | Priority          |
| --------------------------------------------- | ----------- | ------- | ----------------- |
| Signed/notarized pilot artifact + ops gates   | High        | Med     | P0                |
| Phase 3.4 stock/soft-gate correctness         | High        | Low–Med | P0                |
| Doc truth (feature-list / verticals / schema) | High        | Low     | P0                |
| P1.3 failure/recovery matrix                  | High        | Med     | P1                |
| Cash drawer kick                              | High        | Low–Med | P1                |
| Refund receipt print                          | Med         | Low     | P1                |
| QA-FIN01-STATUS-01 bill status alignment      | Med         | Low–Med | P2                |
| Inventory movements UI                        | Med         | Med     | P2                |
| i18n catalog unification                      | Med         | Med     | P2                |
| Accounting export                             | Med         | Med     | P2                |
| Retail UX depth                               | Med         | High    | P3                |
| Suppliers / PO / recipes                      | Med         | High    | P3                |
| Multi-location                                | High        | High    | P3 (frozen)       |
| Card terminals                                | High        | High    | P3 (frozen)       |
| Monetization / subscriptions                  | High (biz)  | Med     | P3 (after pilots) |

---

## 4. MVP Definition

**Honest MVP for first real merchant transaction end-to-end:**

1. Install Opervia Restaurant on one café PC
2. Setup (express/demo) → staff login
3. Create products + tax pack configured for locale
4. Open shift (if cash required)
5. POS: add items (± addons) → place order → (KDS if kitchen) → pay cash/card tender → print receipt
6. Optional refund with PIN + idempotency
7. Day close / cash recon
8. Backup succeeds

**Already largely present in code.** What is _not_ MVP: Retail platform story, suppliers, multi-location, AI, terminals, full RBAC matrix.

---

## 5. Planned vs. Built vs. Missing

### Built & working (evidence)

- Order → Tax → Bill → Pay with Idempotency-Key
- Refunds (M6), shifts (M4), day-close cash − cash refunds (M5/M6)
- Tables, KDS, addons (Restaurant)
- Printing stack, customers, loyalty, reports core
- Backup/restore + recovery UI
- Module composition: restaurant / retail / retail-test
- Setup seed profiles

### Partially built

- Inventory (ledger API, no UI; no refund restock)
- Roles (coarse)
- i18n dual-catalog
- Retail vertical (composition yes, product depth no)
- Discounts edge cases / settled bill
- Doc claims vs code (feature-list stale)

### Entirely missing

- Multi-location, SaaS tenancy
- Suppliers / PO / recipes-BOM
- Card terminals / Stripe
- Cash drawer kick
- Tips / configurable service charge
- Real subscription billing
- Aggregators / AI

---

## 6. Roadmap Recommendation

### Phase 1 (0–30 days) — MVP stabilization

- Close pilot release gates (signing, Master PIN escrow, OPS-01)
- Implement Phase 3.4 correctness residuals
- Fix documentation truth
- Run P1.3 failure matrix on money paths
- Deploy **1** pilot café

### Phase 2 (30–90 days) — Core feature completion

- Cash drawer kick + refund print
- Expand pilot to **3** cafés; chase KPI
- Inventory movements UI; FIN-01 status display fix
- Unify i18n for pilot locales

### Phase 3 (90–180 days) — Growth & scale

- Accounting export
- Soften Retail into a real SKU only if Restaurant KPI met
- Cloud ops health (non-blocking)
- Monetization experiment

### Phase 4 (180+ days) — Ecosystem

- ADR-006 multi-location design → implement
- Payment terminals adapters
- Suppliers/PO/recipes
- Aggregators only after money-path trust

---

## 7. PM Verdict

The product is **ready for a supervised pilot user**, not for self-serve mass adoption. The single biggest product risk is **attention drift**: Phase 3 platform work (Retail vertical, composition) is running ahead of STRATEGY’s “prove cafés first” mandate while **zero real cafés** are live. If you do not freeze platform novelty and burn the next sprint on pilot go-live correctness, you will have an impressive architecture deck and no product-market proof.
