# Risks

## Production blockers (P0)

- 🔒 SEC: LAN exposure is mode-gated (`network_mode`; default `localhost`). Cleartext HTTP/WS still applies on staff LAN when `kds_lan`/`lan` selected — guest Wi‑Fi unsupported; TLS deferred. See `p0.1-lan-security-audit.md` (GREEN WITH HARDENING).
- 🔒 SEC: JWT signing secret in Electron `safeStorage` (`userData/jwt-secret.enc`). SQLite/Drive backups no longer carry forge key. Remaining: same-OS-user malware can still decrypt; Linux needs desktop keyring. See `p0.2-jwt-secret-storage-audit.md` (GREEN WITH HARDENING).
- 🔒 SEC: Electron renderer sandbox + navigation — **Phase A done**. Phase B1 **GREEN WITH HARDENING**. Phase B2 **IMPLEMENTED — GREEN WITH HARDENING** (`p0.6-updater-security-audit.md`): `restart-and-install` owner/manager JWT; status/check public; Master PIN not used. Overall P0.6 residual → Phase C (CSP / localStorage JWT). Win32 `disable-gpu-sandbox` orthogonal.
- 🔒 SEC: Stolen active owner/manager JWT can still authorize `restart-and-install` (accepted residual; same as HTTP API). XSS without that role cannot force install.
- 🔒 SEC: Orphan privileged IPC (DB tools, settings, printers, summary, KDS open, WhatsApp status) and renderer absolute restore paths — **mitigated in B1** (removed / `fileName` + `validateExternalRestorePath`).
- 🔒 SEC: CSP `'unsafe-inline'` + JWT in `localStorage` — XSS→API chain remains (Phase C / later).
- 🔒 SEC: `terminal_id` is identification, not authentication; knowing the string + JWT role can close a shift.
- ⚠️ RISK: M6 refunds API + minimal Orders refund UI shipped; **refund receipt print still deferred**. Card refunds are record-only (no gateway).
- ⚠️ RISK: Financial audit coverage improved for payments (`payment.received`); still sparse on discounts, PIN overrides, DB import/export, Master PIN ops.
- ⚠️ RISK: Money stored as SQLite `REAL` in places — rounding/tax/partial-payment correctness risk (P0.3 money migration remains documentation only).
- ⚠️ RISK: Order cancel after pay still lacks refund interaction (P1 from P0.2 audit).

## Operational

- ⚠️ RISK: Upgrades seed `network_mode=localhost`. Existing LAN KDS/POS/waiter setups need Settings → `kds_lan` or `lan` + restart before tablets reconnect.
- ⚠️ RISK: Electron renderer `flo_terminal_id` and host `settings.terminal_id` may differ. POS requests send the client id; header-less `openShift` still uses the host id.
- ⚠️ RISK: Lost `terminal_id` (cleared localStorage) orphans an open shift; managers must force-close.
- ⚠️ RISK: Doc drift — roadmap/feature-list still mark shifts/day-close as NOT BUILT while code has M4–M5 (P0.7).
- ⚠️ RISK: Brand fragmentation (FloCafe / Flo POS / Nexora) confuses pilots and packaging.

## Debt (do not giant-rewrite)

- 🔴 DEBT: Monolithic `main/db.ts`; fat `orders.ts` / `bills.ts`; ad-hoc validation — extract when touching those domains.
- 🔴 DEBT: Incomplete FKs on some order/customer columns; “tenant” façade without row isolation (single-tenant by design).

## Explicitly out of scope (temptation risks)

- Building AI, aggregators, or multi-location **before** pilot KPI — dilutes reliability focus (see `STRATEGY.md` Not working on).
