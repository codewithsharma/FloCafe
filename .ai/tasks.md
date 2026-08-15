# Tasks

## Mandate

Canonical direction: `STRATEGY.md`. KPI: **3 cafés × 30 days × zero critical failures**.
Product plan: `docs/00-product/capability-matrix.md`. Restaurant OS blueprint: `docs/00-product/restaurant-os-blueprint.md`. Do not auto-implement Planned rows. Do not invent 4.16 (use R-waves). Restaurant-only development target.

## Restaurant capability plan (2026-08-14)

- [x] Adopt capability matrix as canonical product plan (docs + `.ai` + `prompts/` pointers). No production code.
- [x] **H1 POS Transaction Integrity (2026-08-15):** void order audit; item cancel + discount post-tender 409; discount audit; print-bill `print_logs`. `npm run test:h1`.
- [x] **H2 KDS Offline / Recovery (2026-08-15):** live-companion advertise; stale-board UX; one silent status retry on reconnect. `npm run test:h2`. Doc: `docs/05-production/h2-kds-offline-recovery.md`.
- [x] **H3 Permissions / RBAC (2026-08-15):** item cancel/restore/status `requireRole`; POS discount UI owner/manager; Settings deep-link gate; test `createApp` DB role. `npm run test:h3`. Doc: `docs/05-production/h3-permissions-rbac-hardening.md`.
- [x] **H4 Restore / Conflict (2026-08-15):** backup integrity on create; backup/restore audit; cancel TOCTOU; item cancel/restore conflict guards. `npm run test:h4`. Doc: `docs/05-production/h4-restore-conflict-hardening.md`.
- [x] **OPS-01 Pilot release & operations closure (2026-08-15):** baseline `24966ba`; config/runbook/checklist/gates; drill evidence; security-hardening debt documented as test isolation. Docs under `docs/05-production/ops-01-…`, `docs/13-operations/ops-01-…`, `docs/16-release/ops-01-…`. No H5. No Phase 4.16.
- [x] **OPS-02 Live Pilot RC / Site Readiness (2026-08-15):** go-live audit; signed RC missing; site drills PENDING; verdict **NO-GO** for live. Docs: `ops-02-live-pilot-rc-site-readiness.md`, `ops-02-site-readiness-checklist.md`. No H5. No features.
- [x] **R0 Restaurant OS Product Blueprint (2026-08-15):** complete OS capability map, R0–R16 roadmap, architecture, offline/financial contracts, simulation design. Docs under `docs/00-product/restaurant-os-*.md`. Matrix remains SoT for statuses. **Do not start R1.** No production code.
- [x] **R1 POS Core Completion GREEN (2026-08-15):** illegal status transitions; cancel/discount Idempotency-Key; required addon groups; reprint coerce; preview `bill_id`; `order.created` + item discount audits; WebUSB/local print log. Suite: `tests/r1-pos-core-completion.test.ts` (34/34). Do not start R2 / service charge / FIN-01 reopen.
- [x] **R2 Floor Operations GREEN (2026-08-15):** occupy CAS; transfer harden + UI; unpaid merge/split; waiter assign; section UI; audits; schema v76. Suite: `npm run test:r2` (62/62). Doc: `docs/05-production/r2-floor-operations.md`. Do not start R3 / Kitchen OS / inventory.
- [x] **R3 Kitchen OS GREEN (2026-08-15):** `kitchen-status` CAS + timestamps + audit + priority; schema v77; companion wired; UI aging/rush/station/bump/addons; `npm run test:r3` 70/70. Doc: `docs/05-production/r3-kitchen-os.md`. Do not start BOM.
- [x] **R4 Inventory OS GREEN (2026-08-15):** schema v78; units; idempotent stock adjust; stock counts; ledger reconstruct; wastage reasons; counts UI. `npm run test:r4` 53/53. Doc: `docs/05-production/r4-inventory-os.md`.
- [x] **R5 BOM / Recipes / Food Cost GREEN (2026-08-15):** schema v79; recipes + ingredients (product SKUs); deduction at order create/add-items; theoretical food cost cents + basic %; BLOCK insufficient; cancel reverse. `npm run test:r5`. Doc: `docs/05-production/r5-bom-recipes-food-cost.md`. Do not start R6.
- [x] **R4.1 Foundation Stabilization GREEN (2026-08-15):** backup-now Master PIN; Zod money bodies; orders-shared + database/time|order-row extraction; P1.3 matrix; REAL→cents STOP (plan). `npm run test:r4.1`. Doc: `r4-1-foundation-stabilization.md`.
- [x] **R6 Purchasing & Supplier OS GREEN (2026-08-15):** schema v80; suppliers; mappings; PO lifecycle; partial/full receive → inventory `purchase_receipt`; cents on PO money; RBAC; idempotency; concurrency; UI `/products/purchasing`. `npm run test:r6`. Doc: `r6-purchasing-supplier-os.md`. Do not start R7.
- [x] **Foundation priority deepen Phase 1 (2026-08-15):** migrations extract; orders package split; P0.3 dual-write v81; categories Zod; P1.3 closed. Doc: `foundation-priority-deepen.md`. Remaining: full any wipe, Zod residual routes, REAL cutover.
- [x] **Foundation priority deepen Phase 2 (2026-08-15):** prefer-cents readers + dual-write writers; process-kill harness; Zod staff/tables/shifts/KDS/settings/payment-methods; `any` main&lt;600 / orders&lt;50. Doc: `foundation-priority-deepen-phase2.md`. **Ready for R7 authorization — do not auto-start R7.**
- [x] **R7 Customer & CRM OS GREEN (2026-08-15):** schema v82 notes + segment rules; 360; segments; preferences; notes RBAC/audit; loyalty integrate; metrics; `npm run test:r7`. Doc: `r7-customer-crm-os.md`. Do not start R8.
- [x] **R8 Staff & Workforce OS GREEN (2026-08-15):** deepen users staff + shift visibility; search/filters; detail; working; audits; `npm run test:r8`. Doc: `r8-staff-workforce-os.md`.
- [x] **OPS-02 Gate 1 verification (2026-08-15):** Eng vs human/site matrix; suites R3–R8/H1–H4/money/kill/authz/backup/FIN green; `tsc` CONDITION; Gate 1 **PENDING HUMAN/SITE**; live **NO-GO**. No R9. No commit.
- [x] **Clean HEAD build investigation (2026-08-15):** Proved `npm run build` is authoritative ship path; **209** deterministic `main/` strict errors on `94702f8`.
- [x] **Production main TypeScript strict harden (2026-08-15):** **209 → 0**; `npm run build` PASS; full Restaurant regression green. Not R9. No commit.
- [x] **RC packaging verification (2026-08-15):** unsigned `release/mac-arm64/Operavia.app` VERIFIED; signing/notarization BLOCKED. No production source change. R9 unauthorized.
- [x] **Final RC handoff audit (2026-08-15):** Artifact inventory + release-owner signing procedure + pilot matrix documented in OPS-02. Live **NO-GO** until signed RC + site gates. R9 unauthorized. No commit.
- [x] **R9 Slice 1 Expenses GREEN (2026-08-15):** schema **v83**; expenses CRUD+void; Owner/Manager RBAC; audits; `npm run test:r9` 38/38. Remaining R9 slices not started. Live **NO-GO**. Engineering waiver = development only.
- [x] **R9 Slice 2 Audit-Trail Hardening GREEN (2026-08-15):** schema tip **v83** unchanged; `/audit` UI; CSV export; `audit.exported`; `npm run test:r9.2`. Remaining R9 (tax/Z/ops reports/food-cost) not started. Live **NO-GO**.
- [x] **R9 Slice 3 Tax Export GREEN (2026-08-15):** schema tip **v83** unchanged; tax-components CSV + Reports UI; `tax.exported`; `npm run test:r9.3`. Remaining R9 (Z polish / ops reports / food-cost) not started. Live **NO-GO**.
- [x] **R9 Slice 4 Day-close/Z Polish GREEN (2026-08-15):** schema tip **v83**; confirm + clarity + historical date + Z txt export audits; `npm run test:r9.4`. Remaining R9 (ops reports / food-cost) not started. Live **NO-GO**.
- [x] **R9 Slice 5 Ops Finance Reports GREEN (2026-08-15):** schema tip **v83**; ops-finance + expenses CSV; `npm run test:r9.5`. Remaining R9: food-cost report. Live **NO-GO**.
- [x] **R9 Slice 6 Food-cost Report GREEN (2026-08-15):** schema tip **v83**; theoretical COGS + Reports UI; `npm run test:r9.6`. Live **NO-GO**.
- [x] **R9 COMPLETE (2026-08-15):** S1–S6 green; completion doc `r9-completion.md`.
- [x] **R10 Online / QR Ordering GREEN (2026-08-15):** schema **v84**; public QR menu + create dine_in; pay-at-counter; rotate; `npm run test:r10`. Doc: `r10-online-qr-ordering.md`. Workforce OS ≠ R10.
- [x] **R11 Marketing coupons GREEN (2026-08-15):** schema **v85**; `/api/coupons` + apply-coupon via discount path; `npm run test:r11`. Doc: `r11-coupons.md`. No campaign blasts.
- [x] **R12 Reporting / BI thin deepen GREEN (2026-08-15):** Void/Cancel report from `audit_logs`; JSON+CSV; `report.voids_exported`; Reports UI; no schema bump; `npm run test:r12`. Doc: `r12-void-cancel-report.md`. Advanced BI warehouse remains Later.
- [x] **R13 Integrations / Hardware GREEN (2026-08-15):** schema **v86** `print_jobs`; failed print-bill outbox; `GET /api/printers/jobs` + retry; `npm run test:r13`. Doc: `r13-print-queue.md`. Terminals/aggregators Frozen.
- [x] **R14 Reliability / DR thin deepen GREEN (2026-08-15):** Corrupt-openable live DB fail-closed — `checkSqliteIntegrity` + install-state `corrupt_database`; health/money 503; good restore clears latch; `npm run test:r14`. Doc: `r14-corrupt-db-fail-closed.md`. Full DR product / live drill still open. No schema bump.
- [x] **R15 Simulation S1 foundation GREEN (2026-08-15):** test/fixture/docs only; `npm run test:r15` 27/27; open shift → order → pay → close → day-close/Z → local backup; fixtures `tests/fixtures/restaurant-sim/`; banner simulation ≠ OPS-02. Doc: `r15-simulation-s1.md`. KDS/receipt/S2–S10 later.
- [x] **R15 Simulation S1 GREEN (2026-08-15):** sim pack order→pay→Z→backup; `npm run test:r15`. Doc: `r15-simulation-s1.md`. Sim ≠ OPS-02.
- [ ] **R16 Production Release** — **HUMAN BLOCKED** (signed RC + OPS-02 + escrow + exec sign-off). Gate checklist: `r16-release-gate-checklist.md`. Live **NO-GO**. Orchestrator prepared drill/escrow/signoff templates; do not invent PASS.
- [ ] **Next program:** residual Hardening / OPS-02 signed RC when credentials available.
- [ ] **Hardening (prefer next, authorized slice only):** REAL money cutover (drop REAL); residual Zod; durable KDS ticket outbox (still deferred) — or next authorized R-wave. R0–R12 + R14 thin + R15 S1 closed.
- [ ] **Planned (not started):** see matrix — expediter, promotions, gift cards, Advanced BI warehouse, etc. Reuse shipped slices; do not rebuild.
- [ ] **Frozen / later / out of scope:** terminals, gateways, online payment, multi-location, payroll, aggregators, AI, WhatsApp marketing campaigns — do not start.

