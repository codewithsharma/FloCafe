# Operavia context

**Product brand (canonical):** OPERAVIA (all caps) / **Operavia** (title case) — modular business platform; Phase 1 vertical = **OPERAVIA Restaurant**.
**Spelling:** Title case is **Operavia**, not Opervia. Legacy `Opervia` path/process matchers remain in uninstallers and kill-ports.
**Nexora POS / FloCafe:** retired as active product names (historical audits may still say Nexora/FloCafe; GitHub repo remains FloCafe).
**Repo legacy:** FloCafe / Flo POS naming may linger in packaging IDs (`appId`, `flo-desktop`, `flocafe` executable) for upgrade continuity.
**Electron `productName`:** `Operavia`.
**Modular vision:** ADR-010 + Phase 2 module registry (`main/modules/`) — Restaurant vertical declarative; no Phase 1 rewrite.
**Canonical strategy:** `STRATEGY.md` (pilot KPI unchanged).
**Branding audit:** `docs/05-production/operavia-branding-normalization-audit.md`.

Runtime: Electron + Express (`main/`) + SQLite (better-sqlite3, WAL, `PRAGMA user_version` → **schema v88**) + statically exported Next.js (`frontend/`).

**RCP-05 Recipe consumptions list UI (2026-08-21):** COMPLETE — `/products/recipes/consumptions`; reuses `GET /api/recipes/consumptions`; no schema/mutation change; `npm run test:recipe-consumptions-ui` + `test:r5` + `test:p17`.
**PRC-DRAFT Draft PO line amend (2026-08-21):** COMPLETE — `PUT …/purchase-orders/:id/lines` draft-only replace; FE on purchasing hub; no inventory impact; `npm run test:r6` + `test:purchasing-draft-amend-ui`. Schema tip **v88**.
**ROPS-FC-CSV Food-cost CSV (2026-08-21):** COMPLETE — export parity for theoretical food-cost report; `npm run test:r9.6`. Gap doc: `docs/roadmap/RESTAURANT-OPS-RECIPES-INGREDIENT-GAP-ANALYSIS.md`. Next: by-ingredient rollup or recipe-linked waste (design).
**ROPS-FC-ING By-ingredient food-cost (2026-08-21):** COMPLETE — `by_ingredient` on food-cost report; reconciles to period COGS; `test:r9.6`. Next: RECIPE_WASTE (design) or refund→recipe reverse (policy ADR).

