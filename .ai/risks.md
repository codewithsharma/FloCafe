# Risks

## Active program notes (2026-08-15)

- ⚠️ RISK: **R12 void report** is audit-derived (not a second money ledger). Incomplete historical audits before H1/R1 audit coverage will under-count. Prefer CSV for full periods; UI shows first 25 rows.
- ⚠️ RISK: **R10 guest QR** expands unauthenticated LAN surface to `/api/public/qr/*` (token-scoped). Mitigations: opaque tokens, rotate, inactive system user, no cost exposure, pay-at-counter only. Keep guest Wi‑Fi unsupported; use staff LAN / kiosk.
- ⚠️ RISK: **R16 live Go-Live** remains **NO-GO** until signed/notarized RC + OPS-02 human/site gates — engineering completion of R-waves ≠ production PASS.

## Production blockers (P0)

- ⚠️ RISK: **Post-P0 + H1/H2/H3 + ops audit (2026-08-14)** — Restaurant **81/100** / Retail **74/100** **PILOT READY WITH CONDITIONS**. Software bar green at `0200cae`. Live service blocked on human gates (signed RC — version must bump past tagged 3.0.5; OPS-01; PIN escrow; backup policy; café printer/KDS/restore drills; training/sign-off). Residual software: P1-06 unopenable DB; P1-05; P1-12. Composition fail-open **P2**. ADR-014 Proposed.
- 🔒 SEC: **Final P0.6 audit GO WITH CONDITIONS** (score 78) — `p0.6-final-production-security-audit.md`. Electron A/B1/B2 closed. **FIN-01 CLOSED** (collectible = total − gross tender). **OPS-01:** guest Wi‑Fi + `kds_lan`/`lan` forbidden.
- 🔒 SEC: LAN exposure is mode-gated (`network_mode`; default `localhost`). Cleartext HTTP/WS still applies on staff LAN when `kds_lan`/`lan` — guest Wi‑Fi unsupported; TLS deferred (**P1 accept with ops**).
- 🔒 SEC: JWT in `safeStorage` (`jwt-secret.enc`). Residual: same-OS-user malware; Linux keyring (**P2**).
- 🔒 SEC: CSP `'unsafe-inline'` + JWT in `localStorage` — XSS→API (**P1 / Phase C**). Stolen owner JWT still authorizes Drive backup-now **with Master PIN** (R4.1) and B2 restart.
- ~~🔒 SEC: Drive `backup-now` is owner JWT without Master PIN (**P1 DRV-01**).~~ **CLOSED R4.1** — `requireMasterPin` on Drive backup-now.
- ⚠️ RISK: Money `REAL` residual — **P0.3 Phase 1+2 dual-write + prefer-cents readers** (schema v81). Final REAL drop / cutover still deferred. Cancel-after-pay / discount-on-settled gaps (**P1**). Refund receipt print: Phase 3.6A + WebUSB parity 3.6G COMPLETE.
- ⚠️ RISK: **Retail product gap** — Phase 4.1–4.5 closed; **ADR-013 Accepted** (Option A identity). Matrix not authorized. PO/receiving STRATEGY-frozen.
- ⚠️ RISK: **Retail variants (4.6)** — parent+options stock ambiguity forbidden; unused `variant_selection` must not become identity; barcode lacks DB UNIQUE.
- ⚠️ RISK: Financial audit still sparse on discounts, PIN overrides, DB import/export, Master PIN ops.
- ⚠️ RISK: Order cancel after pay **409s** when GROSS tender exists (H1). Refund owns money. Repeat PATCH cancel restock **CLOSED**.

## Operational

