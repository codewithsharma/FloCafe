# Decisions

## 2026-08-14 — Post-P0 P1 remediation (Implemented + HUMAN stop)

Repeat PATCH cancel no-ops restock; last-item catch-up ignores voided lines; KDS/Server App bind exhaustion `resolve()` so POS does not quit. Schema v75. Money path untouched. Paid-cancel restock, FIN-02 Gross/Net filter, chef pending-cancel, ADR-014 **not** implemented (HUMAN). Composition fetch fail-open left P2. Doc: `docs/05-production/post-p0-pilot-remediation.md`. No Phase 4.16.

## 2026-08-14 — Retail isolation P0 remediation (Implemented)

Gate `startKdsServer` on `isModuleEnabled('kds')` and `startServerApp` on `isModuleEnabled('tables')`; skip must resolve. Products/KDS/Orders pass composition `verticalId`; catalog `Promise.all` excludes addon-groups. Schema v75. Money path untouched. Doc: `retail-isolation-p0-remediation.md`. No Phase 4.16.

## 2026-08-14 — Post-4.15 pilot-readiness audit (docs only)

Audit of `modular-verticles` @ `5fee6df`, schema v75. **Restaurant: PILOT READY WITH CONDITIONS (78/100). Retail: NOT PILOT READY (57/100).** Product P0s are Retail-only (KDS `:3002` always up; Products admin addon fail-open). No money-path P0. No production code change. No Phase 4.16. Doc: `docs/05-production/post-phase-4.15-pilot-readiness-audit.md`. Human gates: signed artifact, OPS-01, PIN escrow, ADR-014 still Proposed.

## 2026-08-14 — Phase 4.15 Wastage stock (Implemented)

Fourth `POST /products/:id/stock` action `wastage` decreases qty; ledger `reason=wastage`, `movement_type=adjustment`. Schema v75 CHECK unchanged. Doc: `phase-4.15-wastage-stock.md`.

## 2026-08-14 — ADR-014 Configurable service charge (Proposed)

`docs/14-decisions/ADR-014-service-charge.md`. Restaurant dine-in percent; persist amount on v76+; Retail off; tips excluded; FIN-01 definition unchanged. **Human Accept required before wiring.** Phase 4.14 COMPLETE as paper. Schema v75 unchanged.

## 2026-08-14 — Phase 4.13 Table merge (Discovery)

`docs/04-product/phase-4.13-table-merge-discovery.md`. Transfer 409 on occupied target. Merge not built. SAFE NOW future slice: unpaid no-bill item reparent. Billed/split merge **ADR_REQUIRED**. No production code. Schema v75.

## 2026-08-14 — Phase 4.12 Retail fulfillment types (Implemented)

Retail POS hides café delivery when `tables` is off; leftover delivery coerces to takeaway. Restaurant types unchanged. Schema v75. Doc: `phase-4.12-retail-fulfillment-types.md`.

## 2026-08-14 — Phase 4.11 Inventory valuation (Implemented)

Read-only `GET /api/reports/inventory-valuation`: catalog `cost` × `stock_quantity` for tracked products. UI `/products/valuation`. Not WAC/FIFO. Schema v75. Doc: `phase-4.11-inventory-valuation.md`.

## 2026-08-14 — Phase 4.10 FIN-01 collectible display (Implemented)

Display-only. `frontend/src/lib/bill-collectible.ts` derives collectible = total − gross `payment_details` tender. Orders Checkout + PaymentModal remaining due use collectible, not net `bill.balance`. No `UPDATE bills`. Schema v75. Doc: `phase-4.10-fin01-outstanding-display.md`.

## 2026-08-14 — Phase 4.9 Customer deactivate (Implemented)

`POST /api/customers/:id/deactivate` owner/manager. Flag only. Schema v75. Doc: `phase-4.9-customer-deactivate.md`.

## 2026-08-14 — Phase 4.8 Reports multi-day export range (Implemented)

Two native date inputs on Reports. CSV + topProducts use start/end. Client cap 93 days matches backend. `/summary` and `daily-stats` unchanged. Schema v75. Doc: `phase-4.8-reports-date-range.md`.

## 2026-08-14 — Phase 4.7 Restaurant 86 (Implemented)

No ADR. Reuses `products.is_active`. Adapter `POST /api/products/:id/availability` (owner/manager, Zod, audit `product.availability`). Restaurant POS overflow 86 + restore strip; Retail POS has no 86 chrome. Stock unchanged. Schema v75. Tests: `npm run test:phase-4.7`. Doc: `docs/04-product/phase-4.7-menu-86.md`.

## 2026-08-14 — ADR-013 Retail product variants / SKU identity (Accepted)

`docs/14-decisions/ADR-013-retail-product-variants-sku-identity.md`. **Status: Accepted** (human gate). Identity LOCK: Option A (each sellable variant = `products` row). Software SKU matrix **deferred** (not authorized). ADR-011/012 remain valid. Schema v75. No 4.6 implementation slice. Phase 4.6 CLOSED as ADR-only; Phase 4.7 activated.

## 2026-08-14 — ADR-013 Retail product variants / SKU identity (Proposed)

Superseded by Accept above. Drafted the same day; human Accept closed the gate.

## 2026-08-14 — Prompt pipeline + Phase 4.6–4.15 roadmap (Accepted — orchestration only)

Created `prompts/` execution system. Next 10 phases selected from repo evidence (not frozen STRATEGY items). **ACTIVE = 4.6 ADR-013** (variants identity paper; no matrix implementation). Production code unchanged; schema v75. Auto-advance only after each phase’s completion gates. See `prompts/ROADMAP.md`.

## 2026-08-14 — Phase 4.6 Retail Product Variants (Discovery)

Discovery: `docs/04-product/phase-4.6-retail-product-variants-discovery.md`. Catalog is 1 product = 1 stock bucket; no variant table; stubs unused. Sellable identity for ADR-011/012 already works if each SKU is a product row (Option A). True matrix/parent UX needs schema + policy. **Verdict: ADR REQUIRED** (propose ADR-013). **Implementation not started.**

## 2026-08-14 — Phase 4.5 Retail Exchange (Implemented)

Composition per ADR-012: `main/lib/exchange-return-value.ts`, `main/lib/exchange-idempotency.ts`, `frontend/src/lib/exchange/coordinator.ts`, `ExchangeDialog` on Orders (retail-only). Leg order refund → replacement sale → optional restock. Schema v75 unchanged. Doc: `phase-4.5-retail-exchange.md`.

