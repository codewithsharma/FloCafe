# Dependency addition & integration plan (2026-08-13)

## Audit summary

| Package                               | Decision         | Placement                 | Rationale                                                             |
| ------------------------------------- | ---------------- | ------------------------- | --------------------------------------------------------------------- |
| `zod`                                 | **Add**          | root                      | No schema validation; hand-rolled at boundaries                       |
| `pino-pretty`                         | **Add**          | root (dev)                | Pair with shared pino logger for readable dev logs                    |
| `@tanstack/react-query`               | **Add**          | frontend                  | No query cache; axios-only                                            |
| `zustand`                             | **Skip install** | —                         | Already `frontend` `^5.0.14`                                          |
| `date-fns`                            | **Add**          | root + frontend           | Native Date only; avoid moment/dayjs                                  |
| `i18next` / `react-i18next`           | **Add**          | frontend                  | Foundation + small migration; keep existing `t()` for unmigrated keys |
| `vitest`                              | **Add**          | root (+ frontend scripts) | Complements `node:test` / custom runners; does not replace them       |
| `@opentelemetry/api`                  | **Add**          | root                      | Tracing abstraction; noop without collector                           |
| `pino-http`                           | **Add**          | root                      | Request logging on Express with redaction                             |
| `helmet`                              | **Add**          | root                      | Replace hand-rolled headers carefully; preserve CSP                   |
| `express-rate-limit`                  | **Skip**         | —                         | Custom `rateLimit`/`authRateLimit` already LAN-aware                  |
| `compression`                         | **Add**          | root                      | Thresholded `/api` compression; skip WS/static                        |
| `prettier` / `eslint-config-prettier` | **Add**          | root                      | Format without ESLint conflict                                        |
| `husky` / `lint-staged`               | **Add**          | root                      | Lightweight pre-commit only                                           |

## Integration slices (minimum production quality)

1. **Zod** — `main/validation/` + `validateBody` middleware; apply to auth login + setup initialize
2. **Logger** — `main/lib/logger.ts` (pino + pretty in non-production) + `pino-http` on Express
3. **Helmet / compression** — Express bootstrap; keep Electron/static/WS safe
4. **OTel** — `main/lib/tracing.ts` spans for POS/Order/Payment/Inventory/Tax/Auth boundaries
5. **React Query** — `QueryClientProvider` + one representative query (platform composition)
6. **Zustand** — document server vs client state rule only (already used)
7. **date-fns** — `main/lib/dates.ts` + frontend format helper for reporting periods
8. **i18next** — `locales/{lang}/{ns}.json`; migrate Settings language labels
9. **Vitest** — config + tests for zod schemas, dates, helmet headers, logger redaction
10. **Tooling** — prettier, eslint-config-prettier, husky, lint-staged

## Explicit non-goals

- No microservices / Redis / Nest / Prisma
- No wholesale rewrite of axios calls, i18n catalogs, or rate limiter
- No full-suite pre-commit hooks

---

## Status — Phase 2 architecture hardening (post dependency integration)

Dependency package install + bootstrap integration is **COMPLETE**. This section tracks remaining Phase 2 hardening that reuses those packages without starting Phase 3.

### Completed (2026-08-13 hardening pass)

| Workstream                          | Done                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zod boundaries**                  | Auth (prior) + Order create/add-items + Payment single/batch (shape + method; amount positivity stays in tender for message parity) + Refund body (shape only; `REFUND_*` codes stay in service) + Inventory stock adjust. Schemas in `main/validation/{auth,orders,payments,refunds,inventory}.ts`; wired via `validateBody`. Unit tests under `tests/unit/*-validation.test.ts`. |
| **i18next migration (incremental)** | Seed namespaces reused. Migrated overlapping keys on Settings (`saveFailed`, `common.save/cancel/loading`), POS checkout modals (`pos.checkout`), Orders filter (`orders.completed`), Products header (`products.title`). Dual catalog retained.                                                                                                                                   |
| **OTel domain spans**               | Wired: `auth.login`, `auth.recover_password`, `order.create`, `order.cancel_item`, `payment.apply_batch`, `inventory.decrement`, `inventory.adjust`, `tax.calculate`. Added `withSpanSync` for sync SQLite paths. Still no exporter/collector (noop).                                                                                                                              |
| **Architecture boundary fixes**     | Removed redundant post-Zod empty credential check on login. Documented remaining dual-catalog and deferred items below.                                                                                                                                                                                                                                                            |

### Remaining Phase 2 hardening (optional / incremental — not Phase 3)

- Continue i18next call-site migration for remaining POS/Orders/Products/Settings strings (legacy flat catalog still owns most UI).
- Expand Zod to discounts, bill generate/split, held-orders, product CRUD, password-change (when touching those routes).
- Optional: extract `calculateTaxPreview(req,res)` HTTP adapter out of `main/services/tax.ts` into `main/routes/tax.ts` (layering cleanup; behavior unchanged).

### Intentionally deferred to Phase 3

- Package extraction / fail-closed route remount
- Production Retail+ vertical
- OTel SDK + exporter/collector
- Full RQ adoption for all server reads / session flags
- Shared date package across main/frontend process boundary
- Order facade extraction of create/addItems from routes
- Void×cancel restock semantic fix
- Inventory stock ledger UI
- Legacy product `tax_type`/`tax_rate` cleanup
- `db.ts` split

### Architectural decisions (hardening)

1. **Zod at HTTP shape only** — FIN-01, stock availability, PIN, refundable balance, note max length from settings stay in services/handlers.
2. **`.passthrough()` on money/order bodies** — preserve unknown client fields for idempotency hashing / future keys.
3. **Dual i18n catalogs during migration** — i18next namespaces + legacy `lib/i18n/{en,es,pt}.json`; do not delete legacy keys until a surface is fully migrated.
4. **OTel API-only** — domain spans for entry points; `withSpan` (async) + `withSpanSync` (txn/service); no collector required.
5. **State ownership unchanged** — server→Query, client→Zustand, domain→SQLite (`frontend/src/lib/state-ownership.ts`).

### Phase 2 close readiness

Modular Phase 2 (2.1–2.18 + final exit gate) was already **COMPLETE**. Dependency integration + this hardening pass finish the justified package adoption and high-value boundary expansion. Remaining items above are incremental polish or Phase 3 — they do **not** block closing Phase 2 architecture work.
