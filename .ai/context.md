# Opervia context

**Product brand (canonical):** Opervia — modular business platform; Phase 1 vertical = **Opervia Restaurant**.
**Nexora POS:** retired as active product name (historical audits may still say Nexora).
**Repo legacy:** FloCafe / Flo POS naming may linger in code/docs until branding consolidation.
**Modular vision:** ADR-010 + Phase 2 module registry (`main/modules/`) — Restaurant vertical declarative; no Phase 1 rewrite.
**Canonical strategy:** `STRATEGY.md` (pilot KPI unchanged).

Runtime: Electron + Express (`main/`) + SQLite (better-sqlite3, WAL, `PRAGMA user_version` → **schema v75**) + statically exported Next.js (`frontend/`).

## Stage

Advanced single-location café POS. Executive scores (audit 2026-08-12): Product 68 · Eng 78 · Arch 70 · Sec 66 · Rel 74 · Test 84 · Prod 62 · **Overall 64/100**. CEO: GO WITH CHANGES. CTO: ARCHITECTURE READY WITH CHANGES.

**Post-4.15 pilot-readiness (2026-08-14):** Restaurant **78/100 — PILOT READY WITH CONDITIONS**. Retail **57/100 — NOT PILOT READY**. Canonical audit: `docs/05-production/post-phase-4.15-pilot-readiness-audit.md`. No Phase 4.16.

## Modular architecture status

| Layer | State |
|-------|--------|
| **Opervia** | Canonical platform brand |
| **Opervia Restaurant** | Active production vertical (default; unset `ACTIVE_VERTICAL_ID` → `restaurant`) |
| **retail** | Production Retail vertical (`ACTIVE_VERTICAL_ID=retail`); **NOT PILOT READY** until KDS/Server App + Products `verticalId` isolation (post-4.15 audit) |
| **retail-test** | Synthetic composition; selectable via env for validation only — not production Retail |
| **Phase 2** | **CLOSED** — final exit + closeout gate `docs/03-architecture/phase-2-closeout-and-phase-3-gate.md` (also `phase-2-final-exit-gate.md`). **PASS WITH DOCUMENTED DEFERMENTS**. |
| **Phase 3** | **3.1–3.4 COMPLETE**; **3.5A–3.6G COMPLETE** (3.5B DEFERRED; 3.5C no safe extraction). Deploy/start: `ACTIVE_VERTICAL_ID` env (unset→`restaurant`; empty/unknown fail-closed); `retail` = production Retail; `retail-test` = synthetic validation only. |
| **Phase 4** | **4.1–4.15 COMPLETE** (4.6 ADR-013 Accepted; 4.14 ADR-014 Proposed, not wired). Do not reopen 3.5B / 3.5C / REAL→cents / P1.6. Do not invent 4.16. |

Phase 2 delivered: registry → … → 2.14 Order → 2.15 Payment → 2.16 POS → 2.17 Restaurant isolation → 2.18 synthetic Retail → final exit → **closeout / Phase 3 gate**.

## Active work — Opervia Restaurant v1.0 / pilot hardening

**North-star KPI:** 3 cafés × 30 days × zero critical failures.

**P0 (in flight / next):**
1. M6 Refunds API + Orders refund UI — **GREEN** (receipt print: Phase 3.6A)
2. P0.2 financial hardening — **implemented** (re-pay block, reporting semantics, payment audit, mandatory payment Idempotency-Key, day-close Cash In − Cash Refunds)
3. Money-path REAL→cents migration — **documentation only** until approved
4. LAN security / HTTP exposure — **IMPLEMENTED** (`network_mode` localhost|kds_lan|lan; audit `p0.1-lan-security-audit.md` → GREEN WITH HARDENING)
5. JWT secret storage — **IMPLEMENTED** (safeStorage → `jwt-secret.enc`; GREEN WITH HARDENING)
6. Electron sandbox / process security — **Phase A/B1/B2 GREEN WITH HARDENING**; **Final P0.6 audit: GO WITH CONDITIONS** (`p0.6-final-production-security-audit.md`, score **78/100** after FIN-01). Phase C deferred.
7. **FIN-01** — prevent over-collection after partial pay + refund — **CLOSED** (gross-tender outstanding)

**Frozen until pilots prove reliability:** AI, aggregators (Swiggy/Zomato/ONDC), multi-tenant SaaS, multi-location implementation, ERP inventory, payment terminals, Bluetooth print, microservices.

## Already shipped (do not rebuild)

M2 privacy consent · M3 audit_logs · M4 shifts · M5 cash recon + day close · **M6 refunds API** · Flo UI redesign Phases 1–12 · KDS · printing · tax · payments · loyalty · WhatsApp · Drive · FloAdmin outbound bridge · **Phase 2 modular foundation (2.1–2.18) CLOSED** · Phase 2 hardening (Zod/OTel/i18n) · **Phase 3.1–3.3 COMPLETE** (fail-closed remount; deploy/start vertical; production Retail).

## Architecture anchors

- Modules: `main/modules/` (catalog, registry, diagnostics, composition, verticals, fixtures)
- Inventory: `main/services/inventory.ts`, `main/routes/inventory.ts`
- Order: `main/services/order.ts` (ownership facade), `main/routes/orders.ts` (incl. item cancel/restore; soft-gated tables/kds)
- Payment: `main/services/payment-tender.ts` (prepare/apply tender), `main/routes/bills.ts` (HTTP); soft-gates tables/kds on paid
- POS: `frontend/src/lib/pos/checkout-coordinator.ts` (HTTP orchestration); `orchestration.ts` ownership markers
- Tax: `main/services/tax.ts` facade (not direct `tax-engine` from routes)
- Shifts: `main/services/shift.ts`, `main/routes/shifts.ts`, `frontend/src/lib/shifts.ts`
- Cash classification: `main/services/payment-cash.ts`
- Day close: `main/services/day-close.ts` + `main/routes/reports.ts`
- Refunds: `main/services/refund.ts`, `main/routes/refunds.ts` (ADR-009); optional restock `main/services/refund-restock.ts` + `POST /api/refunds/:id/restock` (ADR-011); refund proof print via `POST /printers/print-refund` + `print_type: refund` audit (Phase 3.6A)
- Terminal id: `frontend/src/lib/terminal-id.ts` (identification only, not auth)
- Cloud: outbound-only `main/services/cloud-sync.ts` — never blocks billing

## Formulas (M5 + M6 + FIN-01)

- `expected_cash_cents = opening_float_cents + SUM(qualifying cash on bills WHERE shift_id = shift) - SUM(completed cash refunds WHERE refunds.shift_id = shift)`
- `variance_cents = counted_cash_cents - expected_cash_cents` when counted provided; else `NULL`
- Card/wallet refunds do not change expected cash
- **Collectible outstanding** = `bill_total − gross_successful_tender` (refunds never recreate capacity)
- **Net paid** = `gross_successful_tender − completed_refunds` (`bills.paid_amount`)

## Next step

**Pilot-readiness audit COMPLETE.** Do not invent 4.16. Do not auto-start implementation.

- **Restaurant:** execute the §16 café gates (signed artifact, OPS-01, PIN escrow, printer drill, cancel-after-pay accept-or-fix). Human decision required.
- **Retail:** do not pilot until KDS/Server App are module-gated and Products/KDS pass composition `verticalId`.
- ADR-014 remains **Proposed** (no wiring). Schema v75.