## 2026-08-14 — ADR-012 Retail Exchange Policy (Accepted)

**Status:** Accepted + implemented. Composition (Option A): Retail-only frontend exchange coordinator orchestrates existing refund + replacement POS sale + optional ADR-011 restock. Leg order: refund → replacement → restock. Return value = `(order_items.total / quantity) × return_qty` (coordinator-computed; bill-level refund API unchanged). No store credit v1. Operational recovery idempotency via `exchange_attempt_id` + per-leg keys. Schema v75 unchanged. Doc: `docs/14-decisions/ADR-012-retail-exchange-policy.md`.

## 2026-08-14 — Phase 4.5 Retail Exchange (Discovery)

Discovery: `docs/04-product/phase-4.5-retail-exchange-discovery.md`. **Superseded by ADR-012 above.**

## 2026-08-14 — Phase 4.4 Accounting CSV Export (Implemented)

Bill-level read-only `GET /api/reports/export/bills.csv` with required UTC `start_date`/`end_date` (half-open via `utcDayBounds()`); 93-day cap; owner/manager auth. Semantics per `reporting-financial-semantics.md`: gross=`total`, net=`paid_amount`, refunds=completed SUM, payments_received from `payment_details`. Shared `main/lib/csv.ts` + `main/services/bills-csv-export.ts`. Reports UI single-day export. Schema v75 unchanged. Doc: `docs/04-product/phase-4.4-accounting-csv.md`.

## 2026-08-14 — Phase 4.4 Accounting CSV Export (Discovery)

Discovery: `docs/04-product/phase-4.4-accounting-csv-discovery.md`. No financial CSV exists; menu-csv `toCsvRow()` pattern reusable. Authoritative semantics: `reporting-financial-semantics.md`. Recommended: bill-level read-only `GET /api/reports/export/bills.csv` with UTC `start_date`/`end_date` (same as `/summary`). No schema/money/FIN-01 changes. **Superseded by implementation record above.**

## 2026-08-14 — Phase 4.3 Low-Stock Attention Hub (Implemented)

Read-only hub reusing `GET /api/products?low_stock=true` (`LOW_STOCK_SQL_FRAGMENT`). UI: `/products/low-stock`, dashboard AttentionStrip, Products link; owner/manager + inventory module gate; Adjust stock via Phase 3.6C. Schema v75 unchanged. Docs: `phase-4.3-low-stock-attention-hub.md`.

## 2026-08-14 — Phase 4.2 Retail Returns & Restock (Accepted + Implemented)

ADR-011 Accepted: optional restock after money refund for `retail` / `retail-test` only; explicit `order_item_id` + `quantity`; T2 separate txn; L2 ledger `adjustment` + `reference_type=refund`; schema v75 unchanged. Implementation: `POST /api/refunds/:id/restock`, InventoryService `restockTrackedForRefund`, Retail Orders UI checkbox. Docs: `phase-4.2-retail-returns-restock.md`. Restaurant remains money-only.

## 2026-08-14 — Phase 4.2 Retail Returns & Restock (Discovery — ADR REQUIRED)

Discovery: `docs/04-product/phase-4.2-retail-returns-restock-discovery.md`. Superseded by Accepted ADR-011 above.

## 2026-08-14 — Phase 4.1 Retail Floor Usability (Accepted + Implemented)

Gate Restaurant floor chrome via existing `isModuleEnabled('tables')` / `isFeatureAvailable` + platform `verticalId` (no second vertical detector). `/tables` fail-closed like `/kds`. POS shared helpers: name/SKU/barcode filter + exact scan match; success/unknown toasts. Minimal API: `?search=` also LIKE barcode. Schema v75. Money/inventory unchanged. Doc: `docs/04-product/phase-4.1-retail-floor-usability.md`. Do not auto-start 4.2.

## 2026-08-14 — Phase 4 Product Completion Discovery (Accepted — Discovery Only)

Discovery doc: `docs/04-product/phase-4-product-completion-discovery.md`. Platform composition (Restaurant 22 / Retail 17 shared) is real; Retail is not a finished product SKU. Highest SAFE NOW slice = **Phase 4.1 Retail floor usability** (chrome suppression + barcode/SKU POS depth). Next money+inventory workflow = return/restock (4.2) after explicit policy. Do not reopen 3.5B/3.5C/REAL→cents/P1.6. No production code or schema change in this discovery. Final verdict: **A** — ready for Phase 4.1.

## 2026-08-14 — Phase 3.6G WebUSB Refund Print Parity (Accepted + Implemented)

Reuse existing WebUSB `printerService` + server `formatRefundReceipt` / `buildRefundReceiptBytes`. When default printer is `webusb`, `POST /printers/print-refund` returns `{ webusb: true, bytes }`; client sends via WebUSB. Network/USB server dispatch unchanged. Money path unchanged. Doc: `docs/03-architecture/phase-3.6g-webusb-refund-print.md`.

## 2026-08-14 — Phase 3.6F Cash Drawer Kick (Accepted + Implemented)

Manual ESC/POS drawer pulse via existing `dispatchPrint` + default printer. `POST /api/printers/kick-drawer` (owner|manager|cashier). POS PrinterStatus deliberate action. No auto-kick on payment, no schema, no money-path. Doc: `docs/03-architecture/phase-3.6f-cash-drawer-kick.md`.

## 2026-08-14 — Phase 3.6E Inactive Customer Reactivation UX (Accepted + Implemented)

Existing `customers.is_active` lifecycle. Owner/manager `GET /customers?include_inactive=true`; `POST /customers/:id/reactivate` flips flag only (auth matches soft-reactivate-by-phone). POS `/customers-search` stays active-only. No schema/loyalty/wallet/money-path changes. Doc: `docs/03-architecture/phase-3.6e-inactive-customer-ux.md`.

## 2026-08-14 — Phase 3.6D Day-Close Z Snapshot Print/Download (Accepted + Implemented)

Cash Z snapshot from frozen `day_closes.summary_json` only. Download: plain-text client formatter. Print: `POST /printers/print-day-close` + thermal `formatDayCloseZ` (best-effort; does not mutate day-close). Omits Gross/Net/tenders/tax (not in day-close API). Doc: `docs/03-architecture/phase-3.6d-day-close-z-snapshot.md`.

