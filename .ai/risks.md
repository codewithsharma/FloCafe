# Risks

## Production blockers (P0)

- 🔒 SEC: Cleartext HTTP binds `0.0.0.0` — JWTs/business data sniffable on guest Wi‑Fi. Need practical LAN deployment model (P0.4).
- 🔒 SEC: `jwt_secret` stored in SQLite `settings` — backup/OS-user leak ⇒ token forgery. Needs safeStorage/keychain design with upgrade/restore story (P0.5).
- 🔒 SEC: Electron `sandbox: false` — justify or migrate (P0.6).
- 🔒 SEC: `terminal_id` is identification, not authentication; knowing the string + JWT role can close a shift.
- ⚠️ RISK: M6 refunds API + minimal Orders refund UI shipped; **refund receipt print still deferred**. Card refunds are record-only (no gateway).
- ⚠️ RISK: Financial audit coverage improved for payments (`payment.received`); still sparse on discounts, PIN overrides, DB import/export, Master PIN ops.
- ⚠️ RISK: Money stored as SQLite `REAL` in places — rounding/tax/partial-payment correctness risk (P0.3 money migration remains documentation only).
- ⚠️ RISK: Order cancel after pay still lacks refund interaction (P1 from P0.2 audit).

## Operational

- ⚠️ RISK: Electron renderer `flo_terminal_id` and host `settings.terminal_id` may differ. POS requests send the client id; header-less `openShift` still uses the host id.
- ⚠️ RISK: Lost `terminal_id` (cleared localStorage) orphans an open shift; managers must force-close.
- ⚠️ RISK: Doc drift — roadmap/feature-list still mark shifts/day-close as NOT BUILT while code has M4–M5 (P0.7).
- ⚠️ RISK: Brand fragmentation (FloCafe / Flo POS / Nexora) confuses pilots and packaging.

## Debt (do not giant-rewrite)

- 🔴 DEBT: Monolithic `main/db.ts`; fat `orders.ts` / `bills.ts`; ad-hoc validation — extract when touching those domains.
- 🔴 DEBT: Incomplete FKs on some order/customer columns; “tenant” façade without row isolation (single-tenant by design).

## Explicitly out of scope (temptation risks)

- Building AI, aggregators, or multi-location **before** pilot KPI — dilutes reliability focus (see `STRATEGY.md` Not working on).
