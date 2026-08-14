# CTO Audit — Opervia / FloCafe POS

**Date:** 2026-08-14  
**Role:** Chief Technology Officer  
**Codebase:** `/Users/devrajsharma/Projects/FloCafe` (package `flo-desktop` 3.0.5, productName `Opervia`)  
**Schema:** SQLite `PRAGMA user_version` **v75** (`main/db.ts`)

---

## 1. Tech Stack Assessment

| Technology                                | Role                      | Rating                    | Why                                                                                                              |
| ----------------------------------------- | ------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Electron 43                               | Desktop shell             | ✅ Right choice           | POS needs local OS printers, USB, offline; Electron is appropriate for café terminals                            |
| Express 5                                 | Local HTTP API            | ✅ Right choice           | Simple, mature; matches single-process desktop architecture                                                      |
| better-sqlite3 (WAL)                      | System of record          | ✅ Right choice           | Sync SQLite + WAL is correct for single-machine POS latency and crash resilience                                 |
| `PRAGMA user_version` migrations          | Schema evolution          | ✅ Right choice           | Explicit versioned upgrades with pre-migration backup (`main/db.ts` ~4104–4148)                                  |
| Next.js 16 static export                  | Renderer UI               | ✅ Right choice           | `frontend/next.config.ts` sets `output: "export"` for desktop; avoids Node SSR in Electron                       |
| React 19 + Zustand + TanStack Query       | UI / state                | ✅ Right choice           | Clear split documented in `.ai/patterns.md` (Query=server, Zustand=client, SQLite=domain)                        |
| TypeScript `strict: true`                 | Typing                    | ✅ Right choice           | Root `tsconfig.json` and frontend both strict                                                                    |
| Zod                                       | HTTP validation           | ✅ Right choice           | Present on auth/order/payment/refund/stock (`main/validation/*`) — incomplete coverage is debt, not wrong choice |
| JWT + bcrypt + roles                      | Auth                      | ✅ Right choice           | Local multi-staff auth without cloud IdP                                                                         |
| Electron `safeStorage` → `jwt-secret.enc` | Secret storage            | ✅ Right choice           | `main/services/jwt-secret.ts` — better than plaintext DB/env                                                     |
| WebSocket (KDS)                           | Kitchen realtime          | ✅ Right choice           | `main/server.ts` + `main/services/kds.ts` — appropriate for LAN kitchen                                          |
| Helmet / pino / compression / OTel API    | Hardening & observability | ✅ Right choice           | `main/middleware/http-observability.ts`, `main/lib/tracing.ts`                                                   |
| Manual cash/card/wallet tenders           | Payments                  | ⚠️ Acceptable but risky   | No PSP/terminal — fine for cash-heavy cafés; card = “mark as paid,” not PCI-processed                            |
| Google Drive + WhatsApp (Baileys)         | Optional integrations     | ⚠️ Acceptable but risky   | Useful; Baileys is unofficial; Drive OAuth secrets in env                                                        |
| Service Worker (`frontend/public/sw.js`)  | UI cache                  | ⚠️ Acceptable but risky   | Precaches shells only; explicitly skips `/api` — easy to misread as “offline billing”                            |
| Microservices / Docker / K8s              | Deploy                    | ❌ Wrong for this product | Correctly absent — desktop POS does not need containers                                                          |
| Multi-tenant SaaS DB                      | Data model                | ❌ Wrong if forced now    | Single-tenant by design; “tenant” façade without row isolation (`.ai/risks.md`)                                  |

---

## 2. Architecture Review

### Current architecture (from code)

Local-first Electron app: main process hosts Express + SQLite + printers + optional outbound cloud. Renderer is a statically exported Next.js app. Domain logic lives in `main/services/*`; HTTP in `main/routes/*`; vertical composition in `main/modules/*` (Phase 2 CLOSED; Phase 3.1–3.3 COMPLETE). POS frontend orchestrates checkout via `frontend/src/lib/pos/checkout-coordinator.ts` and does not own tax/inventory/tender math.

