# System Architecture

## CURRENT STATE

**Operavia Restaurant** (Phase 1) is an **Electron 43 desktop application** with three co-located HTTP servers sharing one SQLite database. Canonical brand: **Operavia** (ADR-010). Modular multi-vertical TARGET is documented separately — see [modular-architecture.md](modular-architecture.md) and [architecture-gap-report.md](architecture-gap-report.md).

```
┌─────────────────────────────────────────────────────────────────┐
│                    Electron Main Process                         │
│  main/index.ts                                                   │
│  ├── initDatabase()          → flo.db (WAL, schema v75)         │
│  ├── startServer()           → :3001  API + static frontend     │
│  ├── startKdsServer()        → :3002  KDS standalone            │
│  ├── startServerApp()        → :3003  Waiter app                │
│  ├── Services: cloud-sync, telemetry, google-drive, whatsapp    │
│  ├── initPrinter()           → ESC/POS                          │
│  └── registerIpcHandlers()   → preload bridge                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP /api, WebSocket /kds
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Next.js Static Export (frontend/out)                │
│  React 19 + Zustand + axios → same-origin /api                  │
│  Optional: WebUSB printing, Electron IPC (desktop only)           │
└─────────────────────────────────────────────────────────────────┘
```

### Server responsibilities

| Port | Module               | Purpose                              | Auth                            |
| ---- | -------------------- | ------------------------------------ | ------------------------------- |
| 3001 | `main/server.ts`     | Full REST API, POS UI, KDS WebSocket | JWT (global except auth/health) |
| 3002 | `main/kds-server.ts` | KDS UI + KDS REST + WS               | chef/manager/owner              |
| 3003 | `main/server-app.ts` | Waiter UI, proxies to :3001          | waiter/manager/owner            |

**Evidence:** `main/index.ts`, `AGENTS.md`, `README.md`

### Data layer

- **SQLite** via `better-sqlite3` (sync API)
- **Location:** OS userData dir when packaged; repo-adjacent in dev
- **Migrations:** inline in `main/db.ts`, `PRAGMA user_version` 1→75
- **Maintenance lock:** 503 during backup/restore/initialize

### Communication patterns

| Pattern             | Usage                                         |
| ------------------- | --------------------------------------------- |
| REST `/api/*`       | All CRUD and business operations              |
| WebSocket `/kds`    | Kitchen order realtime updates                |
| IPC (`main/ipc.ts`) | DB tools, settings, updates (desktop)         |
| mDNS                | `flo.local` advertisement (`bonjour-service`) |
| Cloud outbox        | Durable HTTPS events to FloAdmin              |

### Module boundaries (actual)

```
main/routes/     → HTTP handlers (thin; some business logic inline)
main/services/   → Domain services (tax, kds, cloud, whatsapp, etc.)
main/middleware/ → Auth, rate limit, CORS, master PIN
main/db.ts       → Schema, migrations, DB utilities (large monolith)
main/printers/   → ESC/POS encoding and device I/O
frontend/src/    → UI, client state, printer encoders, API client
```

**Note:** FloCafe does **not** implement strict Routes→Controllers→Services→Repositories layering. Business logic lives in routes and services with direct SQL.

## TARGET STATE (RestaurantOS)

Preserve the **monolithic Electron + SQLite + Express** architecture for single-terminal deployments. Extend incrementally:

1. **Extract domain modules** from `main/db.ts` and fat routes into testable services (refactor, not rewrite).
2. **Introduce location/terminal entities** when multi-location is implemented (new tables + scoping middleware).
3. **Optional cloud hub** for config sync and reporting — outbound-only, never blocking billing.
4. **Plugin/integration boundary** — formalize extension points for payment terminals and delivery APIs.

Do **not** introduce microservices, Kubernetes, or message brokers unless operational scale proves insufficient.

## Architectural constraints

| Constraint             | Reason                                                          |
| ---------------------- | --------------------------------------------------------------- |
| Offline-first          | Restaurant network reliability                                  |
| Single SQLite writer   | better-sqlite3 sync model; WAL supports concurrent readers      |
| Static frontend export | Electron loads `frontend/out` without Node server in production |
| LAN binding 0.0.0.0    | KDS/tablet access on local network                              |

## Evidence files

- `main/index.ts`, `main/server.ts`, `main/kds-server.ts`, `main/server-app.ts`
- `main/db.ts`, `main/routes/index.ts`
- `frontend/next.config.ts` (desktop static export)
- `package.json` (Electron 43, better-sqlite3 13)