## Completed (M4–M5 + UI)

- [x] M4 Shift management (A–E)
- [x] M5 Cash reconciliation + day close (A–H)
- [x] Flo UI redesign Phases 1–12 + dark mode + component/route guards

## P0 — Production blockers (Operavia Restaurant v1.0)

- [x] P0.1 M6 Refund workflow (API + UI green; receipt print Phase 3.6A)
- [x] P0.2 Financial-ops audit — YELLOW (`docs/15-project-management/p0.2-financial-ops-audit.md`)
- [x] P0.2 follow-up hardening (approved): block re-pay on refunded; reporting Gross/Refunds/Net; `payment.received` audit; mandatory payment Idempotency-Key
- [x] P0.2 day-close cash − cash refunds (reuse `getShiftPaymentSummary`; Cash In / Cash Refunds / Net Cash)
- [ ] P0.3 Money representation migration design + implementation (plan in P0.2 §F; documentation only until approved)
- [x] Optional refund receipt print (Phase 3.6A)
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
- [x] P0.7a Operavia platform architecture docs — ADR-010 + product/architecture/modules docs (2026-08-13)
- [x] P0.7b Operavia branding consolidation — STRATEGY, vision, docs/README, package `productName`, UI i18n/manifest, user-facing main strings (2026-08-13); historical audits preserved; `appId`/linux `executableName` unchanged for upgrade continuity
- [x] P2.1 Lightweight module registry + Operavia Restaurant vertical (`main/modules/`; `tests/module-registry.test.ts`) — **IMPLEMENTED** (metadata seam; no package extraction)
- [ ] P0.7 Documentation truth — roadmap/feature-list/production-readiness match code; CURRENT Operavia Restaurant vs TARGET modular platform; **capability matrix adopted 2026-08-14** (`docs/00-product/capability-matrix.md`)
- [x] P2.2 Broaden module consumers (nav/UI) + soft dep diagnostics — **IMPLEMENTED**
- [x] P2.3 Read-only composition snapshot — **IMPLEMENTED** (`phase-2.3-composition-snapshot.md`; in-process only; still no package extraction)
- [x] P2.4 Composition read API + settings module gates — **IMPLEMENTED** (`phase-2.4-platform-composition-api.md`; GET `/api/platform/composition`; tax/shifts/kds/loyalty settings gates)
- [x] P2.5 Synthetic multi-vertical composition validation — **IMPLEMENTED** (`phase-2.5-vertical-composition-validation.md`; `retail-test` fixture; soft deps; printing/notification/backup settings gates)
- [x] P2.6 Module contract + capabilities — **IMPLEMENTED** (`module-contract.md`; `CapabilityId`; soft integrity; ownership + extraction-readiness docs)

