# Task Breakdown

> **Authoritative backlog:** [`master-implementation-plan.md`](master-implementation-plan.md) §6 (Feature backlog) and §17 (First 10 milestones)  
> This file tracks **execution checklist** status. Priorities and dependencies are defined in the master plan.

## Phase 0 — Documentation ✅

- [x] Repository safety check
- [x] Codebase discovery
- [x] Generate docs/ structure
- [x] Second-pass audit
- [x] Apply §11 documentation corrections
- [x] Master implementation plan
- [ ] Team review of gap analysis

## Phase 0 — Engineering foundation (M1) ✅

- [x] Add c8 coverage for bills/orders/auth paths
- [x] Document test gate in CI
- [x] Backup/restore verification (automated tests + documented procedure)
- [x] M1 engineering gate test
- [ ] `.env.example` + port documentation (Eng P1 backlog)

## Phase 1 — P1 Product (M2–M8)

- [x] M2: Privacy consent UX (telemetry + diagnostics)
- [x] M3: Design + implement `audit_logs` schema + API
- [ ] M4: Shift open/close UI + API
- [ ] M5: Cash reconciliation + day close
- [ ] M6: Refund workflow
- [ ] M7: Wire audit into remaining void/cancel paths (partial: item cancel in M3)
- [ ] M8: Cash drawer kick

## Eng P1 — Maintainability (parallel, not blocking Phase 1)

- [ ] Extract migrations from db.ts to `main/migrations/`
- [ ] Generate OpenAPI spec from routes (script)
- [ ] Correct/deprecate stale sections of docs/API.md
- [ ] Order/bill service extraction (no behavior change)

## Phase 2–4 — P2 (M9+)

- [ ] M9: Stock movement ledger
- [ ] Configurable service charge (POS UI + API)
- [ ] Payment terminal adapter interface
- [ ] Accounting CSV export
- [ ] Recipe/BOM (after ledger)

## Phase 5 — Design only (M10)

- [ ] M10: Multi-location RFC (ADR-006)

## Phase 6–8 — P3 Future

- [ ] Online ordering webhook outbox
- [ ] Bluetooth printing evaluation
- [ ] AI module RFC (optional)