**R9 Slice 1 Expenses (2026-08-15):** COMPLETE — schema **v83** `expenses`; Owner/Manager API+UI; cents-only; audits; `npm run test:r9`.
**R9 Slice 2 Financial Audit-Trail Hardening (2026-08-15):** COMPLETE — `/audit` UI + CSV export + `until` + `audit.exported`; schema tip remains **v83**; `npm run test:r9.2`.
**R9 Slice 3 Tax Reporting Depth + Accountant Export (2026-08-15):** COMPLETE — Reports tax UI + `export/tax-components.csv` + `tax.exported`; schema tip remains **v83**; `npm run test:r9.3`.
**R9 Slice 4 Day-close / Z Polish (2026-08-15):** COMPLETE — confirm + cash clarity + historical date + float/shifts display + Z txt export/`day_close.z_*` audits; schema tip remains **v83**; `npm run test:r9.4`.
**R9 Slice 5 Operations Finance Reports v1 (2026-08-15):** COMPLETE — ops-finance compose + expenses CSV; schema tip remains **v83**; `npm run test:r9.5`.
**R9 Slice 6 Food-cost Report v1 (2026-08-15):** COMPLETE — theoretical COGS report; schema tip remains **v83**; `npm run test:r9.6`.
**R9 COMPLETE (2026-08-15).** Doc: `docs/05-production/r9-completion.md`. Live Go-Live **NO-GO**. **R10 Online / QR Ordering COMPLETE (2026-08-15)** — schema **v84**; `npm run test:r10`; doc `docs/05-production/r10-online-qr-ordering.md`. Workforce OS ≠ R10 (`prompts/later/workforce-os-planning.md`). **R11 Coupons COMPLETE (2026-08-15)** — schema **v85**; `npm run test:r11`; doc `docs/05-production/r11-coupons.md`.
**R12 Void/Cancel Report thin deepen (2026-08-15):** COMPLETE — no schema bump; `GET /api/reports/voids` + `export/voids.csv`; `report.voids_exported`; `npm run test:r12`. Doc: `docs/05-production/r12-void-cancel-report.md`. Advanced BI warehouse still Later. R11 coupons may run in parallel (do not share migrations with R12).
**R13 Print queue / retry (2026-08-15):** COMPLETE — schema **v86** `print_jobs`; failed print-bill outbox + Owner/Manager list/retry; `npm run test:r13`. Doc: `docs/05-production/r13-print-queue.md`. Terminals/aggregators Frozen.
**R14 Corrupt-DB fail-closed thin deepen (2026-08-15):** COMPLETE — no schema bump; `checkSqliteIntegrity` + install-state `corrupt_database` latch; `/api/health` + money APIs 503; good restore clears latch; `npm run test:r14`. Doc: `docs/05-production/r14-corrupt-db-fail-closed.md`. Live DR drill **NOT CLAIMED**. Live Go-Live **NO-GO**.
**R15 Simulation S1 foundation (2026-08-15):** COMPLETE — test/fixture/docs only; `npm run test:r15` (27/27): open shift → order → pay → close → day-close/Z → local backup. Banner: simulation ≠ OPS-02 signed café pilot. Doc: `docs/05-production/r15-simulation-s1.md`. KDS/receipt thermal/S2–S10 remain later.
**R16 Production Release (2026-08-15):** **HUMAN BLOCKED** — signed/notarized RC + OPS-02 site gates. Doc: `docs/05-production/r16-production-release-blocker.md`. Gate checklist: `docs/05-production/r16-release-gate-checklist.md`. Engineering roadmap report: `docs/05-production/roadmap-engineering-completion-r0-r16.md`. Live Go-Live **NO-GO**.

**Foundation Phase 2 (2026-08-15):** COMPLETE — prefer-cents readers + dual-write writers; process-kill harness; Zod expansion; `any` main&lt;600 / orders&lt;50. Doc: `docs/05-production/foundation-priority-deepen-phase2.md`.

**R7 Customer & CRM OS (2026-08-15):** COMPLETE — schema **v82** `customer_notes` + segment rules; Customer 360; deterministic segments; derived preferences; audited notes; loyalty integrated; metrics. Suite `npm run test:r7`. Doc: `docs/05-production/r7-customer-crm-os.md`.

**R8 Staff & Workforce OS (2026-08-15):** COMPLETE — deepen existing `users` staff + shift visibility; search/filters; detail; working roster; `role.changed` / `staff.activated` audits; schema tip was **v82** at close. Suite `npm run test:r8`. Doc: `docs/05-production/r8-staff-workforce-os.md`.

**OPS-02 Gate 1 verification (2026-08-15):** Engineering **PASS WITH CONDITIONS** (suites green; `tsc` packaging fail on clean HEAD; no signed RC). Gate 1 **PENDING HUMAN/SITE**. Controlled pilot **READY WITH CONDITIONS**. Live go-live **NO-GO**.

**Clean HEAD build investigation (2026-08-15):** `npm run build` is authoritative. Clean `94702f8` had **209** errors.

**Production main TypeScript strict harden (2026-08-15):** **209 → 0**. `npm run build` PASS; `dist/` emitted. Suites green. Signed/notarized RC still missing → live artifact **NOT VERIFIED**. R9 unauthorized.

**RC packaging verification (2026-08-15):** Unsigned macOS `Operavia.app` via electron-builder `--dir` **VERIFIED**. Signing/notarization **BLOCKED** (no identities/credentials). Live **NO-GO**.

**Orders + products type-harden (2026-08-15):** `main/routes/orders/*` and `main/routes/products.ts` now report **0** `tsc` errors (shared helpers in `orders-shared`). Full `main/` harden still required for ship.

