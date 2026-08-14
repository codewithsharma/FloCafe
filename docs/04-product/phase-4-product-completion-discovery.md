# Phase 4 — Product Completion Discovery

**Date:** 2026-08-14  
**Status:** DISCOVERY COMPLETE — READY FOR PHASE 4.1  
**Schema:** v75 (unchanged — discovery only)  
**Production code:** UNCHANGED  
**Baseline HEAD context:** Phase 3.6G complete (`feat: add WebUSB refund print parity`); Phase 3.1–3.4 complete; 3.5A + 3.6A–G complete; 3.5B DEFERRED; 3.5C no safe extraction

**Related:** [verticals.md](../00-product/verticals.md) · [feature-list.md](../00-product/feature-list.md) · [phase-2-closeout-and-phase-3-gate.md](../03-architecture/phase-2-closeout-and-phase-3-gate.md) · [phase-3.3-production-retail.md](../03-architecture/phase-3.3-production-retail.md) · [phase-3.5-scope-discovery.md](../03-architecture/phase-3.5-scope-discovery.md)

---

## 1. Executive summary

Opervia is a **modular POS composition platform**. Restaurant (22 modules) and Retail (17 shared commerce modules) already compose correctly via `ACTIVE_VERTICAL_ID`. Shared sell → pay → refund → shift → day-close → print is **backend-complete** and well tested.

What is missing is **product completeness**, not architecture:

| Vertical       | Composition           | Product completeness                                              |
| -------------- | --------------------- | ----------------------------------------------------------------- |
| **Restaurant** | Credible              | Café E2E largely shippable; residual polish (money UX, floor ops) |
| **Retail**     | Production-selectable | Shared commerce only — **not** a finished retail product          |
| **Shared**     | Real reuse            | Same modules; F&B residue and thin retail workflows remain        |

**Highest-value missing workflows** (not Phase 3.6-style micro-slices):

1. **Retail vertical honesty** — suppress restaurant chrome; barcode/SKU-first POS depth
2. **Merchandise return with optional restock** — money refund exists; inventory loop broken by design
3. **Owner inventory attention** — low-stock hub beyond badges
4. **Accounting export** — owner/accountant off-ramp
5. **Restaurant floor polish** — table merge, 86, tips (lower than modular Retail credibility)

**Final decision:** **A** — Start Phase 4.1 with the highest-value **SAFE NOW** feature: **Retail floor usability** (vertical IA/chrome suppression + barcode/SKU POS depth). No schema, no money-path change.

P1.6 pilot gates remain intentionally out of engineering focus. Do not reopen 3.5B, 3.5C, REAL→cents, or transaction ownership.

---

## 2. Current platform state

### Runtime

- Electron + Express (`main/`) + SQLite better-sqlite3 WAL · **schema v75**
- Frontend: statically exported Next.js (`frontend/`)
- Vertical lock: `ACTIVE_VERTICAL_ID` at deploy/start (unset → `restaurant`; `retail` = production Retail; `retail-test` = synthetic only)

### Module composition

**Shared commerce (17):**  
`core`, `customer`, `product`, `category`, `inventory`, `pos`, `order`, `payment`, `refund`, `tax`, `shift`, `staff`, `loyalty`, `reporting`, `printing`, `notification`, `backup`

**Restaurant:** shared 17 + `tables`, `kitchen`, `kds`, `menu`, `addons`  
**Retail:** shared 17 only (restaurant HTTP not mounted)

### Phase completion

| Phase   | Status                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| 3.1–3.4 | COMPLETE (fail-closed remount, vertical config, production Retail, correctness residuals)                      |
| 3.5A    | COMPLETE (inventory ledger UI)                                                                                 |
| 3.5B    | DEFERRED (legacy tax columns)                                                                                  |
| 3.5C    | NO SAFE EXTRACTION                                                                                             |
| 3.6A–G  | COMPLETE (refund print, G/R/N UI, stock adjust UI, Z snapshot, inactive customers, drawer kick, WebUSB refund) |

### Product model check

> Opervia is **not** “Restaurant POS with a retail toggle.”  
> It is “one modular POS platform composed from reusable capabilities.”

**Verdict:** Composition model is real. Product depth is asymmetric — Restaurant workflows are deep; Retail reuses Restaurant-shaped commerce UX with gates, not retail-native workflows.

---

