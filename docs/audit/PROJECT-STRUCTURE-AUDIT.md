# Project Structure Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5

Repository-wide structure map. ~1,470 tracked files. Two source trees (`main/` TypeScript backend, `frontend/` Next.js renderer) plus tests, docs, and build tooling. This document rates each major directory on **purpose / quality / structural concerns / coupling**.

---

## 1. Top-level layout

```
FloCafe/
├── main/                # Electron main process + Express API + SQLite + services   (backend)
├── frontend/            # Next.js 16 / React 19 static-export renderer
├── tests/               # ~234 test files across 3 runners + Playwright E2E
├── docs/                # Extensive product/eng/security/QA documentation
├── scripts/             # Build, release, audit, and dev-recovery scripts
├── resources/ / build/  # Icons, entitlements, packaging assets
├── patches/             # patch-package patches
├── package.json         # v3.0.5, ~200 test:* scripts, electron-builder config
├── tsconfig.json        # strict; includes only main/**
├── eslint.config.mjs    # lints only main/**/*.ts
├── vitest.config.mts    # scoped to tests/unit/**
├── .c8rc.json           # coverage scoped to 4 files
├── AGENTS.md / CLAUDE.md # agent/contributor guide (authoritative conventions)
└── .github/workflows/   # Linux-only CI + release
```

**Root hygiene:** good. Config files are conventional and single-purpose; no stray build output or secrets are tracked (verified against `.gitignore` and `git ls-files`). The local `flo.db` at root is **gitignored** and contains only demo data — it is not part of the repository.

## 2. `main/` — backend (the bulk of the engineering)

| Subdirectory            | Purpose                                                                                                                            | Quality                          | Concerns / coupling                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `main/` (root files)    | Entry (`index.ts`), the three servers (`server.ts`, `kds-server.ts`, `server-app.ts`), `ipc.ts`, `preload.ts`, `db.ts`             | High, but uneven file sizes      | `db.ts` is 4,120 lines (§god-files); the three servers duplicate bootstrap logic                                                 |
| `main/routes/` (~50)    | HTTP handlers, RBAC, validation, txn orchestration                                                                                 | High; consistent shape           | Order **write logic lives here** (`routes/orders/*`, `bills.ts`) rather than in services — highest-value logic in the HTTP layer |
| `main/services/` (~49)  | Domain engines: tax, refund, shift, day-close, inventory, recipe, kds, cloud-sync, whatsapp, google-drive, print-queue, purchasing | High; correct unit of reuse      | `cloud-sync.ts` (1,815 lines) and `whatsapp.ts` are large but cohesive                                                           |
| `main/database/`        | `migrations.ts` (v1→v86), schema helpers                                                                                           | High; disciplined forward-only   | `migrations.ts` 2,724 lines; historical closures must stay frozen (correctly enforced via `MigrationHost` injection)             |
| `main/validation/` (19) | One zod module per domain                                                                                                          | High; clean boundary             | Low coupling — a model to emulate elsewhere                                                                                      |
| `main/modules/`         | Vertical/module composition (registry, composition, route-mounting, verticals)                                                     | **Highest quality in the repo**  | The intentional coupling point; well-tested                                                                                      |
| `main/security/`        | Window hardening, URL allowlist, IPC auth, restore-path hardening                                                                  | High                             | Only wired into `server.ts`; KDS/ServerApp bypass some of it                                                                     |
| `main/middleware/`      | `security.ts` (helmet/CORS/rate-limit/requireRole), `http-observability.ts`                                                        | High                             | Applied only on the main server (see ARCHITECTURE §7.3)                                                                          |
| `main/printers/`        | `thermal.ts` (2,505 lines), `profiles.ts`                                                                                          | Functional; large                | ESC/POS + 4 transports + embedded C#/PowerShell helper in one file; `child_process` surface (see SECURITY-AUDIT)                 |
| `main/lib/`             | Pure helpers: `money.ts`, `logger.ts`, `tracing.ts`, `phone.ts`, `dates.ts`                                                        | High; leaf-level                 | Correctly dependency-free                                                                                                        |
| `main/tax/` (`packs/`)  | Signed CountryPacks + verification                                                                                                 | High; cryptographically verified | `LEGACY_TRUSTED_PACK_DIGESTS` are permanent trust anchors (see SECURITY-AUDIT)                                                   |

**Assessment:** `main/` is well-organized by responsibility. The directory taxonomy (routes / services / validation / modules / lib / security / middleware) is textbook and consistently followed. The debt is **file-size concentration**, not structural disorder.

## 3. `frontend/` — renderer

```
frontend/src/
├── app/                 # Next.js App Router; (dashboard) route group
│   └── (dashboard)/
│       ├── settings/page.tsx   # 6,654 lines — the single largest file in the repo
│       ├── orders/page.tsx     # hand-rolls a 2nd KDS socket + polling
│       └── … (pos, kitchen, tables, reports, inventory, …)
├── components/          # Shared UI (shadcn/ui-based) + feature components
├── hooks/               # useKdsConnection, data hooks (TanStack Query)
├── lib/                 # api.ts (axios), utils
├── stores/              # 4 Zustand stores
└── i18n/                # i18next resources
```

