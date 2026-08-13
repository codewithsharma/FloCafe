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