**Canonical product plan:** `docs/00-product/capability-matrix.md` (Existing / Hardening / Planned / Later / Frozen, 2026-08-14).
**Complete Restaurant OS (R0):** `docs/00-product/restaurant-os-blueprint.md` · `restaurant-os-roadmap.md` (R0–R16). Docs only until R1+ authorized.
**Code evidence:** `docs/00-product/feature-list.md`.
**Active development vertical:** Restaurant only (Retail deferred).

**Exhaustive QA audit (2026-08-15):** Pack at `docs/qa/`. Live GUI + RBAC + RC: PASS WITH CONDITIONS. Production readiness: **CONDITIONAL GO**. Final release hardening: **CONDITIONAL GO** (`docs/qa/FINAL-RELEASE-HARDENING-AUDIT.md`) — P1-06 unopenable DB fail-closed; OPS-02 drill checklist; RC checklist. Live café still blocked on signed/notarized RC + OPS-02 + Master-PIN DR + security residual acceptance + sign-off. Residual eng: JWT/CSP Phase C, REAL dual-write.


**R16 / OPS-02 Production Gate (2026-08-21):** **PARTIAL / CONDITIONAL GO (eng)** — Live **NO-GO**. Deliverables: `docs/qa/OPS-02-*.md`. Eng fixes: health version (OBS-001), KDS notify→outbox (KDS-001), recovery tier+REC-01, post-P18/P15 stale test remediation. Merge **194/194**, Playwright **4/4**, unsigned pack VERIFIED. Signed RC + site drills + PIN escrow + sign-off remain human P0. QR-ORD-IDEM out of scope.

**P19 POST-P18 DEEP AUDIT (2026-08-21):** Docs only — `docs/qa/P19-POST-P18-DEEP-AUDIT.md`. Recommendation: **ENGINEERING HOLD** for R16/OPS-02. Optional parallel eng if authorized: **QR-ORD-IDEM**. Implementation NOT STARTED. LIVE PILOT NO-GO.

**P18 ORD-IDEM-HARDENING (2026-08-21):** COMPLETE — mandatory Idempotency-Key on order create + add-items; canonical fingerprint; conflict 409; Server App sticky key; schema **v88**; `npm run test:p18`. Audit `docs/qa/P18-DEEP-AUDIT.md`. Report `docs/qa/P18-ORDER-IDEMPOTENCY-IMPLEMENTATION-REPORT.md`. QR guest create exception. LIVE PILOT NO-GO.

**P17 RCP-CONSUMPTION-HARDENING (2026-08-21):** COMPLETE — consume/live cost prefer `cost_cents`; FE BOM edit + prep_loss/yield PATCH; CAS/atomic/idempotency/P16 policy tests; schema **v88**; `npm run test:p17`. Audit `docs/qa/P17-RECIPE-CONSUMPTION-AUDIT.md`. Report `docs/qa/P17-RECIPE-CONSUMPTION-IMPLEMENTATION-REPORT.md`. LIVE PILOT NO-GO.

**P16 INV-OS-HARDENING (2026-08-21):** Inventory integrity hardening — sale/recipe CAS floors; PUT is_active→availability; opening/count audits; policy tests; no schema bump; `npm run test:p16`. Audit `docs/qa/P16-INVENTORY-OS-AUDIT.md`. Report `docs/qa/P16-INVENTORY-OS-IMPLEMENTATION-REPORT.md`. LIVE PILOT NO-GO.

**P16 INVENTORY-OS AUDIT (2026-08-21):** Docs — `docs/qa/P16-INVENTORY-OS-AUDIT.md`. Inventory OS largely Existing (R4/R5/R6/P5); P16 implemented as hardening.

**P15 SEC-SENSITIVE-ACTIONS (2026-08-21):** Sensitive-action controls — bill discount tender guard; cancel/void PIN accountability + sanitizer allowlist; LAN network_mode owner+Master PIN; Drive/export/import/master-pin audits; no schema bump; `npm run test:p15`. Matrix Sensitive-action controls → 🟢 Existing. LIVE PILOT NO-GO.

