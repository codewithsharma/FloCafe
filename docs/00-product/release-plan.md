# Release Plan

## CURRENT STATE

FloCafe releases via GitHub tags triggering `.github/workflows/release.yml`.

| Channel | Artifact |
|---------|----------|
| GitHub Releases | NSIS, DMG, AppImage, deb, rpm, Snap |
| Mac App Store | `build:mas` |
| Microsoft Store | AppX |
| Snap Store | Snapcraft publish |

Version source: `package.json` (currently 3.0.5).

## RestaurantOS release strategy (TARGET)

### Versioning
- Continue semver aligned with `package.json`
- Database migrations must support N-1 upgrade path

### Release cadence (PROPOSED)
| Type | Frequency | Contents |
|------|-----------|----------|
| Patch | As needed | Bug fixes, migration fixes |
| Minor | Monthly | Features, additive schema |
| Major | Rare | Breaking API/UI changes |

### Pre-release gates (from AGENTS.md)
```sh
npm run lint
npm run build
npm test
```

Plus: upgrade-path test, frontend build, Playwright E2E in CI.

### RestaurantOS naming
Product rename (Flo Cafe → RestaurantOS) is a **marketing/branding decision** — not implemented in code today (`productName: Flo Cafe` in electron-builder).
