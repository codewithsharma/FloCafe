# Architecture Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · **Schema:** v86

> Verdict up front: the architecture is **coherent, deliberate, and unusually disciplined for a POS of this size**. It is a well-structured _modular monolith_ (single Electron process hosting an embedded Express API over SQLite) with explicit domain boundaries, a vertical-composition system, and strong data-safety plumbing. The principal architectural weaknesses are three well-known "god-files" and some duplicated server bootstrap logic — both already recognized by the maintainers in `AGENTS.md`.

---

## 1. System overview

OPERAVIA is a **local-first, offline-capable desktop POS**. It is not a cloud service; each install is one store's Electron app that embeds its own API server and SQLite database.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Electron main process (Node)                    main/index.ts         │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ POS API+WS     │  │ KDS server    │  │ Server App (waiter) proxy │  │
│  │ server.ts :3001│  │ kds-server.ts │  │ server-app.ts :3003       │  │
│  │  Express 5     │  │ :3002 + /kds  │  │  auth-gated reverse proxy │  │
│  └──────┬─────────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│         │ registerRoutes    │ shared WS             │ forwards to      │
│         ▼ (vertical-gated)  ▼ setupKdsWebSocket     ▼ 127.0.0.1:3001   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Domain services  main/services/*  (orders, tax, refund, shift,   │  │
│  │  inventory, recipe, kds, cloud-sync, purchasing, …)              │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │ Data layer  main/db.ts (lifecycle/backup/recovery)               │  │
│  │             main/database/migrations.ts (v1→v86)                 │  │
│  │             better-sqlite3, WAL, foreign_keys=ON                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  Peripherals: printers/thermal.ts, WhatsApp (Baileys), Google Drive   │
└───────────────────────────────────────────────────────────────────────┘
          ▲ http://localhost:3001 (renderer loads over HTTP, never file://)
┌─────────┴───────────────────────────────────────────────────────────┐
│ Renderer: Next.js 16 / React 19 static export (frontend/out)          │
│  Zustand (client state) + TanStack Query (server state) + axios       │
└───────────────────────────────────────────────────────────────────────┘
```

**Three cooperating HTTP servers**, each with an EADDRINUSE port-scan (10 attempts):

| Server                           | File                 | Port                     | Role                                                                                   |
| -------------------------------- | -------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| POS API + renderer host + KDS WS | `main/server.ts`     | 3001 (`PORT`)            | Serves the static frontend, `/api/*`, and the `/kds` WebSocket                         |
| Standalone KDS                   | `main/kds-server.ts` | 3002 (`KDS_PORT`)        | Kitchen tablets; own auth + `/kds` WS                                                  |
| Server App (waiter)              | `main/server-app.ts` | 3003 (`SERVER_APP_PORT`) | Thin auth-gated reverse proxy to the POS API (`forwardToMainApi`, `server-app.ts:112`) |

The renderer always loads over `http://localhost:<port>` (`main/index.ts:261`), so dev and packaged builds run identically — a strong, under-appreciated design decision that eliminates a whole class of `file://`-only bugs.

## 2. Startup & lifecycle

`app.whenReady().then(initialize)` (`main/index.ts:890`) enforces a strict ordered boot (`initialize`, `index.ts:717`):

1. **Single-instance lock** before anything else (`index.ts:217`).
2. `initDatabase()` → may throw `DatabaseRecoveryRequiredError`, flipping the app into **recovery mode** (`index.ts:723`).
3. `initializeJWTSecret()` from OS secure storage (`index.ts:741`).
4. `startServer()` (always).
5. **If recovery mode**: only restore IPC + `/recovery` window mount, then return early — KDS/ServerApp/printers/WhatsApp never start (`index.ts:754`). This is a clean fail-closed boundary.
6. Otherwise start cloud sync, telemetry, Google Drive, KDS server, Server App, WhatsApp, mDNS, printers, IPC (`index.ts:781`).

**Assessment:** the boot sequence is explicit and defensive. Recovery mode as a first-class startup branch (rather than a runtime flag checked ad hoc) is a maturity signal.

## 3. Separation of concerns & dependency direction

The intended layering is **routes → services → data layer**, and it largely holds:

- **`main/routes/*`** (~50 modules) — HTTP handlers, validation, RBAC, transaction orchestration.
- **`main/services/*`** (~49 modules) — reusable domain engines (tax, refund, shift, inventory, recipe, kds, day-close…). These hold the real business logic and are the correct unit of reuse.
- **`main/db.ts` + `main/database/migrations.ts`** — connection lifecycle, schema, backup/restore/recovery. Notably, `db.ts` contains **only 16 `db.prepare` calls** — data access was deliberately pushed into the services, so `db.ts` is an infrastructure module, not a query god-object (though it is still too large; see §7).
- **`main/validation/*`** (19 zod modules, one per domain) — a consistent validation boundary applied at route entry.
- **`main/modules/*`** — the vertical/module **composition system** (`registry.ts`, `composition.ts`, `route-mounting.ts`, `verticals.ts`). This is the cleanest architectural boundary in the codebase.
- **`main/lib/*`** — pure helpers (`money.ts`, `logger.ts`, `tracing.ts`, `phone.ts`, `dates.ts`).
- **`main/security/*`** — Electron window hardening, URL allowlist, IPC auth, restore-path hardening.

Dependency direction is generally correct (routes depend on services depend on the data layer; `lib` is leaf-level). The migration subsystem uses a clever **host-binding inversion** — `migrations.ts` owns no DB handle and forwards through a `MigrationHost` injected by `db.ts` (`migrations.ts:14`, `db.ts:2839`) — which keeps historical migration closures stable and lets the handle be swapped for an in-memory "ideal schema" build during schema-health checks (`db.ts:2823`). This is genuinely elegant.

**Where the layering leaks:** order _write_ logic lives in the **route** modules (`main/routes/orders/create.ts`, `bills.ts`) rather than in a service, while `main/services/order.ts` is a thinner helper. This is a pragmatic and documented choice (the route files carry ownership-marker comments), but it means the most valuable business logic — the money path — sits in the HTTP layer. See BACKEND-AUDIT.md.

## 4. Modularity & the vertical-composition system

The standout architectural feature. `ACTIVE_VERTICAL_ID` (env, committed at startup — `server.ts:301`) selects a **composition** (`restaurant`, `retail`, `retail-test`). `registerRoutes` (`routes/index.ts:86`) is **fail-closed**: `assertFailClosedComposition` runs before any mount, and a `mount(prefix, router, moduleId)` helper skips routers whose module isn't enabled for the active vertical (`shouldMountModule`). Restaurant-only surfaces (kitchen, tables, kds, addon-groups) simply do not mount for retail.

This gives real, testable module boundaries (`test:module-*`, `test:retail-isolation`, `test:synthetic-retail`) and lets one codebase serve multiple verticals without runtime branching scattered through handlers. It is the correct pattern and is well-executed.

## 5. Data flow — the money path (representative)

`create order → add items → discount → generate bill → settle payment → refund → day-close`, all coordinated through `withTxn()` and integer-cents money (`main/lib/money.ts`):

- **Every multi-write path is transactional** (`withTxn`), and stock+ledger and money+idempotency writes are co-transactional (`main/routes/orders/create.ts`, `main/services/inventory.ts`).
- **Idempotency is pervasive**: `order_idempotency`, `payment_idempotency` (+ `payment_transaction_refs`), `refund_idempotency`, `purchase_receive_idempotency` — each guarded by a request-hash comparison so key reuse with a different body returns 409 (`bills.ts` payment endpoints require an `Idempotency-Key` header).
- **Immutable evidence**: frozen `EngineTaxSnapshot` on order_items/orders/bills, frozen `day_closes.summary_json`, append-only `inventory_movements` ledger. Historical receipts never change when catalog/tax config changes.
- **Actor integrity**: the order actor is always `authUser.userId`, never client-supplied (`create.ts:113`, closing a documented spoofing bug). Client-supplied item discounts are ignored (`create.ts:253`).

This is **bank-grade discipline for a POS** and the single strongest aspect of the architecture. Full detail in DATABASE-AUDIT.md and BACKEND-AUDIT.md.

## 6. Real-time (WebSocket)

A single `setupKdsWebSocket` (`main/services/kds.ts`) is shared by both `server.ts` and `kds-server.ts` via `WebSocketServer({noServer:true})` + a manual `upgrade` handler. It is JWT-authenticated with a 5 s auth timeout, client caps (100 total / 25 unauthenticated), a 30 s heartbeat that **re-authorizes every client on every tick** (`fresh:true`) and disconnects on role/permission change, and a 1 MB slow-client cutoff. Broadcasts are coalesced via `queueMicrotask` (`notifyKdsUpdate`).

**Assessment:** the server-side WS design is robust. The weakness is on the **client**: `orders/page.tsx` hand-rolls a _second_ `/kds` socket plus a 10 s polling loop instead of reusing `useKdsConnection` (see FRONTEND-AUDIT.md) — duplicated realtime logic.

## 7. Architectural risks & violations

### 7.1 God-files concentrating responsibility

- **Issue:** Three files carry outsized responsibility: `frontend/src/app/(dashboard)/settings/page.tsx` (**6,654 lines**, ~111 `useState`, 18 inline tabs), `main/db.ts` (**4,120 lines**), `main/database/migrations.ts` (**2,724 lines**), `main/printers/thermal.ts` (**2,505 lines**).
- **Severity:** High (maintainability/merge-risk), not Critical (they are cohesive, not spaghetti).
- **Evidence:** line counts above; `AGENTS.md:47` explicitly names `main/db.ts`, `main/routes/orders.ts`, and the Settings page as governed hotspots ("no new feature may materially increase [their] responsibility … without extracting the corresponding domain boundary first").
- **Why it matters:** these are the highest-probability merge-conflict and regression surfaces; onboarding cost is concentrated here.
- **Recommendation:** the maintainers' own R4.1 governance rule is correct — enforce it. Prioritize splitting `settings/page.tsx` per-tab (each tab is already an isolated `TabsContent`). See REFACTORING-ROADMAP.md.
- **Refactoring effort:** Settings page — Medium; `db.ts`/`migrations.ts` — High (touch data-safety code; requires the full upgrade-path test battery).
- **Confidence:** High.

### 7.2 Duplicated server bootstrap across the three servers

- **Issue:** Next.js static-serving, Windows path-rewrite (`rewriteNextExportPath`), and the EADDRINUSE port-scan loop are copy-pasted across `server.ts`, `kds-server.ts`, and `server-app.ts`, and the SPA fallbacks differ subtly between them.
- **Severity:** Medium.
- **Why it matters:** a fix to one (e.g. a path-traversal hardening or a fallback bug) can silently miss the other two.
- **Recommendation:** extract a shared `serveStaticExport()` / `listenWithPortScan()` helper into `main/lib`.
- **Confidence:** High.

### 7.3 Security-middleware asymmetry across servers

- **Issue:** Only `server.ts` applies helmet, request logging, compression, and the recovery-protection middleware. `kds-server.ts` and `server-app.ts` apply none of these despite sharing the same SQLite DB (they rely on their own inline `requireAuth`).
- **Severity:** Medium (mitigated: KDS/ServerApp do not start in recovery mode, and both still enforce JWT).
- **Recommendation:** share a single security-header/logging middleware factory across all three listeners.
- **Confidence:** High. (Cross-referenced in SECURITY-AUDIT.md.)

### 7.4 LAN exposure is a setting, not a boundary

- **Issue:** `network_mode` (`main/services/network-mode.ts`) can bind all three servers to `0.0.0.0`. The code is explicit that "CORS is not a security boundary" and keeps JWT mandatory, and fails safe to localhost on invalid values — but `lan` mode puts the full money API on all interfaces, protected only by JWT and a rate limiter that exempts private IPs.
- **Severity:** Medium.
- **Recommendation:** ensure the auth rate limiter does **not** exempt private IPs in LAN mode (already true for the login limiter, `security.ts` `bypassPrivateIp:false`); document the LAN threat model for operators.
- **Confidence:** High.

## 8. Scalability & testability

- **Scalability (in context):** appropriate. A single store's transaction volume is trivial for SQLite in WAL mode; the synchronous DB driver is correct here. The system is **not** designed for multi-store/cloud scale, and correctly declares that Frozen (multi-location is explicitly out of scope in `AGENTS.md` / the product blueprint). No architectural change is warranted for scale it will not experience.
- **Testability:** the service extraction makes domain logic unit-testable, and the module system is contract-tested. The weak spot is that order write-logic in routes is exercised mostly through integration tests rather than unit tests (see TESTING-AUDIT.md).

## 9. Strengths (architecture)

1. **Transactional integrity + pervasive idempotency + immutable financial snapshots** — the money path is designed like a ledger system.
2. **Fail-closed everywhere** — recovery mode, corrupt-DB latching, unknown-vertical refusal-to-start, disabled-module 404s.
3. **Vertical/module composition** — clean, tested, real boundaries.
4. **Data-safety plumbing** — pre-migration auto-backup, crash-safe atomic replacement journal, schema-drift detection against an in-memory ideal schema.
5. **Identical dev/prod rendering** over localhost HTTP.

## 10. Summary rating

**Architecture: strong.** The design decisions are consistent with the product (offline-first single-store POS) and show real engineering maturity in the areas that matter most for a money-handling system. The debt is concentrated, named, and governed rather than diffuse. Score contribution reflected in EXECUTIVE-SUMMARY.md.
