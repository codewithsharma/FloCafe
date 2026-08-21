# Frontend Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5
**Scope:** `frontend/` — Next.js 16 / React 19 static export, Zustand, TanStack Query, Tailwind, shadcn/ui, i18next. Served by the Electron main process over `http://localhost` (never `file://`).

> Verdict: **competent, modern, and consistent at the component/design-system level, but weak at the state-and-data-fetching architecture level and thinly tested.** The stack choices are current and idiomatic; the design system (shadcn/ui + Tailwind) is applied uniformly; the API client is centralized and correct. The problems are concentrated in **(a) a small number of god-components** (settings 6.6k lines, tax panel 1.6k), **(b) inconsistent data-fetching** (a clean axios+TanStack pattern coexisting with ~72 inline `fetch` calls in the settings page and a hand-rolled second WebSocket on the orders page), and **(c) no component/unit tests** — CI runs frontend lint, type-build, and a small Playwright E2E suite, but the renderer has no focused unit coverage, and the repo-root lint/type gates exclude `frontend/` (it carries its own) (see PROJECT-STRUCTURE-AUDIT §7.1, TESTING-AUDIT §4).

---

## 1. Stack & conventions (verified)

| Concern      | Choice                                                        | Assessment                                                                |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Framework    | Next.js 16 App Router, **static export** (`output: 'export'`) | Correct for an Electron-embedded renderer; no SSR runtime needed          |
| UI runtime   | React 19                                                      | Current                                                                   |
| Styling      | Tailwind + shadcn/ui (Radix primitives)                       | Idiomatic, uniformly applied; PascalCase component files, zero exceptions |
| Client state | Zustand (4 stores: cart, auth, and 2 others)                  | Lightweight, appropriate                                                  |
| Server state | TanStack Query                                                | Present and correct **where used** — but not used by the worst pages      |
| HTTP         | single axios instance (`src/lib/api.ts`)                      | **Strength** — see §3                                                     |
| i18n         | i18next                                                       | Consistent                                                                |
| Real-time    | native `WebSocket` via `useKdsConnection` hook                | Good reference pattern — but bypassed by orders page (§4)                 |

**Design-system consistency: High.** Component-file naming (PascalCase `.tsx`) is uniform; lib/hook files are cleanly separated. Formatting is Prettier-enforced.

## 2. Findings

### 2.1 `settings/page.tsx` — 6,654-line god-component (Medium; top maintainability item)

- **Location:** `frontend/src/app/(dashboard)/settings/page.tsx`.
- **Evidence:** ~6,654 lines in one client component; **111 `useState`**, ~72 inline `fetch(...)` calls (bypassing the axios client), **12 `saved*`/dirty-flag state pairs** hand-managing per-section dirty tracking, 18 `<TabsContent>` panels, 0 memoization.
- **Why it matters:** this is the single largest maintainability liability in the frontend and is explicitly named in the R4.1 architecture-governance rule (no feature may grow the Settings page without extracting the domain boundary first). It concentrates change-risk, makes review hard, and duplicates data-fetching logic the axios client already centralizes.
- **Mitigation already present:** Radix Tabs mount lazily (no `forceMount`), so only the active tab's subtree is live — this caps the _runtime_ render cost (see PERFORMANCE-AUDIT §3.8). The issue is maintainability, not primarily performance.
- **Recommendation:** extract each `<TabsContent>` into its own `memo`'d component with its own hook; migrate its inline `fetch` calls to the axios client + TanStack Query; replace the 12 dirty-flag pairs with a small form-state abstraction (or `react-hook-form`). This directly satisfies R4.1's "extract the domain boundary first."
- **Refactoring effort:** High. **Confidence:** High.

### 2.2 `TaxConfigurationPanel.tsx` — 1,613-line component (Medium)

- **Location:** `frontend/src/components/settings/TaxConfigurationPanel.tsx` (~1,613 lines).
- **Why it matters:** second-largest component; same class of problem as 2.1 at smaller scale. Tax config is high-stakes UI (drives the money path) and deserves decomposition + focused tests.
- **Recommendation:** split into sub-panels (rates, packs, preview); add component tests once a frontend test runner exists. **Confidence:** High.

### 2.3 Orders page hand-rolls a second KDS WebSocket + polling instead of reusing `useKdsConnection` (Medium)

- **Location:** `frontend/src/app/(dashboard)/orders/page.tsx` opens its own `/kds` socket, adds a 10 s `setInterval(fetchOrders)` poll and a 30 s clock tick; the canonical pattern lives in `frontend/src/hooks/useKdsConnection.ts`.
- **Why it matters:** duplicates connection/auth/reconnect logic that already exists in a tested-by-use hook, and triggers full refetches on every kitchen broadcast (see PERFORMANCE-AUDIT §3.6). Two sockets to the same `/kds` endpoint from one client is wasteful and divergent.
- **Recommendation:** reuse `useKdsConnection`; apply WS payloads to local state (the server already sends `orders`) instead of refetching; relax or WS-gate the poll.
- **Refactoring effort:** Medium. **Confidence:** High.

### 2.4 Inconsistent data-fetching: centralized axios client vs. inline `fetch` (Medium)