### ASCII layer diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Renderer (Next static export / React)             │
│  POS · Orders · Tables · KDS · Settings · Zustand carts     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + Bearer JWT (+ WS for KDS)
┌──────────────────────────▼──────────────────────────────────┐
│  Express API (main/server.ts)  port 3001                    │
│  Auth · requireRole · Zod validateBody · rate limits        │
│  routes/*  →  services/*  →  better-sqlite3 (WAL)           │
│  modules/ composition (restaurant | retail | retail-test)   │
└───────┬──────────────────┬──────────────────┬───────────────┘
        │                  │                  │
   printers/          kds-server :3002    cloud-sync (outbound only)
   thermal ESC/POS    WebSocket KDS       Drive / FloAdmin bridge
```

### Separation of concerns

- **Improving:** Phase 2.7–2.17 extracted Inventory, Tax facade, Order facade, Payment tender, POS orchestration, restaurant soft-gates.
- **Still layer-based with fat seams:** `main/db.ts` (5169 LOC), `main/routes/orders.ts` (2520 LOC), `frontend/.../settings/page.tsx` (6637 LOC).
- **Module registry** is real (`main/modules/registry.ts`, `verticals.ts`, `retail-vertical.ts`) but soft-gates still leave Phase 3.4 residuals (ungated notify alias, held-orders tables gate, void×cancel restock).

### Anti-patterns (with evidence)

| Anti-pattern                              | Evidence                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| God-file schema/DB                        | `main/db.ts` — 5169 lines: schema, migrations, backups, seeds                                                |
| Fat route controllers                     | `main/routes/orders.ts` — 2520 lines; PIN, idempotency, stock, tables mixed                                  |
| God UI page                               | `frontend/src/app/(dashboard)/settings/page.tsx` — 6637 lines                                                |
| Partial Zod coverage                      | Money-critical routes validated; many other routes still ad-hoc                                              |
| Brand/ID identity split                   | `productName: Opervia`, `appId: com.flo.desktop`, `executableName: flocafe`, AppX `Nexora` in `package.json` |
| Capability ≠ authorization confusion risk | Module `CapabilityId` is discovery-only; auth remains `requireRole` (documented, but easy to misuse)         |

---

## 3. Offline-First Strategy

**Yes — local-first, not “PWA sync offline.”**

| Mechanism                                                     | Robustness                                                                                                      |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| SQLite WAL as SoR (`main/db.ts` ~498–499)                     | Strong for single-terminal billing                                                                              |
| Cloud sync outbound-only (`main/services/cloud-sync.ts` L1–2) | Documented non-blocking for order/pay/kitchen (`.ai/patterns.md`)                                               |
| Service Worker (`frontend/public/sw.js`)                      | UI shell cache only; does **not** authorize offline API                                                         |
| Network modes                                                 | `localhost` \| `kds_lan` \| `lan` (`main/services/network-mode.ts`) — LAN is staff LAN, not internet dependency |

**Conflict / sync:** No multi-master sync engine. Multi-device = LAN clients hitting the host SQLite API. Conflicts are avoided by single writer host, not CRDT/merge.

**Risk if internet dies:** Core POS still works. Optional WhatsApp/Drive/cloud commands degrade. That is the correct POS posture.

**Untested residual:** P1.3 failure/recovery matrix (offline, printer, crash, power, duplicate pay) still open in `.ai/tasks.md`.

---

## 4. Code Quality

### TypeScript

- `strict: true` — good.
- `any` density in `main/`: **~700+** hits; hotspots `orders.ts` (112), `db.ts` (52), `bills.ts` (45). ESLint `no-explicit-any: warn` on `main/` only; tests/frontend largely excluded from that rule.

### Error handling

- Typed `*ServiceError` with `statusCode` pattern in refunds/payments/inventory — good.
- Recovery path for missing DB exists (P1.2 REC-01) — good.
- Frontend error boundaries: present in app shell patterns; not uniformly applied on every money dialog.

### Tests

- **~179** `tests/*.test.ts` files; large chained `npm test`.
- Vitest unit subset thin (`tests/unit/` ~7); frontend unit tests nearly absent (1 dates test).
- Playwright e2e present (`frontend/e2e/`).
- c8 baseline only covers 4 files (`auth`, `bills`, `tax-engine`, `security`) — not whole-repo coverage.

### Naming

- Services/routes kebab-ish and domain-plural — mostly consistent.
- Brand names (Opervia / Flo / Nexora / FloCafe) inconsistent across package metadata.

### Dead code / stubs

- Almost **zero** classic `TODO`/`FIXME`/`HACK` markers in source (debt lives in `.ai/tasks.md` and docs).
- Settings “Subscription” UI is a cosmetic stub (no Stripe).
- Phase 3.4 correctness fixes designed but not implemented.

### Top 5 critical code quality issues

1. **`main/db.ts` monolith (5169 LOC)** — every schema change risks collateral damage.
2. **`main/routes/orders.ts` fat controller (2520 LOC, 112 `any`s)** — money-adjacent logic hard to reason about.
3. **Settings page mega-component (6637 LOC)** — unmaintainable UI surface.
4. **Incomplete Zod on non-core routes** — inconsistent input validation boundary.
5. **Phase 3.4 residuals open** — void×cancel stock over-restore; stock reject may 500; soft-gate gaps (`docs/03-architecture/phase-3.4-correctness-residuals.md`).

---

## 5. Security Audit

| Area             | Finding                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Auth             | JWT Bearer (`main/server.ts` ~95–134); roles owner/manager/cashier/waiter/chef; revoked tokens + `tokens_valid_after`                   |
| Secret storage   | JWT secret via Electron `safeStorage` (`main/services/jwt-secret.ts`); `.env` gitignored; `.env.example` present                        |
| Input validation | Zod on critical money paths; not universal                                                                                              |
| SQL injection    | Parameterized better-sqlite3 statements dominant; residual risk in any string-concat SQL (must keep reviewing fat routes)               |
| XSS → session    | CSP allows `'unsafe-inline'` (`main/middleware/http-observability.ts:36–37`); JWT in `localStorage` → XSS owns API (`.ai/risks.md`)     |
| Multi-tenancy    | Single-tenant install; no DB row isolation — correct for product, dangerous if someone sells “SaaS”                                     |
| PCI              | No card data capture / no Stripe — “card” tender is operational recording. PCI scope is low **if** merchants never key PAN into the app |
| LAN              | Cleartext HTTP/WS when `kds_lan`/`lan`; guest Wi‑Fi forbidden (OPS-01); TLS deferred                                                    |
| Electron         | Sandbox + contextIsolation ON (`main/security/browser-window-security.ts`); Phase C CSP/session JWT deferred                            |
| Drive backup     | Owner JWT can `backup-now` without Master PIN (DRV-01 residual)                                                                         |

---

## 6. Scalability & Performance

| Scenario                 | Assessment                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 100 concurrent terminals | **Not the design.** One host SQLite + Express. Dozens of light LAN clients may work; 100 concurrent writers will contend. |
| 1000 tx/day              | ✅ Comfortable for SQLite WAL on modern hardware                                                                          |
| Indexing                 | Present on orders/bills/shifts/refunds/audit/idempotency/inventory_movements in migrations                                |
| N+1                      | Possible in fat report/order list routes — needs profiling under load; not systematically eliminated                      |
| Frontend splitting       | Next App Router pages help; settings megapage undermines it                                                               |
| Realtime                 | WebSockets for KDS — appropriate; not used for billing authority                                                          |

---

## 7. DevOps & Deployment

| Item               | Status                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Dockerfile         | ❌ None (correct for Electron desktop)                                                          |
| CI                 | ✅ `.github/workflows/ci.yml` — lint, build, `npm test`, M1 gate, coverage baseline, Playwright |
| Release            | ✅ `release.yml`, `nightly-release.yml`, multi-OS electron-builder                              |
| Env config         | `.env.example` exists; **`ACTIVE_VERTICAL_ID` missing from example**                            |
| Migrations         | Versioned in `main/db.ts` MIGRATIONS[]; upgrade-path tests exist                                |
| Logging/monitoring | pino + pino-http; OTel spans without mandatory exporter — local ops, not SaaS APM               |

---

## 8. Technical Debt Register

| Debt Item                                       | File/Location                          | Severity | Estimated Effort                 |
| ----------------------------------------------- | -------------------------------------- | -------- | -------------------------------- |
| Monolithic `db.ts`                              | `main/db.ts`                           | P1       | 3–6 weeks (incremental extract)  |
| Fat `orders.ts` route                           | `main/routes/orders.ts`                | P1       | 2–4 weeks                        |
| Settings mega-page                              | `frontend/.../settings/page.tsx`       | P2       | 2–3 weeks                        |
| High `any` density                              | `main/routes/*`, `db.ts`               | P2       | Ongoing                          |
| Money as SQLite REAL                            | schema / money path (P0.3 docs-only)   | P1       | Design + multi-week migrate      |
| CSP `'unsafe-inline'` + JWT localStorage        | `http-observability.ts`, renderer auth | P1       | Phase C — 1–2 weeks              |
| Phase 3.4 correctness residuals                 | KDS/held-orders/void×cancel/stock HTTP | P1       | 3–5 days (plan exists)           |
| Incomplete Zod coverage                         | many routes                            | P2       | 1–2 weeks                        |
| Dual i18n catalogs                              | `locales/` + `lib/i18n/*.json`         | P3       | 1–2 weeks                        |
| Brand/appId identity drift                      | `package.json` build block             | P2       | Ops + careful upgrade continuity |
| No cash drawer kick                             | P1.1 open                              | P2       | 3–5 days                         |
| Doc truth drift (feature-list, schema versions) | `docs/00-product/*`, `local-setup.md`  | P1       | 2–3 days                         |
| Void does not restock / refund no restock       | inventory policy                       | P2       | Product decision + impl          |
| Extraction readiness low for Order              | `extraction-readiness.md`              | P3       | After pilots                     |

---

## 9. CTO Verdict

This is not a toy codebase. It is a serious local-first Electron POS with real money-path hardening (idempotency, refunds, shifts, day-close, FIN-01), a large regression suite, and a coherent modular composition layer. I would **conditionally ship a signed pilot build to 1–3 cafés**, not a general market release. I would **refuse** unrestricted LAN mode on guest Wi‑Fi, unsigned production artifacts, and any claim of multi-location SaaS or card-terminal PCI compliance. Before broader production, close Phase 3.4 stock/soft-gate residuals, keep `ACTIVE_VERTICAL_ID` restaurant for café pilots, and treat CSP/JWT-in-localStorage as accepted risk with ops controls — not as “solved.”