## P1 — Pilot reliability

- [x] P1.1 Cash drawer kick (ESC/POS) + permissions — **COMPLETE** (Phase 3.6F; manual POS kick; no auto-on-pay)
- [x] P1.2 Backup → destroy DB → restore → verify continuity — **implemented** (GREEN WITH CONDITIONS); REC-01 hardening closed
- [x] P1.3 Failure/recovery testing matrix (2026-08-15 deepen): duplicate pay + logical crash + printer pointer in `test:r4.1`; process-kill mid-txn remains documented debt. Checkbox closed for formal matrix coverage.
- [x] P1.4 Critical E2E workflows for money paths — **packaged full-app QA 2026-08-13** (`full-app-qa-report.md`; READY WITH CONDITIONS)
- [x] Complete GUI feature matrix pass (Electron CDP) — `complete-gui-test-report.md` + `$HOME/Operavia-full-app-test/evidence/gui-complete/`
- [x] QA-INV-TAGS-01 — Array.isArray + recursive parseTags verified in rebuilt TRAINING package; regression `tests/product-tags-parse.test.ts` (commit still pending)
- [x] QA-FIN01-OVERPAY-01 — **false positive closed**: cash remaining+1 is change-on-cash (PASS); non-cash remaining+1 rejects 400 (PASS). See `pending-complete-test-report.md`
- [x] Pending-complete matrix — tax advanced, Drive/WA UI, restore UI, light load, JWT file, REC-01 re-drill (`pending-complete-test-report.md`)
- [x] QA-FIN01-STATUS-01 — **display aligned** (Phase 4.10): UI uses collectible outstanding; stored `payment_status`/`balance` unchanged; rejection not weakened
- [ ] QA-KDS-ROUTE-01 — packaged static `/kds/` directory index 404 (P3)
- [x] P1.5 Pilot pack — install, backup/restore, recovery, troubleshooting, operator guide, support process (**docs shipped**; execute `dr-drill-worksheet.md` before go-live; numeric backup policy PENDING APPROVAL)
- [x] P1.6 Pilot release readiness audit + checklists — **READY WITH CONDITIONS** (`p1.6-pilot-release-readiness.md`; signoff/incident log/checklist)
- [ ] P1.6 Deploy 3 real café pilots and feed production issue loop (blocked on human gates + signed production artifact)

