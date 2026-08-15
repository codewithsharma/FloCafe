# Operavia context

**Product brand (canonical):** OPERAVIA (all caps) / **Operavia** (title case) — modular business platform; Phase 1 vertical = **OPERAVIA Restaurant**.
**Spelling:** Title case is **Operavia**, not Opervia. Legacy `Opervia` path/process matchers remain in uninstallers and kill-ports.
**Nexora POS / FloCafe:** retired as active product names (historical audits may still say Nexora/FloCafe; GitHub repo remains FloCafe).
**Repo legacy:** FloCafe / Flo POS naming may linger in packaging IDs (`appId`, `flo-desktop`, `flocafe` executable) for upgrade continuity.
**Electron `productName`:** `Operavia`.
**Modular vision:** ADR-010 + Phase 2 module registry (`main/modules/`) — Restaurant vertical declarative; no Phase 1 rewrite.
**Canonical strategy:** `STRATEGY.md` (pilot KPI unchanged).
**Branding audit:** `docs/05-production/operavia-branding-normalization-audit.md`.

Runtime: Electron + Express (`main/`) + SQLite (better-sqlite3, WAL, `PRAGMA user_version` → **schema v76**) + statically exported Next.js (`frontend/`).

**Canonical product plan:** `docs/00-product/capability-matrix.md` (Existing / Hardening / Planned / Later / Frozen, 2026-08-14).  
**Complete Restaurant OS (R0):** `docs/00-product/restaurant-os-blueprint.md` · `restaurant-os-roadmap.md` (R0–R16). Docs only until R1+ authorized.  
**Code evidence:** `docs/00-product/feature-list.md`.  
**Active development vertical:** Restaurant only (Retail deferred).

## Stage

Advanced single-location café POS. Executive scores (audit 2026-08-12): Product 68 · Eng 78 · Arch 70 · Sec 66 · Rel 74 · Test 84 · Prod 62 · **Overall 64/100**. CEO: GO WITH CHANGES. CTO: ARCHITECTURE READY WITH CHANGES.

**Post-P0 P1 remediation (2026-08-14):** repeat-cancel restock idempotency; INV-02 void catch-up; KDS/Server App bind degrade. **Human policies H1/H2/H3 implemented (2026-08-14):** paid cancel 409; FIN-02 Gross/Net includes collectible-complete `partial`; chef cancel requires PIN. Restaurant **81/100**; Retail **74/100** — both **PILOT READY WITH CONDITIONS**. ADR-014 remains Proposed. Doc: `docs/05-production/post-p0-pilot-remediation.md`. No Phase 4.16.

## Modular architecture status

| Layer | State |
|-------|--------|
| **Operavia** | Canonical platform brand |
| **Operavia Restaurant** | Active production vertical (default; unset `ACTIVE_VERTICAL_ID` → `restaurant`) |
| **retail** | Production Retail vertical (`ACTIVE_VERTICAL_ID=retail`); companion KDS/Server App now module-gated (P0 isolation 2026-08-14). Store pilot still needs remaining P1s + ops. |
| **retail-test** | Synthetic composition; selectable via env for validation only — not production Retail |
| **Phase 2** | **CLOSED** — final exit + closeout gate `docs/03-architecture/phase-2-closeout-and-phase-3-gate.md` (also `phase-2-final-exit-gate.md`). **PASS WITH DOCUMENTED DEFERMENTS**. |
| **Phase 3** | **3.1–3.4 COMPLETE**; **3.5A–3.6G COMPLETE** (3.5B DEFERRED; 3.5C no safe extraction). Deploy/start: `ACTIVE_VERTICAL_ID` env (unset→`restaurant`; empty/unknown fail-closed); `retail` = production Retail; `retail-test` = synthetic validation only. |
| **Phase 4** | **4.1–4.15 COMPLETE** (4.6 ADR-013 Accepted; 4.14 ADR-014 Proposed, not wired). Do not reopen 3.5B / 3.5C / REAL→cents / P1.6. Do not invent 4.16. |