- **Location:** clean path in `frontend/src/lib/api.ts:13,22-31,34-55` (single axios instance, `baseURL = window.location.origin + '/api'`, Bearer from `localStorage.token`, 401 → clear + redirect); against it, ~72 inline `fetch` calls in `settings/page.tsx` and scattered elsewhere.
- **Why it matters:** inline `fetch` calls re-implement base URL, auth header, and error handling ad hoc, so the 401-redirect and auth behavior isn't uniform; the axios interceptor is the intended single choke point.
- **Recommendation:** route all calls through the axios client; lint-ban raw `fetch` in the renderer (once frontend linting is wired — §2.6).
- **Confidence:** High.

### 2.5 Missing render memoization on hot interactive components (Medium — performance)

- **Location:** `OrderCard` (583 lines, unmemoized) and `filteredOrders` (no `useMemo`) in `orders/page.tsx`; `ProductGrid.tsx` (whole-cart subscription + per-render `filter` + O(products×cart) in-cart quantity). Full detail in PERFORMANCE-AUDIT §3.6–§3.7.
- **Why it matters:** POS tap latency and the orders board are the most latency-sensitive interactions; these are the highest-value render optimizations.
- **Recommendation:** `memo` the cards, `useMemo` derived lists, select narrow store slices, precompute a `Map<productId, qty>`.
- **Confidence:** Strongly-inferred.

### 2.6 Frontend has no component/unit tests; only end-to-end coverage, and governance is split from the root (Medium-High — process, not code)

- **Location:** root `tsconfig.json` includes only `main/**`; root `eslint.config.mjs` lints only `main/**` and **ignores `frontend/`**; the frontend carries its **own** `eslint`/`tsconfig`/`vitest` config. `.c8rc.json` (root coverage) covers 4 backend files.
- **Evidence (corrected against CI):** CI **does** exercise the frontend — `linux-baseline` runs frontend `npm run lint` and `npm run build:frontend`, and a dedicated `e2e-playwright` job runs Playwright against a full build (`.github/workflows/ci.yml:105-114,135-173`). What is **absent**: the frontend ships a Vitest+jsdom runner (`frontend/package.json`) but has **no meaningful component/hook/store unit tests**, and `frontend`'s `test:unit` is **not** invoked by CI (CI runs Playwright E2E, not frontend Vitest). So the only automated frontend regression protection is a small E2E suite; the high-stakes tax-config and settings UIs have no focused unit coverage. See TESTING-AUDIT §4.
- **Why it matters:** the money-adjacent UI (tax config, settings, cart) can regress without a failing test, since E2E covers only a few happy-path flows. This is the biggest frontend _risk_, distinct from the code-quality items above. The split root/frontend governance is a secondary point — the frontend is linted and type-built in CI, just not through the repo-root gates.
- **Recommendation:** add a component/unit test runner path in CI (the Vitest+jsdom deps are already present) starting with cart store, auth-guard, `TaxConfigurationPanel`, and the API client; keep the existing Playwright E2E; optionally unify the root and frontend lint/type gates for a single `validate` entry point.
- **Confidence:** High.

### 2.7 JWT in `localStorage` (Medium — cross-referenced, security)

- **Location:** `frontend/src/lib/api.ts:24` reads the token from `localStorage`; combined with the CSP `'unsafe-inline'` weakness this is SECURITY-AUDIT Finding 2.2. Listed here for frontend visibility; owned by the security doc.
- **Recommendation:** hold the token in memory or an httpOnly cookie; tighten CSP. **Confidence:** High.

## 3. Strengths (credit)

- **Centralized API client** (`src/lib/api.ts`): one axios instance, correct dynamic base URL for the localhost-embedded renderer, uniform Bearer injection, and a 401 interceptor that clears the token and redirects — exactly the right shape (undercut only by the inline-`fetch` drift in 2.4).
- **`useKdsConnection` hook**: a clean, reusable WebSocket abstraction with auth and reconnect — the correct pattern (undercut only by the orders page not using it, 2.3).
- **Design-system discipline**: shadcn/ui + Tailwind applied uniformly; consistent component-file conventions; no styling drift found.
- **Correct static-export model**: no SSR assumptions leak into an environment that has no Node server for the renderer; assets are bundled and navigation is allowlisted by the main process (see SECURITY-AUDIT).
- **Appropriate state split**: Zustand for client/UI state, TanStack Query for server state — a sound division, applied correctly on the pages that use it.

## 4. Verdict

**Frontend: modern and consistent in the small, under-architected in the large, and thinly tested.** The component library, styling, and API-client foundations are good; the debt is concentrated in a few god-components (2.1/2.2), data-fetching and real-time inconsistency (2.3/2.4), missing memoization on hot paths (2.5), and — most importantly — the absence of component/unit tests for the renderer (2.6; only a small Playwright E2E suite guards it). The highest-value moves are adding focused component/unit coverage for the money-adjacent UI (2.6) and decomposing the settings page (2.1) — the latter also discharges an R4.1 governance obligation. Note that frontend lint, type-build, and E2E **do** run in CI today.