## 3. Restaurant product matrix

| Capability                        | Backend             | Frontend | Tests   | Status        | Notes                                                   |
| --------------------------------- | ------------------- | -------- | ------- | ------------- | ------------------------------------------------------- |
| Product catalog / menu            | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | Products + categories; menu module = CSV/addons surface |
| Modifiers / addons                | COMPLETE            | COMPLETE | PARTIAL | **BUILT**     | `addons` module gated                                   |
| Cart / checkout                   | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | `checkout-coordinator`                                  |
| Tables / dine-in                  | COMPLETE            | COMPLETE | PARTIAL | **BUILT**     | Soft-gated; `tables_required` flag                      |
| Held orders                       | COMPLETE            | COMPLETE | PARTIAL | **BUILT**     | Table-scoped                                            |
| KDS / kitchen / KOT               | COMPLETE            | COMPLETE | PARTIAL | **BUILT**     | Module + feature flags                                  |
| Payments                          | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | FIN-01 gross outstanding                                |
| Discounts                         | COMPLETE            | COMPLETE | PARTIAL | **PARTIAL**   | Settled-bill edge residual                              |
| Taxes                             | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | Legacy columns debt (3.5B)                              |
| Refunds (money)                   | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | + receipt print 3.6A/G                                  |
| Refunds → restock                 | MISSING (by design) | N/A      | NONE    | **PARTIAL**   | Same as Retail                                          |
| Receipts / printing               | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | Network/USB/WebUSB                                      |
| Order history                     | COMPLETE            | COMPLETE | STRONG  | **BUILT**     |                                                         |
| Inventory track / adjust / ledger | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | Light F&B inventory                                     |
| Recipes / BOM                     | MISSING             | MISSING  | NONE    | **NOT BUILT** | Future / STRATEGY                                       |
| Customers / loyalty / wallet      | COMPLETE            | COMPLETE | PARTIAL | **BUILT**     |                                                         |
| Shifts / day close / Z (cash)     | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | Cash Z ≠ full sales Z                                   |
| Gross / refunds / net             | COMPLETE            | COMPLETE | STRONG  | **BUILT**     | 3.6B                                                    |
| Table merge                       | MISSING             | MISSING  | NONE    | **NOT BUILT** |                                                         |
| Tips / service charge config      | MISSING             | MISSING  | NONE    | **NOT BUILT** | `service_charge: 0` hardcoded                           |
| Menu 86 workflow                  | PARTIAL             | PARTIAL  | WEAK    | **PARTIAL**   | `is_active` only                                        |

**Restaurant E2E:** Menu → modifiers → table/order → hold → KDS → pay → receipt → refund → inventory (sale/cancel) → day close — **usable**. Missing links: refund restock; table merge; tips; dedicated 86.

---

## 4. Retail product matrix

| Capability                     | Backend  | Frontend   | Tests          | Status        | Notes                                                      |
| ------------------------------ | -------- | ---------- | -------------- | ------------- | ---------------------------------------------------------- |
| Product catalog                | COMPLETE | COMPLETE   | STRONG         | **BUILT**     | Café-shaped Products IA                                    |
| SKU field                      | PARTIAL  | Admin only | PARTIAL        | **PARTIAL**   | Not unique; not in POS search                              |
| Barcode lookup                 | COMPLETE | PARTIAL    | PARTIAL        | **PARTIAL**   | API `?barcode=`; wedge + Enter match; not barcode-first UX |
| Product variants               | MISSING  | MISSING    | NONE           | **NOT BUILT** | Typed `variants` unused; no table                          |
| Cart / retail checkout         | COMPLETE | PARTIAL    | STRONG (money) | **PARTIAL**   | Takeaway forced; delivery still F&B-shaped                 |
| Payments / receipts            | COMPLETE | COMPLETE   | STRONG         | **BUILT**     | Shared                                                     |
| Returns (money)                | COMPLETE | COMPLETE   | STRONG         | **BUILT**     | Orders refund dialog                                       |
| Returns (restock)              | MISSING  | MISSING    | NONE           | **GAP**       | Intentional non-restock                                    |
| Exchanges                      | MISSING  | MISSING    | NONE           | **NOT BUILT** |                                                            |
| Customer association           | COMPLETE | COMPLETE   | PARTIAL        | **BUILT**     |                                                            |
| Stock track / adjust / ledger  | COMPLETE | COMPLETE   | STRONG         | **BUILT**     |                                                            |
| Low stock                      | COMPLETE | PARTIAL    | PARTIAL        | **PARTIAL**   | Filter + badges; no attention hub                          |
| Receiving / suppliers / PO     | MISSING  | MISSING    | NONE           | **NOT BUILT** | STRATEGY frozen / Future                                   |
| Stock transfer                 | MISSING  | MISSING    | NONE           | **NOT BUILT** | Single-location by design                                  |
| Inventory valuation            | PARTIAL  | MISSING    | NONE           | **PARTIAL**   | `products.cost` exists; no report                          |
| Restaurant chrome under retail | N/A      | LEAK       | WEAK           | **RISK**      | Settings `tablesRequired`; weak route fail-closed          |