Phase 2 delivered: registry → … → 2.14 Order → 2.15 Payment → 2.16 POS → 2.17 Restaurant isolation → 2.18 synthetic Retail → final exit → **closeout / Phase 3 gate**.

## Active work — Operavia Restaurant v1.0 / pilot hardening

**North-star KPI:** 3 cafés × 30 days × zero critical failures.

**P0 (in flight / next):**
1. M6 Refunds API + Orders refund UI — **GREEN** (receipt print: Phase 3.6A)
2. P0.2 financial hardening — **implemented** (re-pay block, reporting semantics, payment audit, mandatory payment Idempotency-Key, day-close Cash In − Cash Refunds)
3. Money-path REAL→cents migration — **documentation only** until approved
4. LAN security / HTTP exposure — **IMPLEMENTED** (`network_mode` localhost|kds_lan|lan; audit `p0.1-lan-security-audit.md` → GREEN WITH HARDENING)
5. JWT secret storage — **IMPLEMENTED** (safeStorage → `jwt-secret.enc`; GREEN WITH HARDENING)
6. Electron sandbox / process security — **Phase A/B1/B2 GREEN WITH HARDENING**; **Final P0.6 audit: GO WITH CONDITIONS** (`p0.6-final-production-security-audit.md`, score **78/100** after FIN-01). Phase C deferred.
7. **FIN-01** — prevent over-collection after partial pay + refund — **CLOSED** (gross-tender outstanding)

**Frozen until pilots prove reliability:** AI, aggregators (Swiggy/Zomato/ONDC), multi-tenant SaaS, multi-location implementation, payment terminals / gateways / online payment, Bluetooth print, microservices. **ERP inventory (recipes/BOM/PO)** is 🔵 Planned in `capability-matrix.md` but still needs an authorized slice — do not start from this sentence.

**Already shipped (do not rebuild)**

M2 privacy consent · M3 audit_logs · M4 shifts · M5 cash recon + day close · **M6 refunds API** · Flo UI redesign Phases 1–12 · KDS · printing · tax · payments · loyalty · WhatsApp · Drive · FloAdmin outbound bridge · **Phase 2 modular foundation (2.1–2.18) CLOSED** · Phase 2 hardening (Zod/OTel/i18n) · **Phase 3.1–3.3 COMPLETE** (fail-closed remount; deploy/start vertical; production Retail) · **R1 POS Core Completion GREEN** (illegal transitions, cancel/discount idempotency, required addons, reprint coerce, create/item-discount audits).

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

**Product plan:** Canonical matrix `docs/00-product/capability-matrix.md` + R0 blueprint `docs/00-product/restaurant-os-blueprint.md`. Prefer Hardening / authorized R-waves. Do not invent 4.16. Do not auto-start R1.

**OPS-01 (2026-08-15): CLOSED.** Engineering **PILOT READY WITH CONDITIONS**.

**OPS-02 (2026-08-15): CLOSED.** Live go-live **NO-GO** until signed RC + site checklist.

**R0 (2026-08-15): CLOSED.** Complete Restaurant OS blueprint + R0–R16 roadmap + contracts + simulation.

**R1 (2026-08-15): CLOSED.** POS Core Completion — `docs/05-production/r1-pos-core-completion.md`. Suite `npm run test:r1` 34/34.

**R2 (2026-08-15): CLOSED.** Floor Operations — `docs/05-production/r2-floor-operations.md`. Schema **v76**. Suite `npm run test:r2` 62/62. Unpaid merge/split; waiter assign; transfer harden + UI. Visual floor designer / billed merge / seats / timers remain gaps. **Do not start R3.**

Do not invent 4.16. Do not push.

- **Human/RELEASE + OPS:** signed RC + `ops-02-site-readiness-checklist.md` + `pilot-signoff.md`.
- **Next software (if authorized):** **R3 Kitchen OS** or Hardening (audit trail depth) — only with explicit authorization.
- ADR-014 Proposed. Schema v76. Engineering baseline includes R1+R2 on `restaurant-vertical`.
- Test debt: `security-hardening.test.ts` isolation only (not live blocker).
