# Project Manager Audit — Opervia / FloCafe POS

**Date:** 2026-08-14  
**Role:** Project Manager  
**Branch signal:** `modular-verticles` (typo; violates `feat/` prefix convention)  
**Version:** `flo-desktop` 3.0.5

---

## 1. Current Delivery State

| Metric                | Assessment                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall completion    | **~70–75%** for Opervia Restaurant café MVP; **~40%** for “modular multi-vertical platform” vision; **~0%** for live pilot KPI                                       |
| Phase                 | **Release Candidate / Pilot-ready WITH CONDITIONS** — not Production-ready for unsupervised merchants                                                                |
| Last major milestones | Phase 2 CLOSED; Phase 3.1–3.3 COMPLETE (fail-closed remount, `ACTIVE_VERTICAL_ID`, production Retail); P0 security/finance largely green; P1.6 READY WITH CONDITIONS |

Evidence: `.ai/context.md`, `.ai/tasks.md` (~69 checked / ~21 open ≈ 77% mechanical checkbox rate), `docs/03-architecture/phase-2-closeout-and-phase-3-gate.md`, recent commits on modular boundaries (`e6e4a80` vertical config, payment/order/POS isolation).

---

## 2. Task & Work Breakdown

### Implied epics

1. **Money-path correctness** — payments, refunds, FIN-01, day-close
2. **Security hardening** — LAN, JWT safeStorage, Electron sandbox/IPC
3. **Pilot ops / DR** — backup, recovery, runbooks, sign-off
4. **Modular platform** — registry → composition → Retail vertical
5. **Restaurant depth** — tables, KDS, addons, printing
6. **Deferred growth** — multi-location, terminals, AI, PO

### In-flight / partial

| Task                                        | Evidence                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Phase 3.4 correctness residuals             | Design approved; **not implemented** (`phase-3.4-correctness-residuals.md`) |
| P0.3 money REAL→cents                       | Docs-only until approved                                                    |
| P0.6 Phase C (CSP / session JWT)            | Deferred                                                                    |
| P0.7 documentation truth                    | Open                                                                        |
| Uncommitted Phase 3 / frontend modular work | `git status` dirty set at audit time                                        |

### Blocked / waiting

| Task                      | Blocker                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| P1.6 deploy 3 café pilots | Human gates: signed RC, Master PIN escrow, OPS-01, numeric backup policy, CEO/CTO sign-off |
| Monetization              | No product decision                                                                        |
| Multi-location            | ADR-006 not filed/approved                                                                 |
| Cash drawer kick          | P1.1 not started                                                                           |

---

## 3. Risk Register

| Risk                                           | Likelihood                                                      | Impact                     | Mitigation                                                    |
| ---------------------------------------------- | --------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| Offline sync failure in production             | Low for billing (local SoR); Med for cloud/WhatsApp/Drive       | Med                        | Keep cloud non-blocking; train staff on local backup          |
| Payment integration not certified              | High (no PSP)                                                   | Med for card-heavy cafés   | Sell as manual tender; defer terminals                        |
| Test suite exists but gaps remain              | Med                                                             | High                       | Run P1.3 failure matrix; keep `npm test` green on money paths |
| Single-threaded platform distraction           | High                                                            | High                       | Freeze Phase 3.5+ until pilots start                          |
| Scope creep from unstructured TODOs            | Low in code (few TODOs); **High in docs/architecture ambition** | High                       | Enforce STRATEGY “Not working on”; gate PRs to pilot KPI      |
| Unsigned/notarized RC delay                    | High                                                            | High                       | Parallelize certs/signing ownership                           |
| Brand/schema doc drift → bad field decisions   | High                                                            | Med                        | P0.7 doc truth sprint                                         |
| Void×cancel stock over-restore                 | Med                                                             | High (inventory integrity) | Phase 3.4 implementation                                      |
| Accidental `ACTIVE_VERTICAL_ID=retail` on café | Med                                                             | High                       | Document in `.env.example`; fail ops checklist                |

---

## 4. Dependency Map

```
Core commerce: Product → Tax → Inventory → Order → Payment → Refund
                    ↑                ↑
                 Tax packs      stock ledger (v75)

Restaurant only: Tables ←→ Order side effects; KDS ←→ Order/Payment notify
POS (frontend): orchestrates Order/Payment/Tax HTTP — does not own math
Platform: modules/catalog → registry → composition → route mounting (fail-closed)
Cloud/Drive/WhatsApp: optional; must not block billing
Shifts: gate cash tenders when require_open_shift_for_cash
```

**Blocked features:** Inventory UI blocked by product prioritization (API exists). Retail UX depth blocked by Restaurant pilot focus (correct). Multi-location blocked by ADR-006.

**Circular deps:** Soft module deps validated; no hard package cycles found. Historical risk is route↔service↔db concentration inside monolith files, not import cycles.

---

## 5. Timeline Assessment

| Target                                                 | Realistic estimate                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| MVP first real merchant transaction (supervised pilot) | **2–6 weeks** if signing + ops gates close this sprint; else **slip indefinitely** on human blockers |
| v1.0 full feature set, tested, production-ready        | **4–6 months** for Restaurant v1.0 hardened; **12+ months** for multi-vertical platform              |

### Top 3 schedule risks

1. **Pilot human/process gates** (signing, escrow, site ops) — engineering cannot code past them
2. **Platform scope creep** (Phase 3.5, more verticals) stealing capacity from café reliability
3. **Money migration (REAL→cents)** if started without approval — multi-week landmine

---

## 6. Team & Process Signals

| Signal                 | Evidence                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured process     | Strong: STRATEGY, ADRs, `.ai/` memory, numbered docs, Conventional Commits guidance                                                         |
| CHANGELOG              | Present (`CHANGELOG.md` starts `[3.0.5] - 2026-08-12`)                                                                                      |
| CI gates               | GitHub Actions CI on `main`; release + nightly                                                                                              |
| Contributors           | Multiple: khaira777 (372), Bankim (352), Gurkirat, Dev Raj Sharma, carvalab, Archit, dependabot — **not a single-dev project historically** |
| Current branch hygiene | Weak: `modular-verticles` typo, large dirty working tree                                                                                    |

---

## 7. PM Verdict

The project will **not** “ship on time” against a vague platform vision because that vision has no revenue deadline — but it **can** ship a café pilot in weeks if leadership freezes architecture tourism. The #1 timeline killer is **not code quality**; it is **failure to close human release gates while continuing to open new modular workstreams**. Treat Phase 3.4 as the last platform bite before pilots, then stop.
