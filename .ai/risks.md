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
