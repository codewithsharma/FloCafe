# CEO Audit — Opervia / FloCafe POS

**Date:** 2026-08-14  
**Role:** Chief Executive Officer  
**Canonical brand:** Opervia (repo still FloCafe; historical Nexora retired)  
**North-star KPI:** 3 cafés × 30 days × zero critical failures (`STRATEGY.md`)

---

## 1. Product-Market Fit Assessment

### What type of POS is this?

**Opervia Restaurant** — local-first Electron café/restaurant POS with tables, KDS, addons, tax packs, shifts, refunds, and printing. A **production Retail** vertical exists as deploy-time composition (`ACTIVE_VERTICAL_ID=retail`) sharing commerce modules without tables/kitchen/KDS — it is **not** a full retail ERP SKU.

### Who is the target customer?

**Primary:** Owner-operator of a **single-location** café or small restaurant (`STRATEGY.md` “Who it's for”). SMB, not enterprise chains. Not multi-tenant SaaS.

### Feature alignment

Aligned with what a café needs **today** for service: take order → kitchen → pay → cash recon → refund → backup/recover. Gaps that hurt café ops: cash drawer kick (P1.1), signed install friction, refund receipt print deferred, failure-matrix not fully closed (P1.3).

### Competitive set

Competes (conceptually) with **Toast, Square for Restaurants, Lightspeed Restaurant, Petpooja, POSIST, Shine**, and various India/SEA café POS tools — plus free/open local tools. Differentiation from code + STRATEGY:

| Differentiator                                                       | Evidence                                                  |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| Local-first / offline billing without seat fees                      | SQLite SoR; README “free open-source”; cloud non-blocking |
| Financial ops completeness (shifts, day-close, refunds, idempotency) | M4–M6 + FIN-01 in `.ai/context.md`                        |
| Modular vertical composition                                         | `main/modules/*` Phase 2–3.3                              |
| Desktop packaging (Win/Mac/Linux)                                    | electron-builder in `package.json`                        |

**Unclear from product surface alone:** Why a merchant picks Opervia over Square tomorrow. The pitch is reliability + ownership + no cloud lock-in — that only lands if pilots prove it.

### Is differentiation clear?

Technically yes (architecture + STRATEGY). Commercially **weak until pilots generate proof**. Platform marketing (“power multiple verticals”) is ahead of go-to-market reality; Restaurant is the only product you can honestly sell.

---

## 2. Revenue Model Viability

| Signal                          | Finding                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Subscriptions / seat fees       | Settings “Subscription” shows `plan`/`status` on tenant façade — **cosmetic stub**, no Stripe/Paddle |
| Payment processor take-rate     | **None** — manual cash/card/wallet tenders (`payment-tender.ts`); no Stripe dependency               |
| Licensing                       | Open-source / free posture in README                                                                 |
| Feature flags / plans in schema | Settings flags exist; not a paid tier system                                                         |
| Monetization rating             | ❌ **Not viable as a business model today** — product exists; revenue engine does not                |

**Honest rating:** ⚠️ for a venture-backed “platform” story (architecture supports future SKUs); ❌ for near-term ARR. This is currently a **product company with a reliability thesis**, not a monetized SaaS.

---

## 3. Go-to-Market Readiness

| Question                                    | Answer                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Can a non-technical merchant install today? | **Maybe** with hand-holding. Electron installers exist; pilot docs in `docs/13-operations/` are strong. Signed/notarized production RC still blocked (P1.6 CTO control). |
| Onboarding                                  | ✅ Setup flow: empty / express / demo (`frontend/src/app/setup/page.tsx`; `seedExpressRestaurant` / `seedDemoRestaurant` in `main/routes/auth.ts`)                       |
| Demo / seed                                 | ✅ Demo credentials deactivated post-setup (migration in `db.ts`)                                                                                                        |
| Localization                                | ⚠️ en/es/pt dual-catalog (i18next + legacy) — partial                                                                                                                    |
| Multi-language completeness                 | Not launch-grade for non-English markets                                                                                                                                 |

### Missing before a real merchant goes live

1. Signed/notarized production artifact + CEO/CTO/pilot sign-off
2. Master PIN escrow + OPS-01 (no guest Wi‑Fi on LAN modes)
3. On-site printer + shift training
4. Numeric backup policy approval
5. Cash drawer kick if hardware depends on it
6. Honest sales materials (kill stale `feature-list.md` claims)

---

## 4. Operational Risk

| Risk                  | Status                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Mid-transaction crash | Local SQLite WAL + payment idempotency keys (`bills.ts` Idempotency-Key required ~582+) reduce double-charge risk; P1.3 matrix still open |
| Refund / void         | ✅ Refunds API + UI (M6); voids exist; merchandise restock policy incomplete                                                              |
| Audit trail           | ✅ `audit_logs` (M3), payment.received, shift/day-close recon                                                                             |
| Support path          | Support nav + cloud support ticket outbox; ops runbooks exist — not a 24/7 SaaS support org                                               |
| Day close / cash      | ✅ Day-close with Cash In − Cash Refunds                                                                                                  |

**Biggest operational risk:** Shipping unsigned builds or LAN-exposed cleartext into cafés with guest Wi‑Fi. That creates both security and brand-kill incidents.

---

## 5. Investor Readiness

**One-line pitch:**  
“Opervia is a modular local-first POS platform; Phase 1 is Opervia Restaurant — an offline-capable café POS that owns order, kitchen, cash, and recovery without cloud lock-in.”

| Investor ask                     | Current answer                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------- |
| GMV / AOV / revenue per location | Reports exist for sales/top products/daily stats — **no live merchant metrics** |
| Paying customers                 | **0 pilots deployed** (P1.6 unchecked)                                          |
| Moat                             | Local-first + financial correctness + modular reuse — unproven commercially     |
| Path to revenue                  | Undefined in code (no billing)                                                  |
| Missing                          | Traction, unit economics, GTM channel, pricing, competitive win/loss            |

---

## 6. CEO Verdict

This is a **real product**, not a weekend demo — but it is **not yet a real business**. The next 90 days only matter if they produce **three live cafés** running reliably, not another architecture phase. Stop selling the platform story externally until Restaurant pilots print proof. Fix release gates (signing, ops, Master PIN), put one owner on café success, and define a monetization experiment (support contract, paid tax packs, or hardware bundle) before talking seed investors about ARR.