## 2026-08-14 — Phase 3.6C Manual Stock Adjustment UI (Accepted + Implemented)

Products table row action + dialog calls existing `POST /products/:id/stock` (`action` + `quantity`). No free-text reason (API has none; ledger reason = action). No schema change. Shared product/inventory modules (Restaurant + Retail). Doc: `docs/03-architecture/phase-3.6c-manual-stock-adjust-ui.md`.

## 2026-08-14 — Phase 3.6B Reports Gross / Refunds / Net Sales UI (Accepted + Implemented)

Display-only: Home + Reports bind existing `grossSales` / `refunds` / `netSales` from `daily-stats` and `summary` APIs. No backend money-path changes; no schema change. Doc: `docs/03-architecture/phase-3.6b-reports-gross-refunds-net-ui.md`.

## 2026-08-14 — Phase 3.6A Refund Receipt Printing (Accepted + Implemented)

Best-effort refund proof print after successful refund. Money path unchanged (`createBillRefund` does not print). Hardware: `POST /printers/print-refund` → thermal `formatRefundReceipt` / `printRefundReceipt`. Audit: `print_type: 'refund'` does not set `bills.printed_at`. Print failure does not roll back refund. Browser/WebUSB refund print parity deferred. Doc: `docs/03-architecture/phase-3.6a-refund-receipt-printing.md`.

## 2026-08-14 — Phase 3.5B Legacy Tax Column Cleanup (DEFERRED)

Discovery: `phase-3.5b-legacy-tax-cleanup-discovery.md` (candidates `products.tax_type` / `products.tax_rate` only; not authoritative; snapshots/FIN-01/REAL→cents out of scope). Human decision: **DEFER until pilot evidence**. Schema remains **v75**. Columns remain. API writers/readers unchanged. No migration. No Mode B. No DROP. Future choice (not made now): Mode B (code-only stop-return/stop-write) **or** DROP (separate ADR + migration + consumer review). **No implementation.**

## 2026-08-14 — Phase 3.5A Inventory Ledger UI (Accepted + Implemented)

Owner/manager UI at `/products/movements` reuses existing `GET /api/inventory/movements` (`listInventoryMovements`). No schema change; no stock recalculation; shared `inventory` module (Restaurant + Retail). Out of scope: suppliers/PO, recipes/BOM, tax cleanup, service/package extraction. Doc: `docs/03-architecture/phase-3.5a-inventory-ledger-ui.md`.

## 2026-08-14 — Phase 3.4 Correctness Residuals (Accepted + Implemented)

Scope **B** delivered: process-locked vertical unchanged; `notifyKdsUpdate`/`notifyOrderUpdated` gated with `isModuleEnabled('kds')`; held-orders table UPDATEs gated with `isModuleEnabled('tables')`; cancel restore skips `voided`/`void_adjustment` (stock stays 8); `assertStockAvailable` → `InventoryServiceError(400)`. No ALS, no schema change. Doc: `phase-3.4-correctness-residuals.md`. Plan: `docs/superpowers/plans/2026-08-14-phase-3.4-correctness-residuals.md`.

## 2026-08-13 — Phase 3.3 Production Retail (Accepted + Implemented)

Production `retail` vertical in `VERTICALS`; shared commerce via `OPERVIA_SHARED_COMMERCE_MODULES`; fail-closed remount for retail; minimal frontend composition alignment (`verticalId` from platform composition). No schema change. Doc: `docs/03-architecture/phase-3.3-production-retail.md`. Phase 3.4 completed 2026-08-14.

## 2026-08-13 — Phase 3.2 Deploy/start vertical configuration (Accepted + Implemented)

Env `ACTIVE_VERTICAL_ID`; unset→`restaurant`; empty/unknown fail-closed; commit once in `startServer` before remount; `retail-test` allowed as synthetic selection; production Retail delivered in Phase 3.3. No runtime switch. Doc: `docs/03-architecture/phase-3.2-capability-configuration.md`.

## 2026-08-13 — Phase 3.1 Fail-closed vertical remount (Accepted + Implemented)

**Outcome A.** `registerRoutes` is capability-aware: restaurant-only mounts gated by module enablement. Unknown vertical throws `CompositionValidationError` (no restaurant fallback). Tests may use retail-test mount override; production `ACTIVE_VERTICAL_ID` remains restaurant. Doc: `docs/03-architecture/phase-3.1-fail-closed-remount.md`. Phase 3.2 not started.

## 2026-08-13 — Phase 2 closeout & Phase 3 architecture gate (Accepted)

Phase 2 declared **CLOSED**. Live ownership audit PASS (soft-gate residuals documented). Lego property proven (Core→Retail E2E; Core+Restaurant→Restaurant). Phase 3 objective = practical platformization, not another boundary exercise. Ordered sub-phases: **3.1** fail-closed remount (blocker) → **3.2** vertical/capability config → **3.3** production Retail → **3.4** correctness residuals → **3.5** optional depth. Reject microservices/K8s/Kafka/framework rewrites. Do **not** implement Phase 3 until explicitly tasked; pilot KPI still outranks platform work. Doc: `docs/03-architecture/phase-2-closeout-and-phase-3-gate.md`.

## 2026-08-13 — i18next Phase 2 incremental call-site migration (Accepted + Implemented)

Continue dual-catalog: i18next namespaces under `frontend/src/locales/{lang}/` for migrated keys; legacy flat `lib/i18n/{en,es,pt}.json` remains source of truth for unmigrated UI. Swap only overlapping keys already present in both catalogs. Do not delete legacy keys. English `common.loading` aligned to legacy `"Loading..."` (ASCII ellipsis); es/pt i18next values left as-is. Header in `frontend/src/lib/i18n/i18next.ts` documents remaining dual-catalog usage.

## 2026-08-13 — Phase 2 architecture hardening after dependency integration (Accepted + Implemented)

Expanded justified package adoption without Phase 3: Zod on Order create/add-items, Payment single/batch, Refund body, Inventory stock adjust (`main/validation/*` + `validateBody`); incremental i18next migration of overlapping namespace keys (settings/common/pos/orders/products); OTel spans on order/payment/inventory/tax/auth recover + `withSpanSync`; removed redundant post-Zod login emptiness check. Deferred: tax-preview HTTP extract, full i18n unification, discount/held-order Zod, OTel exporter. Plan: `docs/03-architecture/dependency-integration-plan.md`.

## 2026-08-13 — Dependency addition & integration (Accepted + Implemented)

