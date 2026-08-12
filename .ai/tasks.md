# Tasks

## Mandate

Canonical direction: `STRATEGY.md`. KPI: **3 cafés × 30 days × zero critical failures**.

## Completed (M4–M5 + UI)

- [x] M4 Shift management (A–E)
- [x] M5 Cash reconciliation + day close (A–H)
- [x] Flo UI redesign Phases 1–12 + dark mode + component/route guards

## P0 — Production blockers (Nexora POS v1.0)

- [x] P0.1 M6 Refund workflow (API + UI green; print deferred)
- [x] P0.2 Financial-ops audit — YELLOW (`docs/15-project-management/p0.2-financial-ops-audit.md`)
- [x] P0.2 follow-up hardening (approved): block re-pay on refunded; reporting Gross/Refunds/Net; `payment.received` audit; mandatory payment Idempotency-Key
- [x] P0.2 day-close cash − cash refunds (reuse `getShiftPaymentSummary`; Cash In / Cash Refunds / Net Cash)
- [ ] P0.3 Money representation migration design + implementation (plan in P0.2 §F; documentation only until approved)
- [ ] Optional refund receipt print
- [x] P0.4 / P0.1 LAN security — IMPLEMENTED → GREEN WITH HARDENING (`docs/15-project-management/p0.1-lan-security-audit.md`)
  - [x] P0.4.1 LAN hardening: `network_mode` bind hosts, mDNS/QR gates, Settings UI, `tests/network-mode.test.ts`; TLS deferred P2
- [ ] P0.5 JWT secret design (safeStorage/keychain, rotation, backup/restore/migration)
- [ ] P0.6 Electron security — sandbox:false justify or migrate; IPC/permissions review
- [ ] P0.7 Documentation truth — roadmap/feature-list/production-readiness match code; Nexora POS vs RestaurantOS identity

## P1 — Pilot reliability

- [ ] P1.1 Cash drawer kick (ESC/POS) + permissions + audit
- [ ] P1.2 Backup → destroy DB → restore → verify continuity (orders/customers/products/staff/shifts/payments/config/audit)
- [ ] P1.3 Failure/recovery testing matrix (offline, printer, crash, power, duplicate pay/order, token expiry)
- [ ] P1.4 Critical E2E workflows for money paths
- [ ] P1.5 Pilot pack — install, backup/restore, recovery, troubleshooting, operator guide, support process
- [ ] P1.6 Deploy 3 real café pilots and feed production issue loop

## P2 — After successful pilots (RestaurantOS foundation)

- [ ] Inventory stock ledger (movements + adjustments) before BOM/procurement
- [ ] Recipes/BOM, wastage (after ledger)
- [ ] Suppliers / PO / receiving
- [ ] Cloud ops (non-blocking billing): config, health, webhooks, fleet
- [ ] ADR-006 Multi-Location Architecture (design only; no code until approved)
- [ ] Analytics/accounting export

## P3 — Explicitly frozen

- [ ] Payment terminals
- [ ] Aggregators (Swiggy/Zomato/ONDC)
- [ ] AI / LLM features
- [ ] Bluetooth printing
- [ ] Multi-tenant SaaS
- [ ] Microservices / K8s / large rewrites
