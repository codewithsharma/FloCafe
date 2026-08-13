# Tasks

## Mandate

Canonical direction: `STRATEGY.md`. KPI: **3 cafés × 30 days × zero critical failures**.

## Completed (M4–M5 + UI)

- [x] M4 Shift management (A–E)
- [x] M5 Cash reconciliation + day close (A–H)
- [x] Flo UI redesign Phases 1–12 + dark mode + component/route guards

## P0 — Production blockers (Opervia Restaurant v1.0)

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
- [x] P1.2 implementation — continuity E2E (`tests/backup-restore-continuity.test.ts`; corrupt restore returns `success: false`) → **GREEN WITH CONDITIONS (76)**; REC-01 closed in follow-on milestone
- [x] P1.2 REC-01 recovery discovery — COMPLETE (`p1.2-rec-01-recovery-audit.md`) → was YELLOW
- [x] P1.2 REC-01 implementation — fail-closed missing/empty DB + install marker + recovery UI → **GREEN WITH HARDENING**
- [x] P1.2 REC-01 security review fixes — factory-reset marker order + middleware fail-closed + behavioral tests → **GREEN WITH HARDENING**
- [x] P1.2 REC-01 recovery-startup hotfix — missing DB no longer crashes `startServer`/`getNetworkMode`; recovery API + `/recovery` stay alive → **READY FOR DR RE-DRILL**
- [x] P1.5 shift enablement product path — `shifts_enabled` / `require_open_shift_for_cash` Settings API + UI → **DR environment unblocked for shift fixture**
- [x] P1.5 Pilot ops + DR readiness discovery — COMPLETE (`p1.5-pilot-ops-dr-readiness-audit.md`)
- [x] P1.5 Pilot ops pack (docs) — runbook + DR drill worksheet + ops doc updates → **docs GREEN; re-drill after shift-enablement + REC-01 hotfixes**
- [ ] P0.6 Phase C — CSP / session JWT / GPU sandbox (deferred)
- [x] P0.7a Opervia platform architecture docs — ADR-010 + product/architecture/modules docs (2026-08-13)
- [x] P0.7b Opervia branding consolidation — STRATEGY, vision, docs/README, package `productName`, UI i18n/manifest, user-facing main strings (2026-08-13); historical audits preserved; `appId`/linux `executableName` unchanged for upgrade continuity
- [x] P2.1 Lightweight module registry + Opervia Restaurant vertical (`main/modules/`; `tests/module-registry.test.ts`) — **IMPLEMENTED** (metadata seam; no package extraction)
- [ ] P0.7 Documentation truth — roadmap/feature-list/production-readiness match code; CURRENT Opervia Restaurant vs TARGET modular platform
- [x] P2.2 Broaden module consumers (nav/UI) + soft dep diagnostics — **IMPLEMENTED**
- [x] P2.3 Read-only composition snapshot — **IMPLEMENTED** (`phase-2.3-composition-snapshot.md`; in-process only; still no package extraction)
- [x] P2.4 Composition read API + settings module gates — **IMPLEMENTED** (`phase-2.4-platform-composition-api.md`; GET `/api/platform/composition`; tax/shifts/kds/loyalty settings gates)
- [x] P2.5 Synthetic multi-vertical composition validation — **IMPLEMENTED** (`phase-2.5-vertical-composition-validation.md`; `retail-test` fixture; soft deps; printing/notification/backup settings gates)
- [x] P2.6 Module contract + capabilities — **IMPLEMENTED** (`module-contract.md`; `CapabilityId`; soft integrity; ownership + extraction-readiness docs)

## P1 — Pilot reliability

- [ ] P1.1 Cash drawer kick (ESC/POS) + permissions + audit
- [x] P1.2 Backup → destroy DB → restore → verify continuity — **implemented** (GREEN WITH CONDITIONS); REC-01 hardening closed
- [ ] P1.3 Failure/recovery testing matrix (offline, printer, crash, power, duplicate pay/order, token expiry)
- [x] P1.4 Critical E2E workflows for money paths — **packaged full-app QA 2026-08-13** (`full-app-qa-report.md`; READY WITH CONDITIONS)
- [x] Complete GUI feature matrix pass (Electron CDP) — `complete-gui-test-report.md` + `$HOME/nexora-full-app-test/evidence/gui-complete/`
- [x] QA-INV-TAGS-01 — Array.isArray + recursive parseTags verified in rebuilt TRAINING package; regression `tests/product-tags-parse.test.ts` (commit still pending)
- [x] QA-FIN01-OVERPAY-01 — **false positive closed**: cash remaining+1 is change-on-cash (PASS); non-cash remaining+1 rejects 400 (PASS). See `pending-complete-test-report.md`
- [x] Pending-complete matrix — tax advanced, Drive/WA UI, restore UI, light load, JWT file, REC-01 re-drill (`pending-complete-test-report.md`)
- [ ] QA-FIN01-STATUS-01 — align bill `payment_status`/`balance` with FIN-01 collectible outstanding (P2; do not weaken rejection)
- [ ] QA-KDS-ROUTE-01 — packaged static `/kds/` directory index 404 (P3)
- [x] P1.5 Pilot pack — install, backup/restore, recovery, troubleshooting, operator guide, support process (**docs shipped**; execute `dr-drill-worksheet.md` before go-live; numeric backup policy PENDING APPROVAL)
- [x] P1.6 Pilot release readiness audit + checklists — **READY WITH CONDITIONS** (`p1.6-pilot-release-readiness.md`; signoff/incident log/checklist)
- [ ] P1.6 Deploy 3 real café pilots and feed production issue loop (blocked on human gates + signed production artifact)

## P2 — After successful pilots (Opervia modular foundation)

- [x] P2.1 Module registry + Restaurant vertical definition (2026-08-13) — may land before pilots as a non-behavioral seam
- [x] P2.2 Broaden registry consumers + soft dependency diagnostics (2026-08-13)
- [x] P2.3 Read-only composition snapshot (2026-08-13)
- [x] P2.4 Composition GET + settings module gates (2026-08-13)
- [x] P2.5 Synthetic retail-test composition validation (2026-08-13)
- [x] P2.6 Module contract + capabilities (2026-08-13)
- [ ] Fail-closed dependency enforcement (still no packages; after pilot proof)
- [ ] Inventory stock ledger (movements + adjustments) before BOM/procurement
- [ ] Recipes/BOM, wastage (after ledger)
- [ ] Suppliers / PO / receiving
- [ ] Cloud ops (non-blocking billing): config, health, webhooks, fleet
- [ ] ADR-006 Multi-Location Architecture (design only; no code until approved)
- [ ] Analytics/accounting export
- [ ] Additional verticals (Retail/Grocery/Salon/…) only after Restaurant composition model is real

## P3 — Explicitly frozen

- [ ] Payment terminals
- [ ] Aggregators (Swiggy/Zomato/ONDC)
- [ ] AI / LLM features
- [ ] Bluetooth printing
- [ ] Multi-tenant SaaS
- [ ] Microservices / K8s / large rewrites