Justified packages integrated without replacing working equivalents. **Added (root):** zod, pino-pretty (dev), pino-http, helmet, compression, @opentelemetry/api, date-fns, vitest, prettier, eslint-config-prettier, husky, lint-staged. **Added (frontend):** @tanstack/react-query, date-fns, i18next, react-i18next, vitest. **Skipped:** zustand (already present), express-rate-limit (custom LAN-aware `rateLimit`/`authRateLimit` retained). State rule: server→Query, client→Zustand, domain→SQLite. i18next foundation + Settings language migration; legacy flat `t()` retained. Plan: `docs/03-architecture/dependency-integration-plan.md`.

## 2026-08-13 — Phase 2 final exit gate (Accepted)

Phase 2 declared **COMPLETE** after CURRENT 2.14–2.18 seams. Decision **PASS WITH DOCUMENTED DEFERMENTS**. Interim `phase-2-exit-gate.md` preserved. Schema v75. Production vertical restaurant. retail-test synthetic. Full listed regression PASS. Cursor trailer on already-pushed `0e4a41a` not rewritten. Doc: `phase-2-final-exit-gate.md`.

## 2026-08-13 — Phase 2.18 Synthetic Retail validation (Accepted + Implemented)

Strengthened `retail-test` as architecture-only composition: shared commerce modules without tables/kitchen/kds/menu/addons; production `VERTICALS` / `ACTIVE_VERTICAL_ID` remain restaurant; `business_type` still maps retail → restaurant. Tests: `synthetic-retail-composition`, `shared-module-vertical-neutrality`, **`synthetic-retail-sale`** (takeaway Product→Inventory→Order→Tax→Bill→Pay + historical snapshot + payment idempotency). Not production Opervia Retail. Doc: `phase-2.18-synthetic-retail-validation.md`.

## 2026-08-13 — Phase 2.16 POS orchestration boundary (Accepted + Implemented)

POS is an orchestrator composing Order/Payment/Tax/Inventory — not a domain owner. Added `frontend/src/lib/pos/checkout-coordinator.ts` (`placePostpaidOrder` / `placePrepaidOrder`) extracting checkout HTTP sequences without payload changes; `orchestration.ts` exports `POS_OWNED` / `POS_DOES_NOT_OWN` (tax engine, inventory stock, payment tender internals). Soft-gated AddonModal behind `isModuleEnabled('addons')`; KOT print via `isFeatureAvailable('kds', kotPrintingEnabled)`; tables gate preserved. No POS backend god-service; `pos-info.ts` stays thin; no UI layout redesign; restaurant modules ON → identical UX. CURRENT DEBT: discount reconciliation / attempt storage / print triggers remain in `pos/page.tsx`. Tests: `pos-orchestration-boundary`. Doc: `phase-2.16-pos-orchestration-boundary.md`.

## 2026-08-13 — Phase 2.17 Restaurant isolation (Accepted + Implemented)

Soft-gated Order restaurant side effects behind `isModuleEnabled('tables')` / `isModuleEnabled('kds')` in `main/routes/orders.ts` (occupy, free on complete/cancel/convert/last-item-cancel, all `notifyKdsUpdate`). Catalog documents that restaurant modules must not be dependencies of shared/core modules. Restaurant ACTIVE vertical keeps tables+kds → identical UX. Express routes remain mounted; no production Retail; no money/inventory/tax/schema change (v75). Fail-closed remount deferred Phase 3. Tests: `restaurant-isolation`, `order-restaurant-isolation`. Doc: `phase-2.17-restaurant-isolation.md`.

## 2026-08-13 — Phase 2.15 Payment domain boundary (Accepted + Implemented)

Extracted `preparePaymentBatch` / `applyPaymentBatch` into `main/services/payment-tender.ts` with ownership markers (`PAYMENT_OWNED` / `PAYMENT_DOES_NOT_OWN`). Soft-gated bill-paid restaurant side effects: table free behind `isModuleEnabled('tables')`; KDS notify behind `isModuleEnabled('kds')`. Restaurant ACTIVE vertical keeps both modules enabled → identical behavior. Synthetic `retail-test` excludes both (composition-only; not production). No FIN-01 / refund / tax / money math change; no schema migration; no API contract change; `payment-cash.ts` and `refund.ts` untouched. Tests: `payment-boundary`, `payment-without-restaurant`. Doc: `phase-2.15-payment-domain-boundary.md`.

## 2026-08-13 — Phase 2.14 / Phase 2 Exit Gate (Accepted + Implemented)

Phase 2 modular foundation declared **COMPLETE** with exit decision **PASS WITH DOCUMENTED DEFERMENTS**. Code audit confirmed registry/contracts/composition, Inventory write+ledger+history read, Tax facade/HTTP/snapshot, Product ownership maps, Restaurant compatibility, synthetic `retail-test` quarantine, schema **v75**, and full exit test matrix PASS. Phase 2.14 changes: catalog `routePrefixes` aligned to real mounts; soft deps declare product→tax, order→inventory/tax, payment→tax; exit docs (`.ai/*`, `phase-2-exit-gate.md`, architecture index updates). Explicitly deferred to Phase 3: packages, fail-closed, multi-vertical runtime, production Retail+, Inventory UI, void×cancel restock fix, legacy tax columns, `db.ts` rewrite. Do not rewrite historical commits for co-author trailers. Doc: `phase-2-exit-gate.md`.

## 2026-08-13 — Phase 2.13 Product ↔ Tax ownership boundary (Accepted + Implemented)

Clarified ownership without behavior change: Product owns persistence of `tax_category_id`/`tax_behavior` as Tax config references; validates via Tax facade only; does not import tax-engine or calculate tax. Legacy `tax_type`/`tax_rate` remain forced none/0. Tax owns calculation/snapshot; Order/Bill persist historical SNAPSHOT_DATA (immutable when product config later changes). Desired dep: Product → Tax facade → tax-engine; Order/Bill → Tax facade / snapshot. No schema migration (v75), no money math, no API shape, no frontend. Tests: `product-tax-boundary.test.ts`. Extraction: Product HIGH, Tax MEDIUM (clearer map, not package-ready). Docs: `phase-2.13-product-tax-ownership.md`.

## 2026-08-13 — Phase 2.12 Inventory movement history read boundary (Accepted + Implemented)

