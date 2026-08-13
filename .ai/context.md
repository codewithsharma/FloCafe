# Opervia context

**Product brand (canonical):** Opervia — modular business platform; Phase 1 vertical = **Opervia Restaurant**.
**Nexora POS:** retired as active product name (historical audits may still say Nexora).
**Repo legacy:** FloCafe / Flo POS naming may linger in code/docs until branding consolidation.
**Modular vision:** ADR-010 + Phase 2.1 registry (`main/modules/`) — Restaurant vertical declarative; no Phase 1 rewrite.
**Canonical strategy:** `STRATEGY.md` (pilot KPI unchanged).

Runtime: Electron + Express (`main/`) + SQLite (better-sqlite3, WAL, `PRAGMA user_version` → **schema v75**) + statically exported Next.js (`frontend/`).

## Stage

Advanced single-location café POS. Executive scores (audit 2026-08-12): Product 68 · Eng 78 · Arch 70 · Sec 66 · Rel 74 · Test 84 · Prod 62 · **Overall 64/100**. CEO: GO WITH CHANGES. CTO: ARCHITECTURE READY WITH CHANGES.

## Active work — Opervia Restaurant v1.0 / pilot hardening

**North-star KPI:** 3 cafés × 30 days × zero critical failures.

**P0 (in flight / next):**
1. M6 Refunds API + Orders refund UI — **GREEN** (print deferred)
2. P0.2 financial hardening — **implemented** (re-pay block, reporting semantics, payment audit, mandatory payment Idempotency-Key, day-close Cash In − Cash Refunds)
3. Money-path REAL→cents migration — **documentation only** until approved
4. LAN security / HTTP exposure — **IMPLEMENTED** (`network_mode` localhost|kds_lan|lan; audit `p0.1-lan-security-audit.md` → GREEN WITH HARDENING)
5. JWT secret storage — **IMPLEMENTED** (safeStorage → `jwt-secret.enc`; GREEN WITH HARDENING)
6. Electron sandbox / process security — **Phase A/B1/B2 GREEN WITH HARDENING**; **Final P0.6 audit: GO WITH CONDITIONS** (`p0.6-final-production-security-audit.md`, score **78/100** after FIN-01). Phase C deferred.
7. **FIN-01** — prevent over-collection after partial pay + refund — **CLOSED** (gross-tender outstanding)

**Frozen until pilots prove reliability:** AI, aggregators (Swiggy/Zomato/ONDC), multi-tenant SaaS, multi-location implementation, ERP inventory, payment terminals, Bluetooth print, microservices.

## Already shipped (do not rebuild)

M2 privacy consent · M3 audit_logs · M4 shifts · M5 cash recon + day close · **M6 refunds API** · Flo UI redesign Phases 1–12 · KDS · printing · tax · payments · loyalty · WhatsApp · Drive · FloAdmin outbound bridge.

## Architecture anchors

- Shifts: `main/services/shift.ts`, `main/routes/shifts.ts`, `frontend/src/lib/shifts.ts`
- Cash classification: `main/services/payment-cash.ts`
- Day close: `main/services/day-close.ts` + `main/routes/reports.ts`
- Refunds: `main/services/refund.ts`, `main/routes/refunds.ts` (ADR-009)
- Terminal id: `frontend/src/lib/terminal-id.ts` (identification only, not auth)
- Cloud: outbound-only `main/services/cloud-sync.ts` — never blocks billing

## Formulas (M5 + M6 + FIN-01)

- `expected_cash_cents = opening_float_cents + SUM(qualifying cash on bills WHERE shift_id = shift) - SUM(completed cash refunds WHERE refunds.shift_id = shift)`
- `variance_cents = counted_cash_cents - expected_cash_cents` when counted provided; else `NULL`
- Card/wallet refunds do not change expected cash
- **Collectible outstanding** = `bill_total − gross_successful_tender` (refunds never recreate capacity)
- **Net paid** = `gross_successful_tender − completed_refunds` (`bills.paid_amount`)

## Next step

**Phase 2.8 Inventory movement ledger shipped (2026-08-13).** Append-only `inventory_movements` (v75); stock cache retained; refunds still no restock. Next: tax HTTP consolidation, product CRUD stock→ledger, or fail-closed design after pilots.