**Retail E2E:** Product → browse → cart → (thin barcode) → checkout → pay → receipt → history → refund → inventory

| Step                               | Link                                  |
| ---------------------------------- | ------------------------------------- |
| Product / search                   | OK (name; SKU admin-only)             |
| Barcode                            | **Thin**                              |
| Checkout / pay / receipt / history | OK                                    |
| Return                             | **Broken for inventory** (money only) |
| Receiving / variants / exchange    | **Absent**                            |

**Honest product truth** ([verticals.md](../00-product/verticals.md)): production-selectable composition, **not** a finished retail SKU.

---

## 5. Shared module matrix

| Capability                   | Shared?             | Restaurant | Retail | Backend  | Frontend | Tests   | Status           |
| ---------------------------- | ------------------- | ---------- | ------ | -------- | -------- | ------- | ---------------- |
| Product catalog              | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Cart / checkout              | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Payments                     | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Discounts                    | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | PARTIAL | PARTIAL          |
| Taxes                        | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Refunds (money)              | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Receipts / printing          | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Orders / history             | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Stock + ledger + adjust      | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Low stock                    | Yes                 | Yes        | Yes    | COMPLETE | PARTIAL  | PARTIAL | PARTIAL          |
| Customers + inactive         | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | PARTIAL | BUILT            |
| Loyalty / wallet             | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | PARTIAL | BUILT            |
| Shifts / cash drawer         | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Day close / cash Z           | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Gross/refunds/net            | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Tender reports               | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Tax reports                  | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | STRONG  | BUILT            |
| Audit logs                   | Yes                 | Yes        | Yes    | COMPLETE | COMPLETE | PARTIAL | BUILT            |
| Permissions (RBAC matrix)    | Yes                 | Yes        | Yes    | PARTIAL  | PARTIAL  | PARTIAL | PARTIAL          |
| Tables / KDS / addons / menu | No                  | Yes        | No     | COMPLETE | COMPLETE | PARTIAL | Restaurant-only  |
| Barcode-first POS            | Should be           | Thin       | Thin   | PARTIAL  | PARTIAL  | WEAK    | PARTIAL          |
| Returns restock              | Should be           | Gap        | Gap    | MISSING  | MISSING  | NONE    | GAP              |
| Suppliers / PO / receiving   | Should be (later)   | No         | No     | MISSING  | MISSING  | NONE    | DEFERRED         |
| Variants                     | Prefer shared later | No         | Need   | MISSING  | MISSING  | NONE    | P2               |
| Exchanges                    | Prefer shared later | Rare       | Need   | MISSING  | MISSING  | NONE    | P1 after returns |
| Accounting export            | Should be           | Need       | Need   | MISSING  | MISSING  | NONE    | P1               |
| Inventory valuation          | Should be           | Nice       | Need   | PARTIAL  | MISSING  | NONE    | P2               |

**Duplication note:** Capabilities are generally implemented once and composed. Gaps are **missing shared workflows** and **restaurant residue under Retail**, not parallel retail codebases.

---

## 6. Missing workflows

### Critical for modular credibility

1. **Retail floor usability** — hide F&B settings/nav residue; barcode + SKU search; scan-centric POS depth
2. **Merchandise return → optional restock** — close inventory loop after refund
3. **Low-stock owner attention** — dashboard/ops strip using existing `?low_stock=true`
4. **Accounting export** — CSV (or similar) for accountant off-ramp

### Important but secondary