- ⚠️ RISK: **P1.5 DR PASS**; **P1.6 READY WITH CONDITIONS**; **post-P0 supersedes vertical split** (Restaurant 80 / Retail 72, both conditional). Remaining café go-live: production **signed/notarized** artifact, Master PIN escrow, OPS-01 on site, numeric backup policy **PENDING APPROVAL**, CEO/CTO/pilot sign-off, café training. Printer/new-machine JWT not café-verified. Paid cancel-after-pay restock is **HUMAN H1**.
- ⚠️ RISK: **QA-INV-TAGS-01** — fixed and verified on rebuilt TRAINING package (Inventory no longer crashes on double-encoded tags). Source + regression test still need commit into the release branch.
- ⚠️ RISK: **QA-FIN01-OVERPAY-01** — **closed as false positive** (2026-08-13 pending-complete). Cash over-tender is intentional change; non-cash over remaining correctly 400.
- ⚠️ RISK: **QA-FIN01-STATUS-01 (P2, display closed in 4.10)** — stored `payment_status`/`balance` may still be net-after-refund; Orders/Pay now use collectible outstanding. Do not “fix” by writing bill status. Rejection (`BILL_NO_OUTSTANDING_BALANCE`) must stay.
- ⚠️ RISK: **P1.2 REC-01 GREEN WITH HARDENING + startup hotfix** — missing-DB recovery server stays alive (localhost). **R14 closed corrupt-openable latch** (`corrupt_database`). Residual: unopenable `new Database()` throw (P1-06); JWT recover UI still limited; no backup `installation_id`; POS-port WS upgrade handler still registered but rejected in recovery; new-machine recover still needs Master PIN. Live DR drill still **NOT CLAIMED**.
- ⚠️ RISK: Upgrades seed `network_mode=localhost`. Existing LAN KDS/POS/waiter setups need Settings → `kds_lan` or `lan` + restart before tablets reconnect.
- ⚠️ RISK: Electron renderer `flo_terminal_id` and host `settings.terminal_id` may differ. POS requests send the client id; header-less `openShift` still uses the host id.
- ⚠️ RISK: Lost `terminal_id` (cleared localStorage) orphans an open shift; managers must force-close.
- ⚠️ RISK: Doc drift — some older architecture pages / PM audit may lag shipped 3.5A–3.6G; Phase 2–4 truth is **closeout gate + `.ai/` + `docs/04-product/phase-4-product-completion-discovery.md`** (Phase 3.1–3.4 COMPLETE; 3.5A+3.6A–G COMPLETE; 3.5B DEFERRED; 3.5C NO SAFE EXTRACTION; Phase 4 discovery COMPLETE).
- 🔴 DEBT: Legacy `products.tax_type` / `tax_rate` remain on schema (forced none/0; not authoritative). **Phase 3.5B DEFERRED** until pilot evidence; Mode B vs DROP not chosen. See `phase-3.5b-legacy-tax-cleanup-discovery.md`.
- ⚠️ RISK: **R3 kitchen deepen** — companion `kds-server.ts` status PATCH uses `applyKitchenItemStatus` (CAS + timestamps + audit). Residual: client-side bump retry is in-memory (tab reload still drops intent); durable KDS outbox remains deferred.
- ⚠️ RISK (ops): Café pilots must keep `ACTIVE_VERTICAL_ID` unset or `restaurant`. Accidental `=retail` selects production Retail (wrong for café); `=retail-test` selects synthetic composition.
- ⚠️ RISK: Brand consolidation to **Operavia** (ADR-010) — living docs/STRATEGY/`productName`/UI i18n updated; historical `15-*` audits still say Operavia/FloCafe; `appId`/`executableName` remain flo\* for upgrade continuity; Drive folder is `Operavia Backups` (old `Operavia Backups` not auto-migrated).
- ⚠️ RISK: Phase 2.6 capabilities are metadata only — any future consumer must not treat `CapabilityId` as authorization (roles/`requireRole` remain authoritative).
- ⚠️ RISK: Soft module registry — **Phase 3.1–3.4 CLOSED** (fail-closed remount; deploy/start vertical; production `retail`; soft-gate/correctness residuals closed).
- ⚠️ RISK: Dual i18n catalogs during migration — i18next namespaces + legacy flat `lib/i18n/*.json`; migrate gradually; avoid key drift. **Fixed 2026-08-14:** `MenuActionHandler` must stay inside `AppProviders` (`NO_I18NEXT_INSTANCE`); guarded by `tests/flo-ui-shell.test.ts`.
- ⚠️ RISK: Frontend bundles `main/modules` via Turbopack — lazy `require('./vertical-config')` can resolve to a module without `getCommittedActiveVerticalId` → UI crash `t is not a function` on `isModuleEnabled()` without verticalId. **Mitigated 2026-08-14:** `resolveActiveVerticalIdFromConfigModule` typeof fallback + dashboard passes composition `verticalId`.
- ⚠️ RISK: Helmet CSP still allows `'unsafe-inline'` for Next static export (Phase C CSP hardening deferred).
- ⚠️ RISK: Void + full-order cancel stock over-restore — **CLOSED in Phase 3.4** (skip `voided` / `void_adjustment` on restore; expect stock 8).
- 🔴 DEBT: Extraction readiness: Order LOW–MEDIUM; Payment tender MEDIUM; Inventory/Tax MEDIUM; Product HIGH; POS/KDS HIGH — see `extraction-readiness.md`. Phase 2 COMPLETE; extraction is Phase 3.
- ⚠️ RISK: **Accounting CSV UTC boundary** — export uses UTC calendar days (same as Reports `/summary`); day-close uses tenant TZ. Phase 4.8 added start/end date UI; 93-day cap unchanged.
- ⚠️ RISK: **ADR-014 service charge Proposed** — tax kind exists; amount columns do not. Do not persist a non-zero service charge until human Accept + v76 wiring phase. Tips remain out of scope.
- ⚠️ RISK: Tax discount scale (Math.round money path) differs from preview Decimal scale — intentional compatibility; do not unify without golden tests + product decision. Tax-packs and settings tax HTTP intentionally left outside `routes/tax.ts`. Open-order charge tax may recompute from live pack rates using frozen category IDs (paid bills unchanged — characterized in Phase 2.13).

## Debt (do not giant-rewrite)

- 🔴 DEBT: Monolithic `main/db.ts`; fat `orders.ts` / `bills.ts`; ad-hoc validation — extract when touching those domains.
- 🔴 DEBT: Incomplete FKs on some order/customer columns; “tenant” façade without row isolation (single-tenant by design).

## Explicitly out of scope (temptation risks)

- ⚠️ RISK: **Capability matrix vs code** (2026-08-14) — some 🔵 Planned rows already have shipped slices (86, cash drawer kick, SKU wastage, valuation, addon groups, stations). Rebuilding them is waste. Recipe/BOM + PO listed Planned while STRATEGY still says ERP freeze until ledger foundation — require an authorized slice, not silent implementation.
