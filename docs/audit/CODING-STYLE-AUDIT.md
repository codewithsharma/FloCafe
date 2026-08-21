# Coding Style Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5

> This document describes the conventions the codebase **actually follows**, and rates how _consistently_ each is applied. It deliberately avoids imposing external style preferences — the standard being measured is the project's own, as expressed by its tooling (Prettier, ESLint) and its dominant patterns. Where two internal styles coexist, that is noted as drift, not as one being "wrong."

---

## 1. Enforced baseline (tooling)

- **Prettier** formats both trees; `lint-staged` runs `prettier --check` on `main/**` and `frontend/**`, and ESLint on `main/**`. Formatting (indentation, quotes, semicolons, line width) is therefore **uniform and not worth itemizing** — it is machine-enforced.
- **ESLint** (`eslint.config.mjs`) covers only `main/**/*.ts`; it **ignores `frontend/`, `tests/`, `dist/`, `release/`**. Rules of note: `@typescript-eslint/no-explicit-any: 'warn'`, `no-unused-vars: 'warn'` (with `^_` ignore), `no-require-imports: 'off'`. The frontend has its own ESLint config.
- **TypeScript** is `strict: true`, but the root `tsconfig.json` **includes only `main/**`** — the frontend is a separate TS project.

**Consistency of the baseline: High** — but note the asymmetry: the backend is lint- and type-governed; the frontend and tests are outside the root lint/type project (see PROJECT-STRUCTURE-AUDIT §7.1).

## 2. Discovered conventions and their consistency

| Convention                   | Dominant form                                        | Consistency                                             | Notes                                                                                                    |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Backend file naming**      | kebab-case / lowercase `.ts`                         | **Uniform**                                             | Zero camelCase files in `main/**`                                                                        |
| **Frontend component files** | PascalCase `.tsx`                                    | **Uniform**                                             | Clean separation from lib/hook files                                                                     |
| **Module system**            | CommonJS (backend), ESM (frontend)                   | Uniform                                                 | Baileys ESM bridged via `baileys-loader.cjs` (documented necessity)                                      |
| **Validation**               | zod schemas in `main/validation/`                    | **Mixed**                                               | 26 routes use the zod middleware; ~24 hand-roll `typeof` guards                                          |
| **Error handling**           | try/catch per handler                                | Consistent _within_ files, **drifting across**          | `asyncHandler` exists but used in 1/51 route files; error key is usually `error` but sometimes `message` |
| **Logging**                  | `console.*`                                          | **Uniform in practice, but bypasses the intended tool** | pino logger exists, imported by 1 file; 483 `console.*` in `main/`                                       |
| **Money**                    | integer cents + `decimal.js`, dual-column (`_cents`) | **Uniform and disciplined**                             | Consistent across order/bill/payment/refund/tax                                                          |
| **Transactions**             | `withTxn()` wrapper                                  | **Uniform** on multi-write paths                        | A genuine style strength                                                                                 |
| **Idempotency**              | `Idempotency-Key` header + `*_idempotency` tables    | **Uniform** across order/payment/refund/purchase        |                                                                                                          |
| **Row typing**               | typed row interfaces _or_ `as any`                   | **Mixed**                                               | `bills.ts` exemplifies typed rows; many files cast `as any`                                              |
| **Route registration**       | `export const router` vs `registerXRoutes(app)`      | **Two coexisting styles**                               | 32 `export const` vs 25 `export function` — both work, neither dominates                                 |
| **"Current actor" helper**   | inline per-file helper                               | **Drift (3 names)**                                     | `actorId` / `actorUserId` / `actorFrom` for the same thing                                               |

## 3. Confirmed style-consistency issues

These are consistency findings (project-internal drift), not preference nitpicks.

### 3.1 The intended logger is bypassed almost everywhere

- **Convention intended:** structured, redacted pino logging (`main/lib/logger.ts`, 13 redaction paths).
- **Convention practiced:** `console.*` (483 calls in `main/`, 261 in routes).
- **Consistency:** the practiced style is internally uniform but defeats the tool the project built for the purpose. **Severity:** Medium. Detailed in CODE-QUALITY-AUDIT §3.

### 3.2 "Current actor" helper has three names for one concept

- `actorId` (5 files), `actorUserId` (4 files), `actorFrom` (1 file) — all wrap `(req as any).user?.userId`.
- **Consistency:** Low for this helper. **Severity:** Low. Downstream of the missing Express `Request` augmentation; one shared helper fixes both. See CODE-QUALITY-AUDIT §6.

### 3.3 Two validation styles

- zod middleware vs inline `typeof` guards + `throw Object.assign(new Error(), {statusCode})`. **Consistency:** Mixed. **Severity:** Low–Medium. Both validate; the drift is stylistic + maintainability.

### 3.4 Two route-registration styles

- `export const router = Router()` vs `registerXRoutes(app)`. **Consistency:** split ~32/25. **Severity:** Informational (preference) — both are legitimate; flagged only as observed non-uniformity, not a defect.

### 3.5 Error-response key drift

- Usually `{ error: '...' }`, occasionally `{ message: '...' }` (e.g. `customers.ts:564`). **Severity:** Low. A single response shape would tidy the client contract.

## 4. Strong, consistently-applied conventions (credit)

- **kebab-case backend / PascalCase components** — uniform, zero exceptions found.
- **Integer-cents money + `withTxn()` + idempotency keys** — applied with unusual discipline across every money path; this is the codebase's best stylistic habit.
- **One zod schema module per domain** in `main/validation/` — a clean, reused convention where adopted.
- **Debt tracked in `docs/qa/` rather than inline TODOs** — only 2 TODO markers repo-wide; deliberate and consistent.
- **Ownership-marker comments** on the governed hotspots (`db.ts` R4.1 re-export banner) — a real, followed convention that supports the architecture rule.

## 5. Verdict

**Style consistency: Good, machine-enforced at the formatting level; Mixed at the pattern level.** The drift is concentrated in a small number of concepts (logging tool, actor helper, validation style, route-registration style, error key) and every one has a clear "correct" internal exemplar already present in the codebase. None require inventing new conventions — only converging on the ones the project already established. The frontend/tests being outside the root lint/type project is the one structural gap worth closing.
