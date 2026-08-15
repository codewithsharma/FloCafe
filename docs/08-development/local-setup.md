<!-- Last verified against codebase: 2026-08-14, schema v80 -->

# Local Setup

## Repository remotes

| Remote     | URL                                     |
| ---------- | --------------------------------------- |
| `origin`   | your fork (e.g. codewithsharma/FloCafe) |
| `upstream` | FreeOpenSourcePOS/FloCafe               |

The GitHub repository name remains **FloCafe** for continuity. The product brand is **Operavia**.

## Default branch

`main` — CI (`.github/workflows/ci.yml`) and `CONTRIBUTING.md` use `main`. A `develop` branch may exist on remotes but is not the CI gate.

## Verified stack

| Component      | Version   | Source                                                      |
| -------------- | --------- | ----------------------------------------------------------- |
| Node.js        | ≥ 22.12.0 | `package.json` engines                                      |
| Electron       | ^43.3.0   | `package.json`                                              |
| Next.js        | 16.2.12   | `frontend/package.json`                                     |
| React          | 19.2.8    | `frontend/package.json`                                     |
| Express        | ^5.2.1    | `package.json`                                              |
| better-sqlite3 | ^13.0.3   | `package.json`                                              |
| Schema version | **79**    | `main/db.ts` MIGRATIONS (`v79 recipes/BOM (R5); prior ledger v75`) |
| App version    | 3.0.5     | `package.json`                                              |
| Product name   | Operavia  | `package.json` `build.productName`                          |

SQLite version is bundled with `better-sqlite3` (not separately pinned).

Internal package identifiers (do not rename): npm `flo-desktop`, Linux `executableName` `flocafe`, `appId` `com.flo.desktop`.

## Database location

| Mode                       | Path                                              |
| -------------------------- | ------------------------------------------------- |
| Dev (`node dev-server.js`) | `flo.db` adjacent to repo                         |
| Packaged Electron          | OS userData directory (`app.getPath('userData')`) |

## Ports

| Service    | Default | Env override      |
| ---------- | ------- | ----------------- |
| Main API   | 3001    | `PORT`            |
| KDS        | 3002    | `KDS_PORT`        |
| Server App | 3003    | `SERVER_APP_PORT` |

If default ports are in use (e.g. Operavia app running), run `npm run clean` before tests.

## Environment files

No `.env` is required for local café development. Settings are stored in the SQLite `settings` table.

Copy the template when you need overrides:

```sh
cp .env.example .env
```

### Vertical selection (`ACTIVE_VERTICAL_ID`)

| Value                     | Use                                                   |
| ------------------------- | ----------------------------------------------------- |
| _(unset)_ or `restaurant` | **Café / Restaurant local default** — safe for pilots |
| `retail`                  | Production Retail composition (no tables/KDS/addons)  |
| `retail-test`             | Synthetic tests only — never for merchant use         |

Empty or unknown values fail closed (server will not start). See `.env.example` and `main/modules/vertical-config.ts`.

Other documented vars: `JWT_SECRET`, `PORT`, `KDS_PORT`, `SERVER_APP_PORT`, `NODE_ENV`, `LOG_LEVEL`, `FLO_ALLOW_JWT_SECRET_ENV`, Google Drive client id/secret.

## Recovery scripts

| Command               | Purpose                               |
| --------------------- | ------------------------------------- |
| `npm run dev:restart` | Unix restart                          |
| `npm run dev:reset`   | Nuclear reset (requires confirmation) |
| `npm run clean`       | Kill processes on ports 3001–3003     |

## First-run in dev

Navigate to http://localhost:3001/setup or login after initialize. Setup supports empty / express / demo seed profiles.

## Install steps

```sh
npm ci                    # root — installs Electron + native deps
cd frontend && npm ci     # frontend — required for lint/build/E2E
cd ..
npx @electron/rebuild -f -w better-sqlite3   # if tests fail on SQLite load
npm run dev               # full Electron app
# or: node dev-server.js  # backend API only
# or: npm run dev:frontend
```

## Tests

```sh
npm test                  # full chained suite (long)
npm run test:unit         # vitest unit subset
cd frontend && npm run test:e2e   # Playwright (see frontend/e2e/)
```

## Troubleshooting

| Symptom                     | Fix                                                              |
| --------------------------- | ---------------------------------------------------------------- |
| Smoke test login fails      | Run `npm run clean` — port 3001 may be occupied                  |
| `better-sqlite3` load error | `npx @electron/rebuild -f -w better-sqlite3`                     |
| ESLint not found            | Run `npm ci` at repo root                                        |
| KDS on wrong port           | Expected when 3002/3003 busy; smoke test uses dynamic ports      |
| Wrong modules mounted       | Check `ACTIVE_VERTICAL_ID` in `.env`; leave unset for restaurant |

See README.md Troubleshooting for printers.