Added Inventory-owned `GET /api/inventory/movements` (`main/routes/inventory.ts`) calling `listInventoryMovements` (product_id, limit 1–500, before_id cursor, id DESC). Auth owner/manager. Catalog `routePrefixes: ['/api/inventory']`. No schema, no UI, no new movement types, no backfill. Stock write HTTP remains on products. Inventory extraction readiness stays MEDIUM.

## 2026-08-13 — Phase 2.11 Tax snapshot contract freeze (Accepted + Implemented)

Named `EngineTaxSnapshot` (existing engine fields only). Exported Item/Charge/Document wrapper types from `tax.ts`. Adapters call `calculateTax`. Money/pack routes import `applyPayableRounding` / `calculateTax` from Tax facade (no route-level `tax-engine`). Characterization: `tax-snapshot-contract.test.ts`. No schema, money, HTTP, or frontend changes. No `snapshotVersion` yet (document versioning strategy). Tax extraction readiness remains MEDIUM.

## 2026-08-13 — Phase 2.10 Tax HTTP boundary consolidation (Accepted + Implemented)

Moved `POST /api/tax/preview` and `GET /api/tax/categories` from inline `index.ts` into `main/routes/tax.ts` mounted via `app.use('/api/tax', taxRoutes)`. Left `/api/tax-packs` and `/api/settings/tax` (plus `taxes_enabled`) separate by design. Auth/flags/contracts/money math unchanged. No schema migration. Tax extraction readiness remains MEDIUM. Tests: `tax-route-boundary.test.ts`. Next: snapshot freeze, movement API/UI, or fail-closed after pilots.

## 2026-08-13 — Phase 2.9 Product↔Inventory write ownership (Accepted + Implemented)

Product create/PUT no longer mutate `stock_quantity` via route SQL. Create inserts product at stock 0 then `applyAbsoluteStockChange` (adjustment + reason `opening` when ≠ 0). Update applies metadata without stock column then Inventory absolute set (reason `product_update`). Zero-delta skips movements. Same `withTxn` for metadata+stock. Soft-delete unchanged; ledger preserved. No schema migration; no `opening` movement_type (reuse `adjustment`). API shape unchanged; no frontend. Tests: `product-inventory-boundary.test.ts`. Inventory stays MEDIUM (stronger write ownership; columns still on products).

## 2026-08-13 — Phase 2.8 Inventory movement ledger (Accepted + Implemented)

Append-only `inventory_movements` at schema **v75**. Dual model: `products.stock_quantity` = runtime current-state cache; ledger = durable history from migration onward (no backfill). Types: `sale`, `cancel_restore`, `adjustment` only. Refunds/voids still do not restock and write no rows. Stock UPDATE + INSERT share one SQLite txn. No new HTTP/UI. Diagnostics: `calculateLedgerStock`, `compareCurrentStockToLedger`. Docs: `phase-2.8-inventory-ledger.md`. Tests: `inventory-ledger.test.ts`. Extraction readiness Inventory MEDIUM→MEDIUM (stronger history, still product-column coupled). Next: product CRUD stock via ledger, movement API/UI, or tax HTTP consolidation.

## 2026-08-13 — Phase 2.7 Inventory + Tax domain boundaries (Accepted + Implemented)

In-place boundary hardening only. New `main/services/inventory.ts` owns stock assert/decrement/restore/adjust/low-stock fragment; callers (orders/products/index) keep `withTxn`. No `routes/inventory.ts` (HTTP remains under products). Tax: facade `calculateTax`, re-export payable rounding, centralize Math.round discount item-tax scale without changing money values. No schema migration, no db.ts rewrite, no package extraction, no frontend redesign, no fail-closed deps. Extraction readiness Inventory/Tax HIGH→MEDIUM. Docs: `phase-2.7-domain-boundaries.md`. Tests: `inventory-boundary`, `tax-boundary`. Next: optional ledger schema or tax HTTP consolidation after pilots.

## 2026-08-13 — Phase 2.6 Module contract + capabilities (Accepted + Implemented)

Extended `OperviaModule` / `ModuleDefinition` with required domain-level `capabilities` (`CapabilityId`, `{domain}.{verb}`). Soft integrity via `validateModuleDefinitions` + extended `validateRegistryIntegrity`. Helpers: `getModuleCapabilities`, `moduleOwnsCapability`, `findCapabilityOwner` — discovery only, never authorization. No nav/settings/permissions metadata in catalog; no HTTP API expansion; no frontend capability consumers; no fail-closed; no package extraction. Docs: `module-contract.md`, `module-ownership.md`, `extraction-readiness.md`. Tests: `module-contract.test.ts`. Next: deepen inventory/tax boundaries or fail-closed design after pilots.

## 2026-08-13 — Phase 2.5 Synthetic retail-test composition (Accepted + Implemented)

Non-production `retail-test` / Opervia Retail Test fixture in `main/modules/fixtures/` + `SYNTHETIC_VERTICALS` lookup. Production `VERTICALS` and `ACTIVE_VERTICAL_ID` remain restaurant-only. Proves shared ModuleIds compose into two verticals without duplicating implementations; restaurant-only modules excluded from retail-test. Soft dependency validation only — fail-closed deferred. No `?verticalId=` on HTTP API. Settings: printing/notification/backup gated with `isModuleEnabled`. Tests: `module-vertical-composition.test.ts`. Docs: `phase-2.5-vertical-composition-validation.md`. Next: P2.6 fail-closed after pilot proof OR real Retail requirements.

## 2026-08-13 — Phase 2.4 Composition read API + settings gates (Accepted + Implemented)

Minimal authenticated `GET /api/platform/composition` for owner/manager via existing JWT + `requireRole`. Response is `getPlatformCompositionResponse()` — projection of Phase 2.3 snapshot without dependency/integrity internals. Settings tabs tax/shifts/kds/loyalty gated with `isModuleEnabled`; feature flags unchanged inside tabs. No module UI, no schema change, no package extraction. Tests: `platform-composition-api.test.ts`, `flo-settings-module-gating.test.ts`. Docs: `phase-2.4-platform-composition-api.md`. Next: P2.5 fail-closed deps or broader gates.

## 2026-08-13 — Phase 2.3 Composition snapshot (Accepted + Implemented)

Read-only `getCompositionSnapshot()` in `main/modules/composition.ts` — orchestrates registry + Phase 2.2 diagnostics (no duplicate validation). Deterministic sorted output; dev-only `[Opervia Composition]` log. No HTTP endpoint, no settings UI, no schema change, no package extraction. Tests: `module-composition.test.ts`. Docs: `phase-2.3-composition-snapshot.md`. Next: P2.4 optional GET / settings gates.

