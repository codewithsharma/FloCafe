# Compatibility

## CURRENT STATE

### Node.js
≥22.12.0 required (`package.json` engines)

### Operating systems
| OS | Minimum | Build targets |
|----|---------|---------------|
| Windows | 10+ | NSIS, AppX |
| macOS | 12+ | DMG, ZIP, MAS |
| Linux | Current distros | AppImage, deb, rpm, Snap |

### Electron
^43.3.0 — better-sqlite3 uses N-API (ABI-stable per AGENTS.md)

### Browsers (standalone apps)
Chromium-based for KDS/Server App on LAN

### Database compatibility
- App must be ≥ database schema version
- Newer DB than app → `SchemaVersionMismatchError`
- Upgrade from v1.5.0 fixture tested

## TARGET STATE
- Document minimum hardware for 12-hour service day (PROPOSED)
- Terminal payment device compatibility matrix (NOT BUILT)