## P2 — After successful pilots (Operavia modular foundation)

- [x] P2.1 Module registry + Restaurant vertical definition (2026-08-13) — may land before pilots as a non-behavioral seam
- [x] P2.2 Broaden registry consumers + soft dependency diagnostics (2026-08-13)
- [x] P2.3 Read-only composition snapshot (2026-08-13)
- [x] P2.4 Composition GET + settings module gates (2026-08-13)
- [x] P2.5 Synthetic retail-test composition validation (2026-08-13)
- [x] P2.6 Module contract + capabilities (2026-08-13)
- [x] P2.7 Inventory + Tax domain boundary hardening (2026-08-13) — `main/services/inventory.ts`; tax facade + discount scale; no schema / no packages
- [x] P2.8 Inventory movement ledger (2026-08-13) — schema v75 `inventory_movements`; atomic stock+ledger; no HTTP/UI; no backfill
- [x] P2.9 Product↔Inventory stock write ownership (2026-08-13) — create/PUT via `applyAbsoluteStockChange`; soft-delete preserves ledger
- [x] P2.10 Tax HTTP consolidation (2026-08-13) — `main/routes/tax.ts` owns `/api/tax/*`; tax-packs/settings intentionally separate
- [x] P2.11 Tax snapshot contract freeze (2026-08-13) — `EngineTaxSnapshot` + facade imports; no schema/money change
- [x] P2.12 Inventory movement history read API (2026-08-13) — `GET /api/inventory/movements`; service `listInventoryMovements`
- [x] P2.13 Product ↔ Tax ownership boundary (2026-08-13) — config refs vs calc vs historical snapshot; no schema/money change
- [x] **P2.14 INTERIM Phase 2 exit gate** (2026-08-13) — catalog metadata truth + exit docs; **PASS WITH DOCUMENTED DEFERMENTS**; doc preserved (not deleted)
- [x] **P2.14 CURRENT Order domain boundary** (2026-08-13) — characterize cancel/stock + void×cancel; `main/services/order.ts`; relocate item cancel/restore onto `orderRoutes`; no money/inventory policy change
- [x] **P2.15 Payment domain boundary** (2026-08-13) — `main/services/payment-tender.ts`; soft-gate tables/kds on bill-paid; no FIN-01/money/schema/API change; retail-test not production
- [x] **P2.16 POS orchestration boundary** (2026-08-13) — `checkout-coordinator` + `POS_DOES_NOT_OWN`; gate addons/kds kot; no backend god-service; page retry/discount debt deferred
- [x] **P2.17 Restaurant isolation** (2026-08-13) — Order soft-gate table occupy/free + KDS notify; shared catalog must not depend on restaurant modules; UX unchanged when modules ON; fail-closed remount deferred Phase 3
- [x] **P2.18 Synthetic Retail validation** (2026-08-13) — stronger retail-test fixture tests; shared-module neutrality; **takeaway sale E2E** (stock/tax/pay/snapshot/idempotency); not production Retail
- [x] **P2.19 / Phase 2 final exit gate** (2026-08-13) — `phase-2-final-exit-gate.md`; **PASS WITH DOCUMENTED DEFERMENTS**; Phase 2 **COMPLETE**
- [x] **Dependency addition & integration** (2026-08-13) — zod/pino-http/helmet/compression/otel/react-query/i18next/vitest/prettier/husky; skipped zustand + express-rate-limit; plan `dependency-integration-plan.md`
- [x] **i18next Phase 2 incremental call-site migration** (2026-08-13) — settings.saveFailed + common.save/cancel/loading (settings + listed dialogs) + pos.checkout + orders.completed + products.title; dual-catalog retained; no new keys/frameworks
- [x] **Phase 2 architecture hardening** (2026-08-13) — Zod order/payment/refund/stock; OTel domain spans + withSpanSync; dual-catalog documented; plan updated
- [x] **Phase 2 closeout & Phase 3 architecture gate** (2026-08-13) — `phase-2-closeout-and-phase-3-gate.md`; Phase 2 **CLOSED**; Phase 3 plan ordered
- [x] **Phase 3.1** Fail-closed remount + startup composition validation (2026-08-13) — `registerRoutes` capability-aware; Outcome A; `phase-3.1-fail-closed-remount.md`
- [x] **Phase 3.2** Vertical / capability configuration (2026-08-13) — `ACTIVE_VERTICAL_ID` env at deploy/start; `commitActiveVerticalFromEnv`; `phase-3.2-capability-configuration.md`
- [x] **Phase 3.3** Production Retail vertical (2026-08-13) — `retail` in `VERTICALS`; shared commerce modules; fail-closed remount; minimal frontend composition; no schema; `phase-3.3-production-retail.md`
- [x] **Phase 3.4** Correctness residuals — **COMPLETE** (`phase-3.4-correctness-residuals.md`). KDS notify internal soft-gate; held-orders `tables` gate; void×cancel restock (stock→8); stock-reject HTTP 400; no ALS.
- [x] **Phase 3.5A** Inventory Ledger UI — **COMPLETE** (`phase-3.5a-inventory-ledger-ui.md`). Reuses `GET /api/inventory/movements`; page `/products/movements`; no schema change.
- [x] **Phase 3.5B** Legacy tax column cleanup — **DEFERRED** pending pilot evidence and later architectural/API decision (`phase-3.5b-legacy-tax-cleanup-discovery.md`). Schema v75; `tax_type`/`tax_rate` remain; no Mode B, DROP, or migration.
- [x] **Phase 3.6A** Refund receipt printing — **COMPLETE** (`phase-3.6a-refund-receipt-printing.md`)
- [x] **Phase 3.6B** Reports Gross/Refunds/Net Sales UI — **COMPLETE** (`phase-3.6b-reports-gross-refunds-net-ui.md`). Display-only; reuses existing report API fields.
- [x] **Phase 3.6C** Manual Stock Adjustment UI — **COMPLETE** (`phase-3.6c-manual-stock-adjust-ui.md`). Reuses `POST /products/:id/stock`; no free-text reason (API contract).
- [x] **Phase 3.6D** Day-Close Z Snapshot Print/Download — **COMPLETE** (`phase-3.6d-day-close-z-snapshot.md`). Cash Z from frozen summary; print best-effort.
- [x] **Phase 3.6E** Soft-reactivate / inactive-customer UX — **COMPLETE** (`phase-3.6e-inactive-customer-ux.md`). Owner/manager show-inactive; `POST /:id/reactivate`; POS search unchanged.
- [x] **Phase 3.6F** Cash drawer kick — **COMPLETE** (`phase-3.6f-cash-drawer-kick.md`). ESC/POS via default printer; POS PrinterStatus; no money-path.
- [x] **Phase 3.6G** WebUSB refund print parity — **COMPLETE** (`phase-3.6g-webusb-refund-print.md`). Server formats + client WebUSB send; network/USB path intact.
- [x] **Phase 4 product completion discovery** — **COMPLETE** (`docs/04-product/phase-4-product-completion-discovery.md`). Verdict A → 4.1 Retail floor usability.
- [x] **Phase 4.1** Retail floor usability — **COMPLETE** (`docs/04-product/phase-4.1-retail-floor-usability.md`). Settings tables gate; `/tables` fail-closed; POS name/SKU/barcode + scan feedback; schema v75.
- [x] **Phase 4.2 discovery** — **COMPLETE** (`docs/04-product/phase-4.2-retail-returns-restock-discovery.md`; `ADR-011` Accepted).
- [x] **Phase 4.3 implementation** — Low-stock attention hub (`docs/04-product/phase-4.3-low-stock-attention-hub.md`; `npm run test:phase-4.3`).
- [x] **Phase 4.4 discovery** — Accounting CSV export (`docs/04-product/phase-4.4-accounting-csv-discovery.md`). Verdict: SAFE — bill-level server CSV; no ADR unless tenant-local day boundary chosen.
- [x] **Phase 4.4 implementation** — `GET /api/reports/export/bills.csv` + Reports UI download (`docs/04-product/phase-4.4-accounting-csv.md`; `npm run test:phase-4.4`).
- [x] **Phase 4.5 discovery** — Retail exchange workflow (`docs/04-product/phase-4.5-retail-exchange-discovery.md`). Verdict: **ADR REQUIRED** → **ADR-012 ACCEPTED**.
- [x] **Phase 4.5 implementation** — Retail exchange coordinator + UI (`docs/04-product/phase-4.5-retail-exchange.md`; `npm run test:phase-4.5`).
- [x] **Phase 4.6 discovery** — Retail product variants / SKU matrix (`docs/04-product/phase-4.6-retail-product-variants-discovery.md`). Verdict: **ADR REQUIRED** — Option A identity safe; matrix UX needs ADR-013.
- [x] **Prompt pipeline** — `prompts/` orchestrator + roadmap 4.6–4.15 (2026-08-14). Production code unchanged. Schema v75. Execute only the phase in `prompts/ACTIVE.md`.
- [x] **Phase 4.6 / ADR-013 draft** — `docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md` — drafted Proposed.
- [x] **Phase 4.6 / ADR-013 Accept** — human gate 2026-08-14. Identity lock; no matrix; no 4.6 implementation slice. Phase 4.6 COMPLETE (ADR-only).
- [x] **Phase 4.7** Restaurant 86 workflow — `POST /api/products/:id/availability`; Restaurant POS 86; schema v75; `npm run test:phase-4.7`
- [x] **Phase 4.8** Reports multi-day range picker — start/end dates; 93-day client cap; `npm run test:phase-4.8`
- [x] **Phase 4.9** Customer deactivate — `POST /api/customers/:id/deactivate`; owner/manager; `npm run test:phase-4.9`
- [x] **Phase 4.10** FIN-01 collectible outstanding display (`docs/04-product/phase-4.10-fin01-outstanding-display.md`; `npm run test:phase-4.10`)
- [x] **Phase 4.11** Inventory on-hand valuation report (`docs/04-product/phase-4.11-inventory-valuation.md`; `npm run test:phase-4.11`)
- [x] **Phase 4.12** Retail POS fulfillment-type honesty (`docs/04-product/phase-4.12-retail-fulfillment-types.md`; `npm run test:phase-4.12`)
- [x] **Phase 4.13** Table merge discovery (`docs/04-product/phase-4.13-table-merge-discovery.md`) — unpaid-only SAFE NOW; billed merge ADR_REQUIRED; **not implemented**
- [x] **Phase 4.14** Service charge ADR (`docs/14-decisions/ADR-014-service-charge.md` **Proposed**; discovery `phase-4.14-service-charge-discovery.md`) — **not wired**
- [x] **Phase 4.15** Wastage stock decrease (`docs/04-product/phase-4.15-wastage-stock.md`; `npm run test:phase-4.15`)
- [x] **Post-4.15 production/pilot-readiness audit** — `docs/05-production/post-phase-4.15-pilot-readiness-audit.md`. Restaurant PILOT READY WITH CONDITIONS (78). Retail NOT PILOT READY (57). No 4.16. No production code.
- [x] **Retail isolation P0 remediation** — KDS/Server App module-gated skip; Products/KDS/Orders composition `verticalId`; catalog fetch isolated from addon-groups. `docs/05-production/retail-isolation-p0-remediation.md`. Schema v75.
- [x] **Post-P0 P1 software** — cancel idempotency; INV-02 void catch-up; KDS/Server App bind degrade. `docs/05-production/post-p0-pilot-remediation.md`. Schema v75.