5. **Exchanges** (after return/restock policy)
6. **FIN-01 bill status display** (`QA-FIN01-STATUS-01`)
7. **Restaurant floor polish** — table merge, 86 workflow, tips/service charge
8. **Inventory valuation report** (uses `cost`)

### Not required for “credible POS” now

9. Suppliers / PO / receiving (procurement ERP)
10. True variants matrix
11. Stock transfer / multi-location
12. Recipes/BOM
13. Card PSP reversal / loyalty clawback (policy-heavy money edges)

---

## 7. Backend / frontend gap analysis

For each incomplete capability:

| Capability                | BE?         | FE?           | API?      | Schema?             | Deferred?         | Vert         | Shared?     | Money?  | Inv? | Arch change?                |
| ------------------------- | ----------- | ------------- | --------- | ------------------- | ----------------- | ------------ | ----------- | ------- | ---- | --------------------------- |
| Retail chrome suppression | N/A         | Missing gates | No        | No                  | No                | Retail       | Composition | No      | No   | No                          |
| Barcode/SKU POS depth     | Partial     | Partial       | Exists    | No*                 | No                | Both         | Yes         | No      | No   | No                          |
| Refund restock            | No (policy) | No            | Need      | Maybe movement type | Intentional today | Both         | Yes         | Yes     | Yes  | Policy ADR; avoid redesign  |
| Exchanges                 | No          | No            | Need      | Likely              | No                | Retail-first | Prefer      | Yes     | Yes  | Yes if inventing new domain |
| Low-stock hub             | Yes         | Thin          | Exists    | No                  | No                | Both         | Yes         | No      | Read | No                          |
| Suppliers/PO/receiving    | No          | No            | Need      | Yes                 | STRATEGY/Future   | Retail-first | Yes later   | No      | Yes  | Schema + workflows          |
| Variants                  | No          | No            | Need      | Yes                 | No                | Retail       | Prefer      | No      | Yes  | Schema                      |
| Accounting export         | No          | No            | Need      | No                  | No                | Both         | Yes         | Read    | No   | No                          |
| Table merge               | No          | No            | Need      | Maybe               | No                | Rest         | No          | No      | No   | Small                       |
| Tips / service charge     | No          | No            | Need      | Maybe               | No                | Rest         | Maybe       | Yes     | No   | Careful                     |
| FIN-01 status display     | Partial     | Partial       | Exists    | No                  | P2 QA             | Both         | Yes         | Display | No   | No                          |
| Inventory valuation       | Cost col    | No            | Need      | No                  | No                | Both         | Yes         | No      | Read | No                          |
| Customer deactivate       | No endpoint | Partial       | Need      | No                  | No                | Both         | Yes         | No      | No   | No                          |
| Full sales Z              | Cash Z only | Cash Z        | Day-close | No                  | Doc drift         | Both         | Yes         | Read    | No   | Contract if expanding       |

\*Barcode uniqueness is app-enforced, not DB UNIQUE — integrity hardening optional, not required for 4.1.

---

## 8. Money-path risks

| Risk                                   | Severity      | Phase 4 action                                                |
| -------------------------------------- | ------------- | ------------------------------------------------------------- |
| REAL money storage (P0.3)              | Known         | **Do not reopen**                                             |
| Refund without restock                 | Product gap   | Address via explicit return policy (P0/P1), not silent change |
| FIN-01 status display mismatch         | P2 UX         | Optional polish after SAFE slices                             |
| Cancel-after-pay / discount-on-settled | Residual      | Do not bundle into Retail UX                                  |
| Loyalty clawback on refund             | Policy        | Defer                                                         |
| Card refund = ledger only              | By design     | Defer PSP                                                     |
| Expanding Z beyond frozen cash summary | Contract risk | Do not fold live Gross/Net into Z without new snapshot ADR    |

**Rule:** Phase 4.1 must not change tender, refund math, FIN-01, or day-close formulas.

---

## 9. Inventory risks

| Risk                                             | Severity                    | Phase 4 action                         |
| ------------------------------------------------ | --------------------------- | -------------------------------------- |
| Refund never writes ledger / stock               | Blocks retail return loop   | Policy + controlled restock path later |
| Ledger types only sale/cancel_restore/adjustment | Limits receiving story      | Receiving = later schema               |
| No pre-v75 backfill                              | Historical audit incomplete | Document only                          |
| Seed/test paths may bypass Inventory service     | Test hygiene                | Do not expand                          |
| Valuation without cost discipline                | Misleading reports          | Valuation after cost UX hygiene        |

