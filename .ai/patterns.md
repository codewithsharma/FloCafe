# Patterns

- Feature modules: `main/services/<name>.ts` + `main/routes/<name>.ts` + `requireRole()`.
- Opervia module registry (Phase 2.1–2.3): `main/modules/` describes capabilities; `getCompositionSnapshot()` read-only vertical view; soft diagnostics in `diagnostics.ts`; `isModuleEnabled` / `isFeatureAvailable(module, flag)`. Nav uses `requiresModule` + flags. Does not replace settings flags or static `registerRoutes`. Frontend re-exports via `frontend/src/lib/modules.ts`.
- Mutations that need audit: `withTxn(() => { write; logAuditEvent(); })`.
- Typed `*ServiceError` with `statusCode`; routes map to `{ error }` without SQL/stack leakage.
- Feature flags live in `settings` (`'true'` / `'false'` strings).
- POS client identity: origin-scoped `localStorage` UUID (`flo_terminal_id`) sent as `X-Flo-Terminal-Id` on selected POS routes only. Not an auth credential.
- LAN exposure: `settings.network_mode` = `localhost` | `kds_lan` | `lan` (default `localhost`). Bind hosts derived via `main/services/network-mode.ts`. Restart required.

## Mandate patterns (2026-08-12)

- **Local-first / offline billing:** cloud and optional services must never block order create, pay, or kitchen fulfillment.
- Money-critical workflows (payments, refunds, shifts, day close): require authz + audit + idempotency + reconciliation tests before “production ready.”
- Refunds: `RefundServiceError` + `{ error, code }`; idempotency mirrors payments; PIN always via `verifyPin` + rate limit; cash gate via `assertOpenShiftForCashPayment`.
- **Complete ≠ Pilot validated:** Implemented → Functional → Tested → Production ready → Pilot validated — do not interchange.
- **Refactor-on-touch:** when changing billing/payments for refunds, improve that slice’s boundaries/validation; do not rewrite the monolith.
- **Status vocabulary in docs:** COMPLETE / PARTIAL / PLACEHOLDER / PLANNED / NOT FOUND — code is source of truth.
