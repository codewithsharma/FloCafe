# Combined Brutal Verdict — Opervia / FloCafe POS

**Date:** 2026-08-14  
**Roles combined:** CTO · CEO · Product Manager · Project Manager · Project Coordinator  
**Product:** Opervia Restaurant (canonical); repo legacy FloCafe; Nexora retired

---

## 1. The One-Line Verdict

> This POS project is currently a **pilot-grade local-first café system with strong money-path engineering and zero live merchant proof**, and without **three real cafés running under ops discipline**, it will **remain an impressive architecture portfolio that never becomes a business**.

---

## 2. What Is Actually Working

Demonstrably present in code + tests (not “started”):

- Local SQLite billing path: order → tax → bill → pay with mandatory `Idempotency-Key` (`main/routes/bills.ts` ~582+)
- Refunds with PIN rate limits + idempotency (`main/services/refund.ts`, `main/routes/refunds.ts`)
- Shifts + cash recon + day-close Cash In − Cash Refunds
- FIN-01 gross-tender outstanding (over-collection after partial pay + refund blocked)
- Tables, KDS (HTTP + WebSocket), addons for Restaurant
- Thermal/network printing stack
- Customers, loyalty earn/redeem, core reports
- Setup seed profiles (express/demo)
- Backup/restore + missing-DB recovery UI
- JWT via `safeStorage`, Electron sandbox Phase A/B, LAN `network_mode`
- Module composition with fail-closed remount; production Retail selectable via env
- Large automated regression suite (~179 backend test files) + CI on `main`
- STRATEGY and `.ai/` memory that actually match recent engineering intent

---

## 3. What Is Broken or Dangerous

If shipped broadly **today** without conditions:

| Hazard                                             | Why it matters                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Cleartext HTTP/WS on `kds_lan`/`lan` + guest Wi‑Fi | Session theft, order tampering — OPS-01 violation                            |
| CSP `'unsafe-inline'` + JWT in `localStorage`      | XSS → full API as that user (`http-observability.ts:36–37`)                  |
| Drive `backup-now` without Master PIN              | Owner JWT alone can exfiltrate DB backup                                     |
| Void×cancel stock over-restore residual            | Inventory integrity lie → food cost / theft confusion                        |
| Accidental `ACTIVE_VERTICAL_ID=retail` on café     | Wrong vertical composition in production                                     |
| Unsigned / un-notarized RC                         | OS trust + enterprise/café IT refusal; P1.6 still blocked                    |
| Stale feature docs                                 | Sales/pilot staff promise features that “aren’t built” or miss ones that are |
| No PSP / “card” = manual tender                    | Merchants may assume PCI-processed card — liability if mis-sold              |
| Money stored as REAL                               | Rounding edge cases under load/discounts (migration still docs-only)         |

---

## 4. The Uncomfortable Truths

- You built a **modular platform story faster than you deployed a single café** — that is strategy inversion against your own `STRATEGY.md`.
- **Offline-first is real** (SQLite), but the Service Worker is a **UI cache illusion** if anyone markets it as offline sync.
- **Tests are a strength**, not an absence — claiming “no tests” would be false; claiming “pilots validated” would also be false.
- **Revenue model is cosplay** — Settings Subscription is a stub; there is no Stripe, no seat fee, no processor take-rate.
- **Retail “production” is a composition switch**, not a retail product customers would buy.
- Branding is a **four-name identity crisis** (Opervia / FloCafe / flo-desktop / Nexora AppX) that will confuse every partner, store listing, and new hire.
- The bus factor is not “one developer” historically — it is **one decision maker who keeps opening Phase N while pilots stay closed**.

---

## 5. The 30-Day Survival Plan

Exactly five things, in order, for one focused delivery owner:

1. **Close pilot release gates** — signed/notarized artifact, Master PIN escrow, OPS-01 checklist, numeric backup policy approval, CEO/CTO sign-off.
2. **Implement Phase 3.4 correctness residuals** — stock/soft-gate/void×cancel/HTTP 400; do not start 3.5.
3. **Fix documentation truth** — rewrite `feature-list.md`, `verticals.md`, `local-setup.md`; add `ACTIVE_VERTICAL_ID` to `.env.example`.
4. **Run P1.3 failure matrix** on money + printer + crash + duplicate pay; fix only what fails.
5. **Put Opervia Restaurant into 1 live café** (supervised) and start the 30-day clock — freeze all platform novelty until day 30 lessons land.

---

## 6. Score Card

| Dimension              | Score (/10) | Comment                                                              |
| ---------------------- | ----------- | -------------------------------------------------------------------- |
| Technical Architecture | 8           | Local-first + modular composition is coherent; monolith files remain |
| Code Quality           | 6           | Strict TS + services, but fat files and heavy `any`                  |
| Security               | 6           | Hardened for desktop POS; CSP/JWT/LAN residuals real                 |
| Feature Completeness   | 7           | Café MVP strong; retail/procurement/multi-location weak              |
| Business Viability     | 3           | Product yes; revenue and traction no                                 |
| Documentation          | 7           | Volume excellent; truth drift hurts                                  |
| Delivery Execution     | 6           | Strong engineering cadence; pilot KPI stalled on process             |
| Production Readiness   | 5           | READY WITH CONDITIONS — not mass production                          |
| **OVERALL**            | **6.0**     | Pilot-conditional. Not ship-to-everyone.                             |

---

## 7. Final Recommendation

- [ ] **SHIP IT** — Ready for real merchants with minor fixes
- [x] **CONDITIONAL** — Ship to 1 pilot merchant only, fix these 3 things first:
  1. signed/notarized build + ops/Master PIN gates,
  2. Phase 3.4 inventory/soft-gate correctness,
  3. documentation truth so field staff don’t lie to the café
- [ ] **REWRITE REQUIRED** — The foundation is too broken; specific modules must be rebuilt
- [ ] **STOP** — Fundamental product/market/technical issues that cannot be patched

**Justification:** The foundation is **not** rewrite-level broken — money paths, schema migrations, auth, and tests show a shippable café core. Broad SHIP IT is dishonest without live proof and residual hazards. STOP would discard years of working POS value. **CONDITIONAL pilot** is the only adult recommendation: prove reliability in one café, then three, then talk platform and revenue.