## 2026-08-13 — Phase 2.2 Module consumers + soft diagnostics (Accepted + Implemented)

Registry becomes a capability-discovery layer: broader nav/`isFeatureAvailable` consumers; Category-2 restaurant gates → modules (`tables`, `addons`, `kds`); soft `validateVerticalDependencies` + integrity + dev-only `[Opervia Modules]` log. No fail-closed deps, no route remount, no schema change, no package extraction. Tests: `module-diagnostics.test.ts`, extended flo-ui-shell/registry. Docs: `phase-2.2-module-consumers.md`. Next: P2.3 optional composition API / deeper settings gates.

## 2026-08-13 — Phase 2.1 Module registry + Restaurant vertical (Accepted + Implemented)

Lightweight metadata seam only: `main/modules/` catalog + Opervia Restaurant vertical definition + read-only `isModuleEnabled` / `getEnabledModules` / `isFeatureAvailable`. Nav tables/kitchen use `requiresModule` alongside existing flags/`businessTypes`. No package extraction, no route rewrite, no schema change, no dep enforcement. Tests: `tests/module-registry.test.ts`. Docs: `phase-2.1-module-registry.md`. Next: P2.2 broaden consumers.

## 2026-08-13 — ADR-010 Opervia platform brand + modular vision (Accepted)

Opervia is canonical platform and product brand. Nexora POS retired as active name. Phase 1 product = Opervia Restaurant on shared codebase. Docs: `docs/00-product/opervia-platform.md`, `verticals.md`, `principles.md`; `docs/03-architecture/modular-architecture.md`, `module-system.md`, `vertical-architecture.md`, `dependency-model.md`, `architecture-gap-report.md`; `docs/modules/README.md`; ADR-010. Branding consolidation (same day): STRATEGY, vision, docs/README, `productName: Opervia`, UI i18n/manifest/layout, user-facing main strings. Historical `15-*` audits preserved. `appId` / linux `executableName` unchanged for upgrades. Next technical step when approved: lightweight module registry + vertical definition without package extraction. Opervia Custom / microservices / per-vertical repos deferred.

## 2026-08-13 — P1.6 Pilot release readiness (Accepted — docs + verification)

Docs-first release readiness: `pilot-release-checklist.md`, `pilot-signoff.md`, `pilot-incident-log.md`, `p1.6-pilot-release-readiness.md`. No production-code changes. Verification: `npm test` PASS, `npm run build` PASS, focused REC-01/backup/refunds/financial/shift/security PASS, isolated fresh-install smoke PASS, P1.5 DR evidence accepted. Verdict **READY WITH CONDITIONS** (not READY FOR PILOT): production signing, Master PIN escrow, OPS-01, backup policy approval, human sign-off still PENDING. Phase C / REC-01/FIN-01/B2/JWT redesign out of scope.

## 2026-08-13 — P1.5 shift enablement via Settings (Accepted + Implemented)

DR drill STOP: `shifts_enabled` / `require_open_shift_for_cash` were seeded false and missing from `ALLOWED_WILDCARD_KEYS` with no Settings UI — accidental omission vs peers (`kds_enabled`, `taxes_enabled`). Fix: allowlist only those two keys; owner/manager `PUT /api/settings/:key` with strict `true`/`false` validation; Settings → Shifts toggles. `terminal_id` remains blocked. Tests: `tests/shift-settings-api.test.ts`. Packaged verify PASS on isolated userdata.

## 2026-08-13 — P1.2 REC-01 recovery startup hotfix (Accepted + Implemented)

Packaged DR drill NO-GO: missing `flo.db` + marker correctly latched `RECOVERY_REQUIRED`, then `initialize()` always called `startServer()` → `getNetworkMode()` → `getSettingValue()` on closed DB → crash before `/recovery`. Fix (orchestration only): recovery/closed-DB listen uses `DEFAULT_NETWORK_MODE` (`127.0.0.1`) without calling `getNetworkMode`; skip WhatsApp DB init; reject KDS upgrades without `isKdsEnabled`; mount `recoveryApiProtectionMiddleware` before `requireAuth`. Existing Master PIN IPC restore unchanged. Tests: REC01-16 + strengthened REC01-07. Packaged verify PASS on isolated `--user-data-dir`.

## 2026-08-13 — P1.5 Pilot operations + DR pack (Accepted + Docs implemented)

Docs-first milestone only (no `main/`/`frontend/` changes): café `pilot-runbook.md`, `dr-drill-worksheet.md`, backup/DR/ops/runbook/incident updates, continuity + production-readiness drift fixes. OPS-01, REC-01 STOP RULE, Master PIN escrow, WIN-01 signed Windows, Linux keyring gates documented. Backup frequency/retention remain **POLICY VALUE PENDING APPROVAL**. Go-live still requires executed DR drill. See `p1.5-pilot-ops-dr-readiness-audit.md`.

## 2026-08-13 — P1.2 REC-01 security hardening (Accepted + Implemented)

Final review fixes only (no redesign): (1) factory reset clears `install-state.json` **after** durable empty DB commit; recreate uses `allowCreateDespiteMarker`; failure keeps/restores marker + safety-backup rollback; (2) `recoveryApiProtectionMiddleware` fail-closed → HTTP 503 `RECOVERY_STATE_UNAVAILABLE` (never `next()` on eval failure). Behavioral tests REC01-05/06/07/13/14/15. See `p1.2-rec-01-recovery-audit.md`.

## 2026-08-13 — P1.2 REC-01 fail-closed missing DB (Accepted + Implemented)

Durable `userData/install-state.json` marker. Missing/empty operational DB with marker → `RECOVERY_REQUIRED` (no silent empty café). Setup blocked; money APIs 503; KDS/mDNS skipped; `/recovery` reuses Master PIN IPC restore. Factory reset clears marker after durable empty reset. Backfill only when `users > 0`. Tests: `tests/rec-01-recovery.test.ts`. See `p1.2-rec-01-recovery-audit.md`.

## 2026-08-13 — P1.2 REC-01 recovery discovery (Superseded by implementation)

Discovery was **YELLOW**. Implementation completed same day.

## 2026-08-13 — P1.2 Backup→destroy→restore continuity (Accepted + Implemented)

