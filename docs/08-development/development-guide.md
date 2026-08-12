# Development Guide

## Prerequisites
- Node.js ≥22.12.0
- npm
- Platform build tools for better-sqlite3 (native module)

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

## Common tasks
| Task | Command |
|------|---------|
| Lint | `npm run lint` |
| Build backend | `npm run build` |
| Build frontend | `npm run build:frontend` |
| Full tests | `npm test` |
| DB audit | `npm run audit:db` |
| E2E | `npm run test:e2e` |

## Project layout
See `AGENTS.md` and `03-architecture/architecture.md`.

## Branch naming
`fix/`, `feat/`, `docs/`, `test/`, `refactor/`, `chore/` prefixes per AGENTS.md.
