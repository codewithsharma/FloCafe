# Code Quality Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · Scope: `main/` (backend) and `frontend/src/`

> Verdict: **a high-quality _ceiling_ with mixed _adoption_.** The infrastructure is genuinely well-built — typed correlated errors, zod validation middleware, a redaction-configured pino logger, an `asyncHandler`, DI-based migration host, and an in-flight façade-based decomposition of `db.ts`. The weakness is that several of these good abstractions are **bypassed by the majority of the code**. This is _consistency debt_, not _wrong architecture_. Dead code is essentially absent (a real strength).

---

## 1. God-files (Confirmed)

| File                                             | Lines | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/app/(dashboard)/settings/page.tsx` | 6,654 | **True god-component — worst offender.** One `SettingsPage()` with **111 `useState`**, **72 inline `fetch`/api calls** (API logic in the component), 12 hand-rolled `saved*` dirty-tracking pairs, tab-based mega-form. Partial extraction exists (renders `TaxConfigurationPanel`, `PaymentMethodsSettings`, etc.) and it does consume Zustand stores, but the body remains a god-component. A second lurks: `TaxConfigurationPanel.tsx` (1,613 lines).                          |
| `main/db.ts`                                     | 4,120 | **True god-module, being safely dismantled.** 66 `export function` + 8 `export type`, no internal grouping; tangled concerns (lifecycle, maintenance lock, settings, cloud identity, backup/restore, schema versioning, KDS station security, PIN, order/bill sequences). **Mitigation:** `// R4.1 re-exports (extracted modules; public API unchanged)` at `db.ts:4106` — active extraction behind a stable façade, using DI (`setMigrationHost`) to break the migrations cycle. |
| `main/printers/thermal.ts`                       | 2,505 | **Large, moderately cohesive.** Detection, failure classification, ESC/POS byte-building, transports, and **five formatters** (`formatReceipt`, `formatKOT`, `formatRefundReceipt`, `formatDayCloseZ`, `buildTestPage`) plus an embedded ~250-line C# class as a string literal. The formatters (~1,300 lines) are the natural extraction seam.                                                                                                                                   |
| `main/database/migrations.ts`                    | 2,724 | **NOT a god-object — do not flag.** A single append-only `MIGRATIONS[]` of 89 sequential entries; size is inherent to an append-only ledger and splitting it would add risk, not clarity.                                                                                                                                                                                                                                                                                         |

- **Severity:** High (settings page), High-but-mitigated (`db.ts`).
- **Recommendation:** apply the same façade/extraction discipline already used in `db.ts` to `settings/page.tsx` — each tab is already isolable. Extract `thermal.ts` formatters. Leave `migrations.ts`.
- **Confidence:** High.

## 2. Type safety (Confirmed, backend; Excellent, frontend)

- **Backend:** ~567 `any` in `main/`. Breakdown from sampling: **93 `catch (error: any)`** (should be `unknown`), **41 `(req as any).user`** casts, and a majority of `as any` on **SQLite row casts**.
  - **Root cause of the 41 casts:** there is **no Express `Request` augmentation**. The auth middleware sets `(req as any).user = {...}` (`main/server.ts:161`), so every consumer re-casts. A single `declare global { namespace Express { interface Request { user?: AuthUser } } }` erases ~41 casts.
  - **The team knows better:** `main/routes/bills.ts:45–51` defines typed row interfaces (`BillItemAllocationRow`, `PinUserRow`, `OrderItemRow`) and casts to _those_. The good pattern exists but is applied inconsistently.
  - ESLint sets `no-explicit-any: 'warn'` (not error), so these don't fail the build.
- **Frontend:** **excellent** — only 14 `: any`, **0 `as any`** across all of `frontend/src`.
- **Severity:** Medium. **Recommendation:** add the `Request.user` augmentation (highest-leverage, lowest-risk fix in the repo); codemod `catch (error: any)` → `catch (error)`. **Confidence:** High.

## 3. Logging — systemic bypass of pino (Confirmed)

- **Issue:** a proper structured logger exists (`main/lib/logger.ts`: pino, dev-pretty/prod-JSON, **13 redaction paths** including password/pin/token/card_number) — but it is **imported by exactly one file** (`main/middleware/http-observability.ts`). Every other file uses `console.*`.
- **Evidence:** **483 `console.*` calls in `main/`**, of which **261 are in `routes/`** and 19 in `services/` — request/service paths that should be structured and redacted. Even the global error handler logs via `console.error` (`server.ts:373`). `db.ts` 43, `thermal.ts` 39, `routes/printers.ts` 28, `routes/settings.ts` 24.
- **Severity:** Medium (correctness of logs, and — because `console.*` skips the redaction config — a latent risk of logging sensitive fields in plaintext).
- **Why it matters:** the redaction that exists to keep PINs/tokens/card numbers out of logs is bypassed by ~99% of log statements.
- **Recommendation:** codemod `console.*` → `logger.*` in `routes/` and `services/` (~280 calls); lint-ban `console.*` in those directories.
- **Confidence:** High. (This is the single clearest consistency issue in the backend.)

## 4. Error handling — great infra, low adoption (Confirmed)