- [x] **H1 paid-cancel 409** — `ORDER_HAS_SUCCESSFUL_TENDER`; refund path owns money.
- [x] **H2 FIN-02** — report-query includes collectible-complete `partial`.
- [x] **H3 chef pending-cancel PIN** — chef cancel requires manager PIN; KDS bump unchanged.

## Post-audit gates (do not auto-implement)

- [x] **First café dry-run prep (2026-08-14)** — result sheet created; **NO-GO** (RELEASE BLOCKED + no site access). No production code. No push.
- [ ] **RC cut** — isolate commit, bump past 3.0.5, sign+notarize (human/release).
- [ ] **On-site dry run Phases 2–10** — fill `first-cafe-dry-run-result.md` (human/ops).
- [x] **Pilot ops readiness audit (docs)** — runbook 1–16, staff training checklist, success criteria, `pilot-operations-readiness-report.md` (2026-08-14). No production code. No 4.16.
- [ ] **Restaurant café gates** — signed/notarized artifact (version bump), OPS-01, PIN escrow, backup policy, training/sign-off, printer+KDS drill, café restore (human).
- [ ] **P1-06 unopenable DB recovery UI** — software, not this patch.
- [ ] **Phase 4.6 matrix implementation** — not in this 10; blocked until ADR-013 Accepted with an implementation slice.
- [ ] **Phase 3.5** Remaining optional — packages/extraction, recipes/BOM, suppliers/PO (not authorized unless explicitly tasked). Tax cleanup stays deferred (3.5B).
- [ ] Cloud ops (non-blocking billing): config, health, webhooks, fleet
- [ ] ADR-006 Multi-Location Architecture (design only; no code until approved)
- [ ] Analytics/accounting export
- [ ] **Phase 3** Additional verticals (Retail/Grocery/Salon/…) + package extraction — only after explicit Phase 3 kickoff

## P3 — Explicitly frozen

- [ ] Payment terminals
- [ ] Aggregators (Swiggy/Zomato/ONDC)
- [ ] AI / LLM features
- [ ] Bluetooth printing
- [ ] Multi-tenant SaaS
- [ ] Microservices / K8s / large rewrites
