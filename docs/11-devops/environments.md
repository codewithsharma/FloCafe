# Environments

## CURRENT STATE

| Environment | Description |
|-------------|-------------|
| Development | `npm run dev` — Electron + local DB |
| Backend-only dev | `node dev-server.js` |
| CI | GitHub Actions ubuntu-latest + macos/windows matrix |
| Production | End-user desktop install |

No staging server — POS is the deployed artifact.

### External services (optional)
| Service | URL (from code) |
|---------|-------------------|
| FloAdmin | blue.flopos.com |
| Telemetry | telemetry.flopos.com |
| GitHub Releases | FreeOpenSourcePOS/FloCafe |

## TARGET STATE
- Document FloAdmin staging vs production endpoints
- Beta channel releases (electron-updater)
