# Risks

## Production blockers (P0)

- 🔒 SEC: **Final P0.6 audit GO WITH CONDITIONS** (score 78) — `p0.6-final-production-security-audit.md`. Electron A/B1/B2 closed. **FIN-01 CLOSED** (collectible = total − gross tender). **OPS-01:** guest Wi‑Fi + `kds_lan`/`lan` forbidden.
- 🔒 SEC: LAN exposure is mode-gated (`network_mode`; default `localhost`). Cleartext HTTP/WS still applies on staff LAN when `kds_lan`/`lan` — guest Wi‑Fi unsupported; TLS deferred (**P1 accept with ops**).
- 🔒 SEC: JWT in `safeStorage` (`jwt-secret.enc`). Residual: same-OS-user malware; Linux keyring (**P2**).
- 🔒 SEC: CSP `'unsafe-inline'` + JWT in `localStorage` — XSS→API (**P1 / Phase C**). Stolen owner/manager JWT also authorizes Drive backup-now and B2 restart.
- 🔒 SEC: Drive `backup-now` is owner JWT without Master PIN (**P1 DRV-01**).
- ⚠️ RISK: Money `REAL` residual (P0.3 docs-only); cancel-after-pay / discount-on-settled gaps (**P1**). Refund receipt print: Phase 3.6A + WebUSB parity 3.6G COMPLETE.
- ⚠️ RISK: **Retail product gap** — Phase 4.1 closed settings/tables chrome + search depth. **Return/restock:** Phase 4.2 COMPLETE (ADR-011 optional explicit restock). Remaining: PO/receiving, variants, exchanges.
- ⚠️ RISK: Financial audit still sparse on discounts, PIN overrides, DB import/export, Master PIN ops.
- ⚠️ RISK: Order cancel after pay still lacks refund interaction (P1).

## Operational

