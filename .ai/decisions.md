# Decisions

## 2026-08-13 — P1.2 REC-01 security hardening (Accepted + Implemented)

Final review fixes only (no redesign): (1) factory reset clears `install-state.json` **after** durable empty DB commit; recreate uses `allowCreateDespiteMarker`; failure keeps/restores marker + safety-backup rollback; (2) `recoveryApiProtectionMiddleware` fail-closed → HTTP 503 `RECOVERY_STATE_UNAVAILABLE` (never `next()` on eval failure). Behavioral tests REC01-05/06/07/13/14/15. See `p1.2-rec-01-recovery-audit.md`.

## 2026-08-13 — P1.2 REC-01 fail-closed missing DB (Accepted + Implemented)

Durable `userData/install-state.json` marker. Missing/empty operational DB with marker → `RECOVERY_REQUIRED` (no silent empty café). Setup blocked; money APIs 503; KDS/mDNS skipped; `/recovery` reuses Master PIN IPC restore. Factory reset clears marker after durable empty reset. Backfill only when `users > 0`. Tests: `tests/rec-01-recovery.test.ts`. See `p1.2-rec-01-recovery-audit.md`.

## 2026-08-13 — P1.2 REC-01 recovery discovery (Superseded by implementation)

Discovery was **YELLOW**. Implementation completed same day.

## 2026-08-13 — P1.2 Backup→destroy→restore continuity (Accepted + Implemented)

Continuity E2E landed. Score **76/100 — GREEN WITH CONDITIONS**. Suite `tests/backup-restore-continuity.test.ts` (wired into `npm run test:backup`) proves fixture → backup → destroy → restore for orders/bills/payments/refunds/FIN-01/shifts/day-close/audits + Scenario A/B JWT. Minimal prod fix: corrupt/non-SQLite backup open in `restoreBackup` returns `{ success: false }` without touching live DB. **REC-01** (missing `flo.db` → silent empty DB) documented/tested and **not changed**. No JWT/FIN-01/backup-format redesign. See `docs/15-project-management/p1.2-backup-restore-continuity.md`.

## 2026-08-13 — P1.2 Backup→destroy→restore continuity discovery (Superseded by implementation)

Discovery was **58/100 — YELLOW**. Implementation completed same day; REC-01 remains open for separate approval.

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