---

## 10. Vertical-isolation risks

| Risk                                                        | Severity | Evidence                                       |
| ----------------------------------------------------------- | -------- | ---------------------------------------------- |
| Settings exposes `tablesRequired` under Retail              | Medium   | `frontend/.../settings/page.tsx` business form |
| Direct URL to `/tables` under Retail                        | Medium   | Nav hide only; KDS has better empty-state      |
| Held-orders mounted under shared `order` but table-bound    | Low      | Dead end on Retail                             |
| POS cart default `dine_in` then effect flip                 | Low      | Flash/race                                     |
| Loyalty gated in Settings via module; POS via settings flag | Low      | Inconsistent gate style                        |
| Tax packs `businessTypes` may omit `retail`                 | Ops      | Keep `business_type` note from phase-3.3       |
| Accidental `ACTIVE_VERTICAL_ID=retail` on café              | Ops      | Documented                                     |

---

## 11. P0 / P1 / P2 prioritization

Scoring (each 1–5): **V** merchant value · **F** frequency · **R** readiness · **S** safety (5 = very low arch risk) · **L** vertical leverage · **E** effort (5 = low effort).  
**Score** = V+F+R+S+L+E.

### P0 — Build next

| Candidate                                                                                       | V   | F   | R   | S   | L   | E   | Score  | Why                                                                                  |
| ----------------------------------------------------------------------------------------------- | --- | --- | --- | --- | --- | --- | ------ | ------------------------------------------------------------------------------------ |
| **4.1 Retail floor usability** (chrome suppression + route fail-closed + SKU/barcode POS depth) | 4   | 5   | 5   | 5   | 5   | 4   | **28** | Makes Retail composition feel like a product; reuses existing APIs; no money/schema  |
| **Merchandise return + optional restock**                                                       | 5   | 4   | 3   | 2   | 5   | 2   | **21** | Closes Retail E2E inventory loop; touches money+inventory → after 4.1 + short policy |
| **Low-stock attention hub**                                                                     | 3   | 3   | 5   | 5   | 5   | 5   | **26** | Shared quick win; can ship as 4.1b or immediate follow-on                            |

### P1 — After P0

| Candidate                                   | Score band               | Depends on             |
| ------------------------------------------- | ------------------------ | ---------------------- |
| Return/restock implementation (post-policy) | High value / higher risk | Explicit product rule  |
| Exchanges                                   | Medium                   | Return/restock         |
| Accounting export (CSV)                     | High merchant            | Read-only reports APIs |
| FIN-01 status display alignment             | Medium                   | Careful money UX       |
| Restaurant 86 workflow                      | Medium                   | Products `is_active`   |

### P2 — Later

| Candidate                            | Notes                  |
| ------------------------------------ | ---------------------- |
| Inventory valuation report           | Needs cost discipline  |
| Table merge                          | Restaurant polish      |
| Tips / configurable service charge   | Money-adjacent         |
| Customer deactivate API              | Lifecycle completeness |
| Full sales Z (beyond cash day-close) | New frozen contract    |
| True product variants                | Schema + merchandising |
| Barcode DB UNIQUE hardening          | Integrity nicety       |

### Scoring detail — gap questionnaire (P0 set)

**Retail floor usability**

1. BE ready? Mostly (barcode API, composition)
2. FE missing? Yes (gates, SKU search, scan depth)
3. API missing? No
4. Schema missing? No
5. Intentionally deferred? No — documented residual  
   6–8. Retail-first / should be shared patterns  
   9–10. No money / no inventory writes
6. No architecture change

**Return + restock**

1. BE refund yes; restock no  
   2–4. FE/API/schema (movement reason/type) needed
2. Yes — intentional non-restock today  
   6–8. Shared  
   9–10. Yes money + inventory
3. Policy decision required; not microservices

---

## 12. Recommended Phase 4 sequence

