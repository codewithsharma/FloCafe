# Risks

## Production blockers (P0)

- 🔒 SEC: **Final P0.6 audit GO WITH CONDITIONS** (score 78) — `p0.6-final-production-security-audit.md`. Electron A/B1/B2 closed. **FIN-01 CLOSED** (collectible = total − gross tender). **OPS-01:** guest Wi‑Fi + `kds_lan`/`lan` forbidden.
- 🔒 SEC: LAN exposure is mode-gated (`network_mode`; default `localhost`). Cleartext HTTP/WS still applies on staff LAN when `kds_lan`/`lan` — guest Wi‑Fi unsupported; TLS deferred (**P1 accept with ops**).
- 🔒 SEC: JWT in `safeStorage` (`jwt-secret.enc`). Residual: same-OS-user malware; Linux keyring (**P2**).
- 🔒 SEC: CSP `'unsafe-inline'` + JWT in `localStorage` — XSS→API (**P1 / Phase C**). Stolen owner/manager JWT also authorizes Drive backup-now and B2 restart.
- 🔒 SEC: Drive `backup-now` is owner JWT without Master PIN (**P1 DRV-01**).
- ⚠️ RISK: Money `REAL` residual (P0.3 docs-only); cancel-after-pay / discount-on-settled gaps (**P1**); refund print deferred.
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
- ⚠️ RISK: Doc drift — some older architecture pages may still cite pre-v75 schema; Phase 2 truth is **closeout gate + final exit + `.ai/`** (Phase 2 CLOSED; Phase 3.1 COMPLETE; 3.2+ not started).
- ⚠️ RISK: Brand consolidation to **Opervia** (ADR-010) — living docs/STRATEGY/`productName`/UI i18n updated; historical `15-*` audits still say Nexora/FloCafe; `appId`/`executableName` remain flo\* for upgrade continuity; Drive folder is `Opervia Backups` (old `Nexora Backups` not auto-migrated).
- ⚠️ RISK: Phase 2.6 capabilities are metadata only — any future consumer must not treat `CapabilityId` as authorization (roles/`requireRole` remain authoritative).
- ⚠️ RISK: Soft module registry — **Phase 3.1 CLOSED** for POS `registerRoutes` (disabled modules do not mount). Production Retail / runtime vertical switch still **Phase 3.2/3.3**. Soft-gates remain for side effects; residuals: ungated `notifyOrderUpdated` alias, held-orders without `tables` gate.
- ⚠️ RISK: Dual i18n catalogs during migration — i18next namespaces + legacy flat `lib/i18n/*.json`; migrate gradually; avoid key drift.
- ⚠️ RISK: Helmet CSP still allows `'unsafe-inline'` for Next static export (Phase C CSP hardening deferred).
- ⚠️ RISK: Void + full-order cancel may restore stock for voided lines (Inventory API used correctly; call-site filter gap). Documented at Phase 2 exit; fix requires careful characterization — Phase 3.
- 🔴 DEBT: Extraction readiness: Order LOW–MEDIUM; Payment tender MEDIUM; Inventory/Tax MEDIUM; Product HIGH; POS/KDS HIGH — see `extraction-readiness.md`. Phase 2 COMPLETE; extraction is Phase 3.
- ⚠️ RISK: Inventory ledger starts at v75 with **no backfill**; product create opening uses `adjustment`+`reason=opening` (not a separate type); refunds intentionally do not restock; test/seed fixtures may still INSERT stock outside Inventory. History API does not claim complete pre-v75 audit.
- ⚠️ RISK: Tax discount scale (Math.round money path) differs from preview Decimal scale — intentional compatibility; do not unify without golden tests + product decision. Tax-packs and settings tax HTTP intentionally left outside `routes/tax.ts`. Open-order charge tax may recompute from live pack rates using frozen category IDs (paid bills unchanged — characterized in Phase 2.13).

## Debt (do not giant-rewrite)

- 🔴 DEBT: Monolithic `main/db.ts`; fat `orders.ts` / `bills.ts`; ad-hoc validation — extract when touching those domains.
- 🔴 DEBT: Incomplete FKs on some order/customer columns; “tenant” façade without row isolation (single-tenant by design).

## Explicitly out of scope (temptation risks)

- Building AI, aggregators, or multi-location **before** pilot KPI — dilutes reliability focus (see `STRATEGY.md` Not working on).