| Area                                           | Quality     | Concerns                                                                                                               |
| ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Routing / route-group                          | Good        | —                                                                                                                      |
| `settings/page.tsx`                            | Poor (size) | 6,654 lines, ~111 `useState`, 18 inline tabs — top refactor target                                                     |
| State split (Zustand client / TanStack server) | Good        | Correct separation of client vs server state                                                                           |
| `lib/api.ts`                                   | Good        | Single axios instance, Bearer from `localStorage`, 401→redirect                                                        |
| Realtime                                       | Mixed       | `useKdsConnection` exists but `orders/page.tsx` duplicates a socket + polling                                          |
| Lint/type coverage                             | **Weak**    | Frontend has its own ESLint but is **excluded from the root tsconfig and root lint**; not in the 4-file coverage scope |

**Assessment:** the frontend is competent and conventionally structured, but it is the **less-governed half** of the codebase: excluded from the root TypeScript project, excluded from root lint, not measured for coverage, and home to the largest file. See FRONTEND-AUDIT.md and CODE-QUALITY-AUDIT.md.

## 4. `tests/`

```
tests/  (~234 files)
├── unit/            # the ONLY dir vitest runs
├── integration/     # Electron-as-Node via run-electron-node-test.cjs
├── release/         # release gates (m1-gate, signing checks)
├── fixtures/        # incl. upgrade-snapshots/*.db (intentionally tracked)
└── run-test.sh      # the giant serial chain behind `npm test`
```

- **Purpose:** broad backend/integration/release coverage. ~200 `test:*` scripts.
- **Quality:** the _breadth_ is impressive (module isolation, tax invariants, upgrade paths, URL allowlist, product images). The _governance_ is weak: three runners, a serial bash chain, `tests/` excluded from lint and type-checking, and c8 coverage scoped to only 4 files so the real number is unknown.
- **Coupling concern:** the single serial `run-test.sh` chain is a maintainability and CI-time liability (one failure blocks the rest; no parallelism). See TESTING-AUDIT.md.

## 5. `docs/`

Extensive and well-structured: `00-product/` (capability matrix, blueprint, roadmap), `07-security/`, `qa/`, `audits/` (prior internal passes), plus setup guides. This is a **documentation-rich** project — a genuine strength — though some drift exists (multiple prior audits, and the branding inconsistency noted below). This `docs/audit/` tree is additive and does not modify existing docs.

## 6. `scripts/`, `build/`, `resources/`, `patches/`

- `scripts/` — build/release/audit/dev-recovery helpers; reasonable.
- `build/` + `resources/` — packaging assets (icons, entitlements). Apple signing assets are **gitignored** (`.p8/.p12/.pem/.key/.cer/.provisionprofile`) — a good security-hygiene signal.
- `patches/` — patch-package; acceptable, but each patch is a maintenance liability to track against upstream.

## 7. Cross-cutting structural findings

### 7.1 Governance boundary is asymmetric between the two source trees

- **Issue:** `main/` is strictly governed (strict TS, lint, module contracts, architecture rule R4.1). `frontend/` and `tests/` are excluded from the **root** tsconfig, root ESLint, and coverage scope.
- **Severity:** Medium.
- **Evidence:** `tsconfig.json` includes only `main/**`; `eslint.config.mjs` ignores `frontend/` and `tests/`; `.c8rc.json` includes 4 files.
- **Why it matters:** half the shipped code (the UI the user touches) has weaker automated guarantees than the backend.
- **Recommendation:** ensure frontend type-check and lint run in CI as first-class gates (frontend lint/build _is_ in CI, but type-errors and coverage are not gated the same way). Track true repo-wide coverage even if not gated.
- **Confidence:** High.

### 7.2 Product-name inconsistency across the tree

- **Issue:** the product is referred to as **OPERAVIA/Operavia** (brand), **FloCafe/flocafe** (repo, telemetry app id), **flo-desktop** (package), **Flo** (mDNS name, log prefixes), **flopos.com** (cloud/telemetry domains), and a legacy misspelling **"Opervia"** (Google Drive folder fallback, `google-drive.ts`).
- **Severity:** Low (Informational for internal names; **Medium** where customer-visible).
- **Evidence:** telemetry app id `flocafe` (`services/telemetry.ts`); Windows print doc name and Drive folder "Operavia"/"Opervia" (`printers/thermal.ts`, `services/google-drive.ts`); mDNS "Flo" (`index.ts`). `.env.example` explicitly documents keeping `flo-desktop`/`flocafe` internal names for upgrade continuity.
- **Why it matters:** customer-visible surfaces (printed receipts, backup folder names) leak inconsistent/misspelled branding; internal inconsistency raises onboarding friction.
- **Recommendation:** keep internal identifiers stable (as documented), but normalize **customer-visible** strings to "Operavia" and fix the "Opervia" typo.
- **Confidence:** High.

### 7.3 File-size hotspots (structural, cross-referenced)

Largest files: `settings/page.tsx` (6,654), `db.ts` (4,120), `migrations.ts` (2,724), `thermal.ts` (2,505), `cloud-sync.ts` (1,815). All are cohesive but exceed comfortable review/merge size. Governed by R4.1 for the backend hotspots; the Settings page is the top actionable split. See TECHNICAL-DEBT.md and REFACTORING-ROADMAP.md.

## 8. Structure verdict

**Well-structured.** The directory taxonomy is disciplined and the backend is a model of responsibility-based organization. The two real structural issues are (a) the governance asymmetry between `main/` and `frontend/`+`tests/`, and (b) concentrated file-size hotspots. Neither is disorder — both are addressable without re-architecture.