- **Infra exists:** a global Express error handler (`server.ts:358–378`, correctly distinguishing 4xx vs 5xx and handling `entity.parse.failed`), typed correlated errors (`main/errors.ts` — `FloErrorCode` union + `correlatedError()`/`errorDetails()`), and an `asyncHandler` wrapper explicitly built "to save a try/catch per route."
- **But `asyncHandler` is used in only 1 of 51 route files** (`whatsapp.ts`, 6×). Every other route hand-rolls try/catch: `settings.ts` has **62** blocks, `tax-packs.ts` 44, `reports.ts`/`products.ts` 42 each.
- **Payload-shape drift:** `customers.ts` mostly returns `{ error: 'Internal server error' }` but `:564` returns `{ message: 'Failed to create customer' }` (`error` vs `message` key). The typed correlated-error system is confined to print/tax/backup/cloud, not routes.
- **Severity:** Medium. **Recommendation:** adopt `asyncHandler` + a single error-response shape across routes; route domain errors through `main/errors.ts`. **Confidence:** High.

## 5. Validation — two coexisting styles (Mixed)

- Clean zod middleware exists (`main/middleware/validate.ts`: `validateBody/Params/Query`) backed by **19 schema files**, well-reused (the orders schema is imported by 7 order sub-routes). **26 route files use it; ~24 do not.**
- Some non-users are legitimately trivial (aggregators, re-exports). But large mutating routes hand-roll validation: `tax-packs.ts` uses inline `typeof x !== 'string'` guards + `throw Object.assign(new Error(...), {statusCode})`; `printers.ts` has 15 manual `res.status(400)`; `reports.ts` ~36 query-param checks.
- **Verdict:** not "unvalidated" — **inconsistently validated** (zod vs ad-hoc `typeof`). **Severity:** Low–Medium. **Recommendation:** migrate the large hand-rolled routes to zod schemas. **Confidence:** High.

## 6. Duplication & layering (Confirmed / Potential)

- **Copy-pasted actor helper:** ~10 route files each redefine a near-identical "current user" helper under **three names** — `actorId` (`purchasing.ts`, `coupons.ts`, `tables.ts`, `recipes.ts`, `expenses.ts`), `actorUserId` (`customers.ts`, `audit-logs.ts`, `tax-packs.ts`, `staff.ts`), `actorFrom` (`shifts.ts`). All wrap `(req as any).user?.userId` — directly downstream of the missing Request augmentation. **A single shared helper + the augmentation collapses all ten.**
- **No repository tier:** raw `db.prepare()` appears in **both** routes and services. Complex/newer domains delegate to services (`orders/create.ts` → `services/tax|inventory|recipe-consumption`); CRUD-ish domains embed SQL in the route (`printers.ts` 39 queries, `tax-packs.ts` 33, `addon-groups.ts` 29 with no service, `kitchen-stations.ts` 22 with no service). The split isn't governed by a stated rule — which is why R4.1 only fences `db.ts`/`orders.ts`/Settings.
- **Severity:** Medium (duplication), Low–Medium (layering). **Recommendation:** shared actor helper; consider a light repository convention for CRUD domains. **Confidence:** High.

## 7. Dead / commented code (Excellent — strength)

Essentially none. ~12 comment lines resemble code but are explanatory (e.g. `products.ts:528` documenting a redirect-SSRF guard), not commented-out logic. Only **2 TODO/FIXME markers** in `main/` + `frontend/` combined — consistent with the practice of tracking debt in `docs/qa/` rather than inline. Do not flag; credit it.

## 8. Ratings summary

| Dimension              | Rating     | Basis                                                                                                 |
| ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Type safety (backend)  | Mixed      | ~567 `any` (93 `catch`, 41 `req.user` casts); missing Request augmentation; typed-row exemplars exist |
| Type safety (frontend) | Excellent  | 14 `: any`, 0 `as any`                                                                                |
| Logging                | Poor       | pino imported by 1 file; 483 `console.*` bypass redaction                                             |
| Error handling         | Mixed      | great infra, ~1/51 route adoption; payload-shape drift                                                |
| Validation             | Good/Mixed | strong zod layer; ~half of routes hand-roll `typeof`                                                  |
| Layering & duplication | Mixed      | no repository tier; SQL in routes+services; 10× duplicated actor helper                               |
| Naming & structure     | Good       | files uniform; minor export-style + helper-name drift (see CODING-STYLE-AUDIT)                        |
| Frontend components    | Mixed      | good stores/API client; 6,654-line god-component                                                      |
| Dead/commented code    | Excellent  | ~0 dead code, 2 TODOs                                                                                 |

## 9. Highest-leverage, lowest-risk fixes (evidence-ranked)

1. **Add Express `Request.user` augmentation** → deletes ~41 `as any` and enables collapsing the 10 duplicated actor helpers into one.
2. **Codemod `console.*` → `logger`** in `routes/` + `services/` (~280 calls) to stop bypassing redaction; then lint-ban `console` there.
3. **Codemod `catch (error: any)` → `catch (error)`** (93 occurrences).
4. **Continue the in-flight `db.ts` R4.1 extraction** and apply the same façade approach to `settings/page.tsx`.

These are consistency fixes, not rewrites — the abstractions to adopt already exist in the codebase.
