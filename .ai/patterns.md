# Patterns

- Feature modules: `main/services/<name>.ts` + `main/routes/<name>.ts` + `requireRole()`.
- **Boundary validation:** Zod schemas in `main/validation/` + `validateBody` middleware for untrusted HTTP input (auth, order create/add-items, payment single/batch, refund body, stock adjust). Domain rules stay in services.
- **Observability:** `main/lib/logger.ts` (pino + pretty in dev) + `pino-http` / helmet / compression via `main/middleware/http-observability.ts`; OTel API spans via `withSpan` / `withSpanSync` in `main/lib/tracing.ts` (noop without collector) on auth/order/payment/inventory/tax entry points.
- **Frontend state:** TanStack Query = server/API; Zustand = client/UI; SQLite = persistent domain (`frontend/src/lib/state-ownership.ts`).
- **i18n:** i18next namespaces under `frontend/src/locales/{lang}/` for migrated keys; legacy flat catalogs remain for unmigrated UI (documented dual-catalog period). Pattern: keep `useI18n()` and add `useTranslation('ns')`; swap only keys that exist in both catalogs (`tSettings('saveFailed')` not `t('settings.saveFailed')`). Do not wholesale-rewrite screens.
- Opervia module registry (**Phase 2 CLOSED**; **Phase 3.1 remount**): `main/modules/` describes capabilities; composition snapshot + GET API; soft diagnostics; `isModuleEnabled` / `isFeatureAvailable`. **Fail-closed:** disabled modules do not mount HTTP; `assertFailClosedComposition` before mounts; soft-gates remain for side effects. POS is an orchestrator (`checkout-coordinator`). Synthetic `retail-test` never active in production. Closeout: `phase-2-closeout-and-phase-3-gate.md`; remount: `phase-3.1-fail-closed-remount.md`.
- **Domain boundary hardening (Phase 2.7–2.17):** Inventory owns **stock writes** via `main/services/inventory.ts` (`decrement`/`restore`/`adjust`/`applyAbsoluteStockChange`) and **history reads** via `listInventoryMovements` + `GET /api/inventory/movements`. Product create/PUT route stock through Inventory inside `withTxn`. Append-only `inventory_movements`; zero-delta skips INSERT. Reads may use `products.stock_quantity`. Tax money-path discount scaling via `scaleItemTax*` (preserve Math.round). Tax HTTP: `main/routes/tax.ts` owns `/api/tax/*`; pack lifecycle stays `tax-packs.ts`; settings tax keys stay Settings. Tax snapshot: consumers depend on `EngineTaxSnapshot` / Tax facade, not `tax-engine` internals. **Product↔Tax (2.13):** Product persists tax config refs only; Tax owns calc/snapshot; historical bill tax immutable on product config change; products must not import tax-engine. **Order (2.14):** ownership facade + cancel/restore on `orderRoutes`. **Payment (2.15):** `payment-tender.ts` owns prepare/apply; soft-gate tables/kds side effects with `isModuleEnabled`; money/FIN-01 unchanged. **POS orchestration (2.16):** frontend `checkout-coordinator` owns HTTP sequence only; `POS_DOES_NOT_OWN` tax/inventory/tender; gates addons + kds/kot; page keeps retry/discount UX debt. **Restaurant isolation (2.17):** Order soft-gates table occupy/free + KDS notify; shared catalog must not depend on restaurant modules; fail-closed remount deferred.
- **Shared module principle:** implement a capability once in the catalog; verticals compose via `enabledModules`. Prefer `isModuleEnabled` over `business_type === 'restaurant'` for reusable capability checks; keep genuine restaurant-only UX vertical-specific.
- **Module vs feature vs permission:** module enablement ≠ feature flag ≠ user authorization (`requireRole`). Never collapse these layers.
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
