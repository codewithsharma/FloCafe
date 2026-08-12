# Development Guide

> M1 (Engineering baseline) verified on FloCafe v3.0.5. See [`m1-engineering-baseline.md`](../15-project-management/m1-engineering-baseline.md).

## Prerequisites

| Requirement | Verified value |
|-------------|----------------|
| Node.js | ≥ 22.12.0 (`package.json` engines) |
| npm | 10+ (lockfile v3) |
| OS | Linux/macOS/Windows (CI uses Ubuntu 22+) |
| Native build tools | Required for `better-sqlite3` (Electron ABI) |

## Quick start

```sh
git clone https://github.com/codewithsharma/FloCafe.git
cd FloCafe
npm install
npm run dev
```

## Backend-only

```sh
node dev-server.js
```

## Frontend-only (browser)

```sh
npm run dev:frontend
```

## M1 verification commands

Run these before starting RestaurantOS product work (M2+):

```sh
npm run clean          # Free ports 3001–3003 if Flo Cafe is running
npm run lint
npm run build
npm test
npm run test:coverage:baseline
npm run test:m1-gate
```

Optional full E2E (requires frontend build):

```sh
npm run build:frontend
npm run test:e2e
```

## Common tasks

| Task | Command |
|------|---------|
| Lint | `npm run lint` |
| Build backend | `npm run build` |
| Build frontend | `npm run build:frontend` |
| Full tests | `npm test` |
| Coverage baseline | `npm run test:coverage:baseline` |
| M1 gate | `npm run test:m1-gate` |
| DB audit | `npm run audit:db` |
| E2E | `npm run test:e2e` |
| Free dev ports | `npm run clean` |

## Project layout

See `AGENTS.md` and `03-architecture/architecture.md`.

## Branch naming

`fix/`, `feat/`, `docs/`, `test/`, `refactor/`, `chore/` prefixes per AGENTS.md.

## Source-of-truth rules

1. Code wins over docs when they conflict.
2. Do not document planned features as implemented.
3. Schema changes require migration + upgrade-path test.
4. Product behavior changes require explicit milestone scope (M2+).