- ⚠️ RISK: **P1.5 DR PASS**; **P1.6 READY WITH CONDITIONS**; **full-app QA READY WITH CONDITIONS (82)** on TRAINING/QA artifact (`full-app-qa-report.md`). Remaining go-live blockers: production **signed/notarized** artifact, Master PIN escrow, OPS-01 on site, numeric backup policy **PENDING APPROVAL**, CEO/CTO/pilot sign-off, café training. Printer/new-machine JWT not café-verified.
- ⚠️ RISK: **QA-INV-TAGS-01** — fixed and verified on rebuilt TRAINING package (Inventory no longer crashes on double-encoded tags). Source + regression test still need commit into the release branch.
- ⚠️ RISK: **QA-FIN01-OVERPAY-01** — **closed as false positive** (2026-08-13 pending-complete). Cash over-tender is intentional change; non-cash over remaining correctly 400.
- ⚠️ RISK: **QA-FIN01-STATUS-01 (P2)** — after partial refund + full gross settlement, APIs correctly refuse further pay (`BILL_NO_OUTSTANDING_BALANCE`) but bill may still show `payment_status=partial` / net `balance` > 0.
- ⚠️ RISK: **P1.2 REC-01 GREEN WITH HARDENING + startup hotfix** — missing-DB recovery server stays alive (localhost). Residual: corrupt-but-openable live DB still starts with warnings; JWT recover UI still limited; no backup `installation_id`; POS-port WS upgrade handler still registered but rejected in recovery; new-machine recover still needs Master PIN.
- ⚠️ RISK: Upgrades seed `network_mode=localhost`. Existing LAN KDS/POS/waiter setups need Settings → `kds_lan` or `lan` + restart before tablets reconnect.
- ⚠️ RISK: Electron renderer `flo_terminal_id` and host `settings.terminal_id` may differ. POS requests send the client id; header-less `openShift` still uses the host id.
- ⚠️ RISK: Lost `terminal_id` (cleared localStorage) orphans an open shift; managers must force-close.
- ⚠️ RISK: Doc drift — some older architecture pages / PM audit may lag shipped 3.5A–3.6G; Phase 2–4 truth is **closeout gate + `.ai/` + `docs/04-product/phase-4-product-completion-discovery.md`** (Phase 3.1–3.4 COMPLETE; 3.5A+3.6A–G COMPLETE; 3.5B DEFERRED; 3.5C NO SAFE EXTRACTION; Phase 4 discovery COMPLETE).
- 🔴 DEBT: Legacy `products.tax_type` / `tax_rate` remain on schema v75 (forced none/0; not authoritative). **Phase 3.5B DEFERRED** until pilot evidence; Mode B vs DROP not chosen. See `phase-3.5b-legacy-tax-cleanup-discovery.md`.
- ⚠️ RISK (ops): Café pilots must keep `ACTIVE_VERTICAL_ID` unset or `restaurant`. Accidental `=retail` selects production Retail (wrong for café); `=retail-test` selects synthetic composition.
- ⚠️ RISK: Brand consolidation to **Opervia** (ADR-010) — living docs/STRATEGY/`productName`/UI i18n updated; historical `15-*` audits still say Nexora/FloCafe; `appId`/`executableName` remain flo\* for upgrade continuity; Drive folder is `Opervia Backups` (old `Nexora Backups` not auto-migrated).
- ⚠️ RISK: Phase 2.6 capabilities are metadata only — any future consumer must not treat `CapabilityId` as authorization (roles/`requireRole` remain authoritative).
- ⚠️ RISK: Soft module registry — **Phase 3.1–3.4 CLOSED** (fail-closed remount; deploy/start vertical; production `retail`; soft-gate/correctness residuals closed).
- ⚠️ RISK: Dual i18n catalogs during migration — i18next namespaces + legacy flat `lib/i18n/*.json`; migrate gradually; avoid key drift. **Fixed 2026-08-14:** `MenuActionHandler` must stay inside `AppProviders` (`NO_I18NEXT_INSTANCE`); guarded by `tests/flo-ui-shell.test.ts`.
- ⚠️ RISK: Frontend bundles `main/modules` via Turbopack — lazy `require('./vertical-config')` can resolve to a module without `getCommittedActiveVerticalId` → UI crash `t is not a function` on `isModuleEnabled()` without verticalId. **Mitigated 2026-08-14:** `resolveActiveVerticalIdFromConfigModule` typeof fallback + dashboard passes composition `verticalId`.
- ⚠️ RISK: Helmet CSP still allows `'unsafe-inline'` for Next static export (Phase C CSP hardening deferred).
- ⚠️ RISK: Void + full-order cancel stock over-restore — **CLOSED in Phase 3.4** (skip `voided` / `void_adjustment` on restore; expect stock 8).
- 🔴 DEBT: Extraction readiness: Order LOW–MEDIUM; Payment tender MEDIUM; Inventory/Tax MEDIUM; Product HIGH; POS/KDS HIGH — see `extraction-readiness.md`. Phase 2 COMPLETE; extraction is Phase 3.
- ⚠️ RISK: Inventory ledger starts at v75 with **no backfill**; product create opening uses `adjustment`+`reason=opening` (not a separate type); money refunds do not restock (ADR-009); optional Retail restock uses `adjustment`+`reference_type=refund` (ADR-011); test/seed fixtures may still INSERT stock outside Inventory. History API does not claim complete pre-v75 audit.
- ⚠️ RISK: Tax discount scale (Math.round money path) differs from preview Decimal scale — intentional compatibility; do not unify without golden tests + product decision. Tax-packs and settings tax HTTP intentionally left outside `routes/tax.ts`. Open-order charge tax may recompute from live pack rates using frozen category IDs (paid bills unchanged — characterized in Phase 2.13).

## Debt (do not giant-rewrite)

- 🔴 DEBT: Monolithic `main/db.ts`; fat `orders.ts` / `bills.ts`; ad-hoc validation — extract when touching those domains.
- 🔴 DEBT: Incomplete FKs on some order/customer columns; “tenant” façade without row isolation (single-tenant by design).

## Explicitly out of scope (temptation risks)

- Building AI, aggregators, or multi-location **before** pilot KPI — dilutes reliability focus (see `STRATEGY.md` Not working on).