**P14 POS-OFFLINE-CONFLICT-HARDENING (2026-08-21):** Order-status CAS + payment complete guard; FE stock Idempotency-Key stability; POS/KDS 409/permanent retry hygiene; no schema bump; `npm run test:p14`. Plan `docs/qa/P14-POS-OFFLINE-CONFLICT-HARDENING-PLAN.md`. Report `docs/qa/P14-POS-OFFLINE-CONFLICT-HARDENING-IMPLEMENTATION-REPORT.md`. Offline Conflict handling / App restart recovery remain 🟡 Hardening. LIVE PILOT NO-GO.

**P13 DATA-AUDIT-HARDENING (2026-08-21):** Data & audit integrity hardening — no schema bump; `npm run test:data-audit`. Plan `docs/qa/P13-DATA-AUDIT-HARDENING-PLAN.md`. Report `docs/qa/P13-DATA-AUDIT-HARDENING-IMPLEMENTATION-REPORT.md`. Deepens audit atomicity; matrix Audit logging / Data integrity remain 🟡 Hardening.

**P12 RPT-CATEGORY (2026-08-21):** Category performance report — no schema bump; `npm run test:rpt-category`. Report `docs/qa/CATEGORY-PERFORMANCE-REPORT-IMPLEMENTATION-REPORT.md`. Thin projection of P11 `by_category`; Category Performance → Existing.

**P11 RPT-PRODUCT (2026-08-21):** Product performance report — no schema bump; `npm run test:rpt-product`. Report `docs/qa/PRODUCT-PERFORMANCE-REPORT-IMPLEMENTATION-REPORT.md`. Settled merchandise + category rollup; Category Performance closed by P12.

**P10 PRINT-HEALTH (2026-08-21):** Printer health & recovery UX — no schema bump; `npm run test:print-health`. Report `docs/qa/PRINTER-HEALTH-RECOVERY-IMPLEMENTATION-REPORT.md`. Deepens R13 queue; Settings recovery panel.

**P9 RPT-STAFF (2026-08-21):** Staff performance report — no schema bump; `npm run test:rpt-staff`. Report `docs/qa/STAFF-PERFORMANCE-REPORT-IMPLEMENTATION-REPORT.md`. Attribution: order creator + audit/refund/shift actors (not cashier/waiter sales).

**P8 KDS-ALERTS (2026-08-21):** Sound & visual KDS alerts — no schema bump; `npm run test:kds-alerts`. Report `docs/qa/KDS-ALERTS-IMPLEMENTATION-REPORT.md`.

**P7 RPT-DISC (2026-08-21):** Discount report — no schema bump; `npm run test:rpt-disc`. Report `docs/qa/DISCOUNT-REPORT-IMPLEMENTATION-REPORT.md`.

**P6 RPT-PAY (2026-08-21):** Payment report deepen — no schema bump; `npm run test:rpt-pay`. Report `docs/qa/PAYMENT-REPORT-DEEPENING-IMPLEMENTATION-REPORT.md`.

**P5 INV-AUTO-86 (2026-08-21):** Schema **v88** manual/auto unavailable flags; stock → effective `is_active`; POS server reject; suite `npm run test:inv-auto-86`. Report `docs/qa/AUTO-86-FROM-STOCK-IMPLEMENTATION-REPORT.md`.

**P4 KDS-H-OUTBOX (2026-08-21):** Schema **v87** durable `kds_delivery_outbox` + FE exponential reconnect backoff. SQLite remains SoR. Report `docs/qa/KDS-H-OUTBOX-IMPLEMENTATION-REPORT.md`.

**P3 Feature Backlog Analysis (2026-08-21):** Docs only. Matrix universe **320** rows (not 405). Next build: `KDS-H-OUTBOX` durable KDS outbox (Hardening). Report `docs/roadmap/P3-FEATURE-BACKLOG-ANALYSIS.md`. No feature code.