```text
4.1  Retail floor usability (SAFE NOW)
       • Module-gate Settings restaurant controls under Retail
       • Route fail-closed for /tables (mirror KDS pattern)
       • POS: SKU in search; strengthen barcode-first feedback
       • Optional: low-stock AttentionStrip item
       • Tests: composition + flo-ui / POS barcode-SKU
       • Non-goals: schema, refund math, suppliers/PO, variants

4.2  Merchandise returns policy + restock slice
       • ADR: when refund restocks (always / optional flag / never for F&B)
       • Inventory movement + UI on refund path
       • Golden money+stock tests
       • Non-goals: exchanges, PSP reverse, loyalty clawback

4.3  Accounting export (owner CSV)
       • Read-only off existing report semantics
       • Non-goals: Tally deep integration, cloud sync rewrite

4.4  Restaurant floor polish (pilot-driven)
       • 86 workflow; table merge if demanded
       • Tips/service charge only with money tests

4.5  Retail merchandising depth (optional)
       • Variants OR receiving — pick one after café/retail proof
```

Do **not** interleave P1.6 human gates into this engineering sequence (explicitly out of focus).

---

## 13. Explicitly deferred items

| Item                                                           | Reason                                                                                                                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 3.5B legacy tax cleanup                                  | Deferred until pilot evidence; Mode B vs DROP undecided                                                                                                                                |
| Phase 3.5C service extraction                                  | No safe extraction found                                                                                                                                                               |
| REAL → cents                                                   | Docs-only until approved                                                                                                                                                               |
| P1.6 pilot human gates                                         | Ops/sign-off; not current eng focus                                                                                                                                                    |
| Package extraction / workspaces                                | Future; no product demand proof                                                                                                                                                        |
| `db.ts` split / event bus / OTel exporter                      | Architecture-for-its-own-sake                                                                                                                                                          |
| Suppliers / PO / receiving / recipes/BOM                       | Closeout Future; STRATEGY freezes ERP procurement before ledger+pilots foundation already met for ledger — still freeze procurement until product chooses Retail depth over café proof |
| Multi-location / transfers                                     | ADR-006; single-location                                                                                                                                                               |
| Payment terminals, aggregators, AI, Bluetooth, SaaS            | STRATEGY Not working on                                                                                                                                                                |
| Microservices / Nest / Prisma / Redis / Kafka / Temporal / K8s | Rejected                                                                                                                                                                               |
| Exchanges before return policy                                 | Dependent                                                                                                                                                                              |

---

## 14. Architecture constraints

- Keep Express + SQLite + Electron monolith; modules as composition metadata
- Restaurant remains safe default
- Money-path and transaction ownership stable
- Restaurant-only capabilities must not leak into Retail (fix leaks in 4.1)
- Shared modules stay genuinely reusable — implement return/restock once, compose both verticals
- No schema change in 4.1
- No reopening closed Phase 3 decisions without a direct blocker

---

## 15. Recommended next implementation slice

### Phase 4.1 — Retail floor usability (SAFE NOW)

**Goal:** Make `ACTIVE_VERTICAL_ID=retail` feel like Opervia Retail, not “Restaurant with tables hidden.”

**In scope**

1. Settings: hide/disable restaurant-only controls (`tablesRequired`, KDS-adjacent residue already partially gated) when `verticalId === 'retail'` / tables module off
2. Route-level fail-closed for restaurant pages under Retail (at least `/tables`; align with `/kds` pattern)
3. POS product search: match **name OR sku OR barcode**; clearer scan-to-cart feedback
4. Tests proving Retail composition UI does not expose tables settings; SKU search adds to cart
5. Docs: update verticals/feature-list honesty after ship

**Out of scope**

- Schema / migrations
- Refund restock
- Suppliers / PO / variants / exchanges
- Money math / day-close / FIN-01
- Service or package extraction
- P1.6

**Acceptance sketch**

- With `ACTIVE_VERTICAL_ID=retail`, owner cannot toggle tables-required in Settings UI
- `/tables` does not offer a working restaurant floor (fail-closed empty/deny)
- POS search by SKU adds the product
- Existing Restaurant vertical UX unchanged when composition is `restaurant`
- Full focused test suite green; no schema bump

---

## 16. Final decision

```text
A. Start Phase 4.1 with the highest-value SAFE NOW feature
   → Retail floor usability (chrome suppression + barcode/SKU POS depth)
```

**Not B:** Top SAFE candidate is unambiguous (composition + existing barcode/SKU fields).  
**Not C:** No architectural blocker; product policy for restock is deferred to Phase 4.2, not a stop.

```text
DISCOVERY COMPLETE — READY FOR PHASE 4.1
Production code: UNCHANGED
Schema: v75 unchanged
```
