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
- ⚠️ RISK: Doc drift — roadmap/feature-list may lag Opervia modular CURRENT (registry through Phase 2.6 contracts are built; multi-vertical runtime / packages are not).
- ⚠️ RISK: Brand consolidation to **Opervia** (ADR-010) — living docs/STRATEGY/`productName`/UI i18n updated; historical `15-*` audits still say Nexora/FloCafe; `appId`/`executableName` remain flo\* for upgrade continuity; Drive folder is `Opervia Backups` (old `Nexora Backups` not auto-migrated).
- ⚠️ RISK: Phase 2.6 capabilities are metadata only — any future consumer must not treat `CapabilityId` as authorization (roles/`requireRole` remain authoritative).
- 🔴 DEBT: Extraction readiness: Inventory MEDIUM (writes+ledger owned; stock columns still on products); Tax MEDIUM (HTTP consolidated in `routes/tax.ts`; snapshots + money-path + product tax columns remain); Product/POS/KDS still HIGH — see `extraction-readiness.md`.
- ⚠️ RISK: Inventory ledger starts at v75 with **no backfill**; product create opening uses `adjustment`+`reason=opening` (not a separate type); refunds intentionally do not restock; test/seed fixtures may still INSERT stock outside Inventory.
- ⚠️ RISK: Tax discount scale (Math.round money path) differs from preview Decimal scale — intentional compatibility; do not unify without golden tests + product decision. Tax-packs and settings tax HTTP intentionally left outside `routes/tax.ts`.

## Debt (do not giant-rewrite)

- 🔴 DEBT: Monolithic `main/db.ts`; fat `orders.ts` / `bills.ts`; ad-hoc validation — extract when touching those domains.
- 🔴 DEBT: Incomplete FKs on some order/customer columns; “tenant” façade without row isolation (single-tenant by design).

## Explicitly out of scope (temptation risks)

- Building AI, aggregators, or multi-location **before** pilot KPI — dilutes reliability focus (see `STRATEGY.md` Not working on).