**P2 Security & Platform Hardening (2026-08-21):** Helmet parity on server-app/KDS; API no-store; HS256 pin; refresh token rotation; WS Origin + maxPayload; login timing. Electron sandbox verified unchanged. Report `docs/qa/P2-SECURITY-PLATFORM-HARDENING-REPORT.md`. Deferred: CSP Phase C, Master PIN length.

**P1 Test/CI Hardening + P1.1 Stabilization (2026-08-21):** 239 tests classified (0 unintentional orphans). Merge Electron **180/180 PASS**, extended **45/45 PASS**, recovery/critical/units PASS. `database-tools` backup audit best-effort + real owner token. Docs: `docs/qa/P1-TEST-CI-HARDENING-REPORT.md`. Manual: `db-audit`, `translations` (i18n backlog).

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

**Frozen until pilots prove reliability:** AI, aggregators (Swiggy/Zomato/ONDC), multi-tenant SaaS, multi-location implementation, payment terminals / gateways / online payment, Bluetooth print, microservices. **R5 BOM/recipes/food-cost** and **R6 purchasing** are Existing (COMPLETE). Do not start R9 without authorization.

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

**R2 (2026-08-15): CLOSED.** Floor Operations — `docs/05-production/r2-floor-operations.md`. Schema **v76**. Suite `npm run test:r2` 62/62.

**R3 (2026-08-15): CLOSED.** Kitchen OS — `docs/05-production/r3-kitchen-os.md`. Schema **v77**. `kitchen-status` service (CAS + timestamps + audit + priority); companion + main KDS paths; UI aging/rush/station/bump/addons. Suite `npm run test:r3` 70/70. Durable outbox / expediter / analytics remain gaps.

**R4 (2026-08-15): CLOSED.** Inventory OS — `docs/05-production/r4-inventory-os.md`. Schema **v78**. Idempotent adjust, units, counts, ledger reconstruct, wastage reasons, counts UI. Suite `npm run test:r4` 53/53.

**R5 (2026-08-15): CLOSED.** BOM / Recipes / Food Cost — `docs/05-production/r5-bom-recipes-food-cost.md`. Schema **v79**. Suite `npm run test:r5`.

**R4.1 (2026-08-15): CLOSED.** Foundation stabilization — `docs/05-production/r4-1-foundation-stabilization.md`. Drive backup-now Master PIN; Zod money bodies; orders-shared + database/time|order-row extraction; P1.3 matrix tests; REAL→cents **STOP** (plan only). Suite `npm run test:r4.1`.

**R6 (2026-08-15): CLOSED.** Purchasing & Supplier OS — `docs/05-production/r6-purchasing-supplier-os.md`. Schema **v80**. Suppliers, PO lifecycle, partial/full receive → inventory `purchase_receipt`, cents on PO money, UI `/products/purchasing`. Suite `npm run test:r6`.

**Foundation deepen (2026-08-15): CLOSED Phase 1+2.** Dual-write v81 + prefer-cents readers; process-kill; Zod expansion. Docs: `foundation-priority-deepen.md`, `foundation-priority-deepen-phase2.md`.

**R7 / R8 (2026-08-15): CLOSED.** CRM v82 + Staff workforce. Suites `test:r7` / `test:r8`. **R9 Slice 1 COMPLETE** (v83 Expenses). Remaining R9 slices require slice auth.

Do not invent 4.16. Do not push.

- **Human/RELEASE + OPS:** signed RC + `ops-02-site-readiness-checklist.md` + `pilot-signoff.md` (OPS-02 Gate 1 still open).
- **Next software (if authorized):** money REAL cutover / residual Hardening (KDS tab-reload queue) — or **R9** only with explicit authorization.
- ADR-014 Proposed (out of R9). Schema tip **v83**. Engineering baseline includes R1–R8 + R9 Slice 1 Expenses on `restaurant-vertical`. Live Go-Live **NO-GO**.
- Test debt: `security-hardening.test.ts` isolation only (not live blocker).
