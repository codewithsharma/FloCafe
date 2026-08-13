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
- [x] P0.5 / JWT secret storage — IMPLEMENTED → GREEN WITH HARDENING (`p0.2-jwt-secret-storage-audit.md`; `main/services/jwt-secret.ts`; schema v74)
- [x] P0.6 Phase A Electron sandbox + navigation — IMPLEMENTED → GREEN WITH HARDENING (`p0.6-electron-security-audit.md`; `main/security/browser-window-security.ts`; `tests/electron-sandbox-phase-a.test.ts`)
- [x] P0.6 Phase B IPC security discovery — COMPLETE (`p0.6-ipc-security-architecture.md`) → Hybrid D
- [x] P0.6 Phase B1 — orphan IPC removal + restore path allowlist + KDS `open-kds-window` removed — IMPLEMENTED → GREEN WITH HARDENING (`tests/electron-ipc-phase-b1.test.ts`; `npm run test:electron-ipc-b1`)
- [x] P0.6 Phase B2 discovery — COMPLETE (`p0.6-updater-security-audit.md`) → YELLOW; recommend Option B (owner/manager JWT)
- [x] P0.6 Phase B2 implementation — `restart-and-install` owner/manager JWT + audit; GREEN WITH HARDENING
- [x] P0.6 final production security audit — COMPLETE (`p0.6-final-production-security-audit.md`) → **GO WITH CONDITIONS** (score 78 after FIN-01)
- [x] FIN-01 — prevent over-collection after partial-tender + refund (gross-tender outstanding); `integration-refunds` §19–21; CLOSED
- [x] P1.2 discovery — Backup→destroy→restore continuity (`p1.2-backup-restore-continuity.md`) → was YELLOW (58)
- [x] P1.2 implementation — continuity E2E (`tests/backup-restore-continuity.test.ts`; corrupt restore returns `success: false`) → **GREEN WITH CONDITIONS (76)**; REC-01 unchanged
- [x] P1.2 REC-01 recovery discovery — COMPLETE (`p1.2-rec-01-recovery-audit.md`) → was YELLOW
- [x] P1.2 REC-01 implementation — fail-closed missing/empty DB + install marker + recovery UI → **GREEN WITH HARDENING**
- [x] P1.2 REC-01 security review fixes — factory-reset marker order + middleware fail-closed + behavioral tests → **GREEN WITH HARDENING**
- [ ] P0.6 Phase C — CSP / session JWT / GPU sandbox (deferred)
- [ ] P0.7 Documentation truth — roadmap/feature-list/production-readiness match code; Nexora POS vs RestaurantOS identity

## P1 — Pilot reliability

- [ ] P1.1 Cash drawer kick (ESC/POS) + permissions + audit
- [x] P1.2 Backup → destroy DB → restore → verify continuity — **implemented** (GREEN WITH CONDITIONS); REC-01 hardening closed
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
