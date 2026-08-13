# Patterns

- Feature modules: `main/services/<name>.ts` + `main/routes/<name>.ts` + `requireRole()`.
- Opervia module registry (**Phase 2 COMPLETE**): `main/modules/` describes capabilities; `getCompositionSnapshot()` read-only vertical view; soft diagnostics in `diagnostics.ts`; `isModuleEnabled` / `isFeatureAvailable(module, flag)`. Modules declare domain-level `capabilities` (`CapabilityId`) — ownership/discovery only, never authz. Soft deps declare real coupling (incl. product→tax, order→inventory/tax, payment→tax). Nav uses `requiresModule` + flags. Synthetic verticals live in `fixtures/` + `SYNTHETIC_VERTICALS` (never `ACTIVE_VERTICAL_ID`). HTTP composition API reports active production vertical only. Does not replace settings flags or static `registerRoutes`. Frontend re-exports via `frontend/src/lib/modules.ts`. Exit gate: `docs/03-architecture/phase-2-exit-gate.md`.
- **Domain boundary hardening (Phase 2.7–2.14):** Inventory owns **stock writes** via `main/services/inventory.ts` (`decrement`/`restore`/`adjust`/`applyAbsoluteStockChange`) and **history reads** via `listInventoryMovements` + `GET /api/inventory/movements`. Product create/PUT route stock through Inventory inside `withTxn`. Append-only `inventory_movements`; zero-delta skips INSERT. Reads may use `products.stock_quantity`. Tax money-path discount scaling via `scaleItemTax*` (preserve Math.round). Tax HTTP: `main/routes/tax.ts` owns `/api/tax/*`; pack lifecycle stays `tax-packs.ts`; settings tax keys stay Settings. Tax snapshot: consumers depend on `EngineTaxSnapshot` / Tax facade, not `tax-engine` internals. **Product↔Tax (2.13):** Product persists tax config refs only; Tax owns calc/snapshot; historical bill tax immutable on product config change; products must not import tax-engine.
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
