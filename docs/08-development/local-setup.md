# Local Setup

## Repository remotes

| Remote | URL |
|--------|-----|
| `origin` | codewithsharma/FloCafe (fork) |
| `upstream` | FreeOpenSourcePOS/FloCafe |

## Default branch

`develop`

## Verified stack (M1 baseline)

| Component | Version | Source |
|-----------|---------|--------|
| Node.js | ≥ 22.12.0 | `package.json` engines |
| Electron | ^43.3.0 | `package.json` |
| Next.js | 16.2.12 | `frontend/package.json` |
| React | 19.2.8 | `frontend/package.json` |
| Express | ^5.2.1 | `package.json` |
| better-sqlite3 | ^13.0.3 | `package.json` |
| Schema version | 66 | `main/db.ts` MIGRATIONS |
| App version | 3.0.5 | `package.json` |

SQLite version is bundled with `better-sqlite3` (not separately pinned).

## Database location

| Mode | Path |
|------|------|
| Dev (`node dev-server.js`) | `flo.db` adjacent to repo |
| Packaged Electron | OS userData directory (`app.getPath('userData')`) |

## Ports

| Service | Default | Env override |
|---------|---------|--------------|
| Main API | 3001 | `PORT` |
| KDS | 3002 | `KDS_PORT` |
| Server App | 3003 | `SERVER_APP_PORT` |

If default ports are in use (e.g. Flo Cafe app running), run `npm run clean` before tests.

## Environment files

No `.env` is required for local development. Settings are stored in SQLite `settings` table.

`.env.example` is not yet present (Eng P1 backlog).

## Recovery scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:restart` | Unix restart |
| `npm run dev:reset` | Nuclear reset (requires confirmation) |
| `npm run clean` | Kill processes on ports 3001–3003 |

## First-run in dev

Navigate to http://localhost:3001/setup or login after initialize.

## Install steps

```sh
npm ci                    # root — installs Electron + native deps
cd frontend && npm ci     # frontend — required for lint/build/E2E
cd ..
npx @electron/rebuild -f -w better-sqlite3   # if tests fail on SQLite load
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Smoke test login fails | Run `npm run clean` — port 3001 may be occupied |
| `better-sqlite3` load error | `npx @electron/rebuild -f -w better-sqlite3` |
| ESLint not found | Run `npm ci` at repo root |
| KDS on wrong port | Expected when 3002/3003 busy; smoke test uses dynamic ports |

See README.md Troubleshooting for printers.
