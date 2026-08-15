# Unsigned Release Candidate Report

**Date:** 2026-08-15  
**Product:** OPERAVIA Restaurant (`flo-desktop` / `Operavia`)  
**Git HEAD (at pack):** `f15c6cdc99bd5e48514141274931dc2dc7512537`  
**Live e2e server:** `http://localhost:3001` PID **47633** — health **200** (not restarted; not used as the packaged RC)

---

## Build

| Step     | Command                                          | Result   | Notes                               |
| -------- | ------------------------------------------------ | -------- | ----------------------------------- |
| Main     | `npm run build`                                  | **PASS** | `tsc` + runtime assets              |
| Frontend | `npm run build:frontend`                         | **PASS** | Next static export → `frontend/out` |
| Pack     | `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` | **PASS** | `electron-builder --dir`            |

**Approximate wall time:** ~66s total for this pass (pack ~13s after rebuilds).

**Signing during pack:** Skipped — identity configured in `package.json` (`Codify Apps Private Limited`) but **0 keychain identities**. Output is **adhoc / linker-signed** only.

---

## Version

| Source                                                          | Value                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| Root `package.json`                                             | **3.0.5**                                                   |
| Packaged `app.asar` `package.json`                              | **3.0.5**                                                   |
| `Operavia.app` `CFBundleShortVersionString` / `CFBundleVersion` | **3.0.5**                                                   |
| `CFBundleIdentifier`                                            | `com.flo.desktop`                                           |
| `CFBundleName` / product                                        | **Operavia**                                                |
| `frontend/package.json`                                         | **0.1.0** (mismatch — **not bumped**; see Known Conditions) |
| Live e2e `/api/health` `version`                                | **2.4.7** (e2e-server string — **not** the RC artifact)     |

---

## Artifact

| Field     | Value                                                  |
| --------- | ------------------------------------------------------ |
| Filename  | `Operavia.app`                                         |
| Path      | `release/mac-arm64/Operavia.app`                       |
| Size      | **~413 MB** (`du -sh`)                                 |
| Platform  | macOS **darwin arm64**                                 |
| Electron  | **43.3.0** (electron-builder 26.15.3)                  |
| Pack mode | `--dir` (unpacked app; no DMG/ZIP produced this run)   |
| Codesign  | **adhoc** — `TeamIdentifier=not set` — **UNSIGNED RC** |

---

## Artifact Integrity

### Packaged frontend

- Extra resource: `Contents/Resources/frontend-out`
- Routes with `index.html` present: `/dashboard`, `/pos`, `/orders`, `/tables`, `/kds`, `/products`, `/products/purchasing`, `/customers`, `/reports`, `/expenses`, `/audit`, `/staff`, `/settings`, `/support`, `/auth`, `/recovery`
- `/inventory` and `/team` have no dedicated export dirs (app aliases → `/products`, `/staff`) — **expected**
- KDS: `frontend-out/kds/` + `kds-standalone/` present
- Assets: `Contents/Resources/assets/` (icons) present

### Backend / main

- `Contents/Resources/app.asar` (~102 MB) contains `dist/` (`index.js`, `server.js`, `db.js`, `kds-server.js`, routes, middleware)
- `better-sqlite3` native binary validated by afterPack hook under `app.asar.unpacked`

### Production config (code paths in packaged `dist`)

| Concern                | Packaged behavior                                                              |
| ---------------------- | ------------------------------------------------------------------------------ |
| Frontend root          | `process.resourcesPath/frontend-out` when packaged                             |
| DB path                | `{userData}/flo.db` when `app.isPackaged`                                      |
| Backups                | `{userData}/backups`                                                           |
| userData               | `~/.config/flo-desktop` (explicit set in main)                                 |
| JWT secret             | `safeStorage` / `userData/jwt-secret.enc` — not baked into package             |
| Dev mode gate          | `NODE_ENV === 'development' \|\| !app.isPackaged`                              |
| Does **not** depend on | live `:3001` e2e PID, `e2e-server.cjs`, Cursor, or repo `flo.db` when packaged |

CSP still includes `unsafe-inline` (Phase C residual — unchanged).

---

## Security

| Check                                                          | Result                                                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit --omit=dev`                                         | **0** vulnerabilities                                                                                                                                      |
| `E2ePass123!` in artifact                                      | **0** hits                                                                                                                                                 |
| Private keys / `JWT_SECRET` env literals / signing API secrets | **0** hits                                                                                                                                                 |
| Tracked `.env` / `flo.db` / QA evidence in package             | **None**                                                                                                                                                   |
| Root `index.js`                                                | **Absent** (workspace + package)                                                                                                                           |
| `@flo.local`                                                   | **Placeholder / seed emails only** (KDS/Server App placeholders; demo staff emails seeded inactive with random passwords — prior readiness classification) |
| “Master PIN” / `master-pin` strings                            | **UI/service labels only** — no PIN values                                                                                                                 |

---

## GUI

Existing GUI evidence remains authoritative (do not re-run full matrix):

- GUI-0001…0006 PASS
- Final RBAC audit PASS
- RC real-world QA PASS WITH CONDITIONS
- Production readiness / release hardening: **CONDITIONAL GO**

---

## Known Conditions

1. **Unsigned / adhoc** — not Gatekeeper/notarized; not for live café install.
2. **`frontend/package.json` version `0.1.0`** ≠ ship version `3.0.5` — cosmetic/metadata drift; Electron identity uses root `3.0.5`. Do not silent-bump without release convention.
3. **Packaged demo/dev-ish static routes:** `order-history-demo`, `print-test` present in `frontend-out` (P3 hygiene; not credentials).
4. **Source maps** present under packaged `dist/*.map` (no secrets found in scan).
5. **`better-sqlite3` `deps/test_extension.c`** still under unpacked module deps (`.node` test binary already excluded).
6. JWT/localStorage + CSP `unsafe-inline` remain **Phase C** residuals.
7. Live e2e health string `2.4.7` ≠ RC `3.0.5` — expected for the disposable e2e process.

---

## Blockers Before Live Café

1. Signed + notarized RC for target OS
2. OPS-02 real-site drills ([`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md))
3. Master PIN escrow + real-desktop backup/restore proof
4. Backup policy approval
5. Written acceptance of JWT/CSP residuals **or** Phase C
6. Pilot / executive sign-off

---

## Signing / Notarization

| Target                   | How                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Unsigned (this artifact) | `npm run build && npm run build:frontend && CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack`                       |
| Signed mac               | Requires keychain / `CSC_LINK` + `CSC_KEY_PASSWORD` matching `build.mac.identity`                                 |
| Notarized mac            | Signed + `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` / `APPLE_TEAM_ID` (`build.mac.notarize: true`) |

**This pass:** credentials not present → signing skipped → **READY FOR SIGNING** (artifact ready to receive credentials).

---

## OPS-02

Not executed. Checklist: [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md) — all drills still open.

---

## Final Decision

```text
READY FOR SIGNING
```

Meaning: reproducible unsigned macOS arm64 `Operavia.app` is complete enough to proceed to **signing/notarization**.  
**Not** production-ready. **Not** live-café GO.