Continuity E2E landed. Score **76/100 — GREEN WITH CONDITIONS**. Suite `tests/backup-restore-continuity.test.ts` (wired into `npm run test:backup`) proves fixture → backup → destroy → restore for orders/bills/payments/refunds/FIN-01/shifts/day-close/audits + Scenario A/B JWT. Minimal prod fix: corrupt/non-SQLite backup open in `restoreBackup` returns `{ success: false }` without touching live DB. **At ship time REC-01 was unchanged**; **REC-01 later CLOSED** (`p1.2-rec-01-recovery-audit.md`). No JWT/FIN-01/backup-format redesign in P1.2. See `docs/15-project-management/p1.2-backup-restore-continuity.md`.

## 2026-08-13 — P1.2 Backup→destroy→restore continuity discovery (Superseded by implementation)

Discovery was **58/100 — YELLOW**. Implementation completed same day; REC-01 was deferred then and **later closed**.

## 2026-08-13 — FIN-01 collectible outstanding after partial refund (Accepted + Implemented)

Payment eligibility uses **gross successful tender**, not net `paid_amount`. Invariant: `collectible outstanding = bill_total − gross_successful_tender`; `net paid = gross − completed_refunds`. Refunds never recreate payment capacity. Minimal change in `preparePaymentBatch` (`main/routes/bills.ts`). Tests: `tests/integration-refunds.test.ts` §19–21. M6 refund architecture unchanged. See `reporting-financial-semantics.md` and `p0.6-final-production-security-audit.md`.

## 2026-08-13 — P0.6 final production security audit (Accepted discovery)

Discovery-only final audit after P0.1 / P0.2 / P0.6 A+B1+B2. Score later updated to **78/100** after FIN-01 close. Verdict **GO WITH CONDITIONS**. Identified **FIN-01** (partial tender + refund over-collection) — **since CLOSED**. Dominant residual: XSS → localStorage JWT → API (Phase C). Ops P0: no guest Wi‑Fi. See `docs/15-project-management/p0.6-final-production-security-audit.md`.

## 2026-08-13 — Electron updater IPC Phase B2 (Accepted + Implemented)

CEO+CTO-directed Option B. `restart-and-install` requires active owner/manager JWT via `authorizeOwnerManagerJwt` (`main/security/ipc-auth.ts`) + `handleRestartAndInstall` (`main/security/restart-and-install.ts`). Reuses `getJWTSecret` / revoke / stale / `getUserAuthStatus`. Master PIN intentionally **not** used. `get-status` / `get-update-status` / `check-for-updates` remain public. Audit action `updater.restart_and_install` (no token/secret in metadata). Preload: `restartAndInstall(token)`. Tests: `tests/electron-ipc-phase-b2.test.ts`, `npm run test:electron-ipc-b2` → `test:security`. Verdict **GREEN WITH HARDENING**. Residual: stolen owner/manager JWT; CSP/localStorage → Phase C. See `docs/15-project-management/p0.6-updater-security-audit.md`.

## 2026-08-13 — Electron updater IPC Phase B2 discovery (Superseded by implementation)

Discovery verdict was **YELLOW — HARDENING REQUIRED**. Recommended Option B; implemented same day.

## 2026-08-13 — Electron IPC security Phase B1 (Accepted + Implemented)

Hybrid D B1 shipped: orphan IPC removed (`db-health-check`, `db-apply-safe-fixes`, `db-initialize`, `get-settings`/`set-setting`, `get-printers`/`save-printer`, `get-daily-summary`, `get-kds-info`, `open-kds-window`, `whatsapp-get-status`); restore hardened to managed `fileName` under `userData/backups` or OS picker path validated by `validateExternalRestorePath` (`main/security/restore-path.ts`); Settings passes `backup.fileName`; Master PIN unchanged; retained desktop bridge (backup/restore, master-pin-status, get-app-info, status/updates). Tests: `tests/electron-ipc-phase-b1.test.ts`, `npm run test:electron-ipc-b1` → `test:security`. Verdict **GREEN WITH HARDENING**. Phase B2 discovery completed same day (`p0.6-updater-security-audit.md`); implementation still pending approval. See `docs/15-project-management/p0.6-ipc-security-architecture.md`.

## 2026-08-13 — Electron IPC security Phase B discovery (Superseded by B1 implementation)

Discovery recommended **Hybrid D**; B1 implemented same day. Residual: authorize `restart-and-install` in B2.

## 2026-08-13 — Electron security P0.6 Phase A (Accepted + Implemented)

Phase A shipped: primary/KDS/popup `sandbox: true` via `getPrimaryRendererWebPreferences()` / `main/security/browser-window-security.ts`; `attachRendererNavigationGuards` fail-closed on `will-navigate`/`will-redirect` (same allowlist as `isAllowedLocalWindowUrl` / `isAllowedRendererNavigation`); child windows guarded; preload unchanged. Tests: `tests/electron-sandbox-phase-a.test.ts`, `npm run test:electron-sandbox` → `test:security`. No JWT/LAN/schema/auth/business-logic changes; Win32 `disable-gpu-sandbox` orthogonal. Verdict **GREEN WITH HARDENING**. Phase B1 later implemented (see B1 ADR); B2 pending. See `docs/15-project-management/p0.6-electron-security-audit.md`.

## 2026-08-13 — Electron security P0.6 Phase 1 discovery (Superseded by Phase A)

Discovery verdict was **YELLOW — HARDENING REQUIRED**. Confirmed `sandbox: false` had no functional requirement; Windows GPU switch is separate. Dominant residual risk (post–Phase A still true): XSS → unauthenticated IPC + stolen `localStorage` JWT → local API. Phase A implemented same day.

## 2026-08-13 — JWT secret storage Option B (Accepted + Implemented)

CEO+CTO approved. Production secret via Electron `safeStorage` → `userData/jwt-secret.enc`. SQLite plaintext removed after crash-safe migration. `JWT_SECRET` env CI-only. Rotate/recover via owner + Master PIN. Schema v74 marker `jwt_secret_storage`. See `docs/15-project-management/p0.2-jwt-secret-storage-audit.md`.

## 2026-08-13 — JWT secret storage Phase 1 discovery (Superseded)

Discovery recommended Option B; implementation completed same day.

## 2026-08-12 — LAN security Phase 1 implementation (Accepted)

CEO+CTO approved Model D+E hybrid. Implemented `settings.network_mode`:

| Mode | POS | KDS | Server App |
|------|-----|-----|------------|
| `localhost` (default) | 127.0.0.1 | 127.0.0.1 | 127.0.0.1 |
| `kds_lan` | 127.0.0.1 | 0.0.0.0 | 127.0.0.1 |
| `lan` | 0.0.0.0 | 0.0.0.0 | 0.0.0.0 |

Invalid/missing → `localhost`. Restart required. Guest Wi‑Fi unsupported. mDNS/QR gated. Schema v73. TLS deferred. See `docs/15-project-management/p0.1-lan-security-audit.md`.

## 2026-08-12 — LAN security Phase 1 discovery (Superseded by implementation)

Audit captured baseline always-`0.0.0.0` bind. Verdict was YELLOW; implementation closed Phase 1.1.

## 2026-08-12 — Day-close cash refunds (Accepted)

Day-close summary reuses `getShiftPaymentSummary` from `shift.ts` (no second refund formula). Exposes `cash_payment_total_cents` (Cash In), `cash_refund_total_cents`, `net_cash_movement_cents`. Persisted shift `expected_cash_cents` remain authoritative for drawer expected; closed shifts stay immutable; late cash refunds stay on the open shift.

## 2026-08-12 — P0.2 financial hardening (Accepted)

CEO+CTO approved after YELLOW P0.2 audit. M6 refund architecture unchanged.

- **Re-pay:** `payment_status=refunded` → reject `BILL_ALREADY_REFUNDED`. Fully tendered bills (gross `payment_details` ≥ total) reject `BILL_NO_OUTSTANDING_BALANCE` even if net `paid_amount` dropped after refund. No bill reopen — new bill/order required.
- **Reporting:** Gross Sales / Refunds / Net Sales / Payments Received / Net Cash Movement documented in `docs/15-project-management/reporting-financial-semantics.md`. `paid_amount` = net; `payment_details` = gross tender.
- **Audit:** successful payments emit `payment.received` inside the same `withTxn` as the mutation.
- **Idempotency:** `Idempotency-Key` mandatory on payment mutations (`PAYMENT_IDEMPOTENCY_REQUIRED`). Frontend already sent keys.

## 2026-08-12 — M6 Refund model (Accepted)

See `docs/14-decisions/ADR-009-refund-model.md` (Accepted) and `docs/15-project-management/m6-refund-architecture.md` (APPROVED).
Locked: always PIN; cash refunds only affect recon; card = record-only; no cashback clawback; print/UI deferred; method must match payment line; refundable from original collected − completed refunds.

## 2026-08-12 — Nexora POS mandate (CEO + CTO)

- **Current product name:** Nexora POS (local-first café POS). **Future platform:** Nexora RestaurantOS. Do not conflate.
- **North-star KPI:** 3 cafés × 30 days × zero critical failures before RestaurantOS depth.
- **Freeze until pilots:** AI, aggregators, multi-tenant SaaS, multi-location implementation, ERP inventory, payment terminals, Bluetooth print, microservices/K8s, architecture rewrites.
- **Keep architecture:** Electron + SQLite per store + Express monolith + optional cloud that never blocks billing.
- **Refactor rule:** improve service boundaries only when touching a domain (e.g. refunds → billing paths); no giant rewrite.
- **Branding:** prefer Nexora / Nexora POS / Nexora RestaurantOS; no new product names; no mass rename without migration plan.
- **Canonical docs:** `STRATEGY.md`; execution backlog in `.ai/tasks.md`.

See `docs/14-decisions/ADR-007-shift-model.md` (per-terminal shift).

M4-C choices:

- HTTP path for the current shift is `GET /api/shifts/active` (RFC also mentioned `/current`).
- Monetary API fields are integer cents.
- `shifts_enabled=false` → shift APIs return 503; orders/payments unchanged.
- Host `terminal_id` is generated once into `settings.terminal_id`. Browser clients must send their own id.

M4-D1 choices:

- Browser/Electron renderer persist `localStorage['flo_terminal_id']` via `crypto.randomUUID()`.
- Do **not** seed browser identity from `GET /api/shifts/terminal-id` (that is the host id).
- Same-origin Electron renderer + localhost tab share the key (one register). LAN IP origin gets its own UUID.
- `X-Flo-Terminal-Id` is attached only to POST `/orders`, POST `/bills/:id/payment(s)`, GET `/shifts/active`, POST `/shifts/open`, POST `/shifts/:id/close`.
- Server App does not send a terminal header.

M5-G choices (locked):

- OD-M5-5: business date = calendar day in `settings.timezone` (default Asia/Kolkata), not UTC.
- OD-M5-6: day close with open shifts = WARN in summary, still allow.
- Schema version **v71** for `day_closes` (v70 shipped without day_closes).
- UNIQUE(business_date) → 409; GET returns existing; POST creates once.
- Owner/manager only; do not block POS after day close.
- Aggregate CLOSED shifts by `closed_at` in local business-date window; use persisted expected/variance/counted.

UI Phase 11 (Settings):

- Flo-restyle shell + tab bodies on Flo tokens; nested `/settings/*` route split remains optional IA (dirty save bar + Electron deep links).
- Keep shifts tab + `ShiftHistoryPanel`; add link note to `/operations`.

UI dark mode:

- Persist preference in `localStorage['flo_theme']` as `light` | `dark` | `system`.
- Apply via `document.documentElement.classList.toggle('dark', …)`; FOUC bootstrap in root layout.
- Sidebar `ThemeToggle` cycles modes; AppShell listens for system preference changes when `system`.

POS modals Flo migration:

- Replace custom `fixed inset-0 bg-black/*` overlays with shadcn `Dialog`.
- Flo tokens (`bg-flo-surface`, `border-flo-border`, `text-flo-brand-600`, `min-h-11`) on Payment/Prepaid/Addon/Table/Split/Customer/Printer chrome.
- Guard: `test:flo-pos-modals` wired into `test:security`.

KDS/shifts/misc Flo components:

- KDS login uses `AuthShell`; `KdsItemModal` and product `ImageUploader` crop UI use shadcn `Dialog`.
- Shift history/preview/status/modals + UpdateBadge/AuthGuard spinner on Flo tokens; preserve STATUS_CONFIG kitchen colors.
- Guard: `test:flo-components-complete` greps `pos|kds|shifts|settings|layout|products` for legacy overlays/card shells; wired into `test:security`.
