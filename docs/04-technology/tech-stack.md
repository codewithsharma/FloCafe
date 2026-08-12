# Technology Stack

All versions **VERIFIED** from `package.json` and `frontend/package.json` unless noted.

## Runtime

| Technology | Version | Where used | Retain? | Migration risk |
|------------|---------|------------|---------|----------------|
| Node.js | ≥22.12.0 | Dev, build, tests | Yes | Low — engines enforced |
| Electron | ^43.3.0 | Desktop shell | Yes | Medium — native module ABI |
| TypeScript | ^5.4.5 (root), 5.9.3 (frontend) | All TS code | Yes | Low |

## Frontend

| Technology | Version | Where used | Retain? | Notes |
|------------|---------|------------|---------|-------|
| Next.js | 16.2.12 | `frontend/` | Yes | Static export for desktop |
| React | 19.2.8 | UI | Yes | |
| Zustand | ^5.0.14 | `frontend/src/store/` | Yes | 4 stores + printer store |
| Tailwind CSS | ^4 | `globals.css` | Yes | CSS-first config |
| shadcn/ui | new-york style | `frontend/components/ui/` | Yes | Radix primitives |
| axios | ^1.18.1 | `frontend/src/lib/api.ts` | Yes | Same-origin API |
| Playwright | ^1.62.0 | `frontend/e2e/` | Yes | 3 E2E specs |
| lucide-react | ^1.27.0 | Icons | Yes | |

## Backend (main process)

| Technology | Version | Where used | Retain? | Notes |
|------------|---------|------------|---------|-------|
| Express | ^5.2.1 | All HTTP servers | Yes | v5 |
| better-sqlite3 | ^13.0.3 | `main/db.ts` | Yes | N-API stable; WAL mode |
| ws | ^8.21.2 | KDS WebSocket | Yes | |
| jsonwebtoken | ^9.0.2 | Auth | Yes | |
| bcryptjs | ^3.0.3 | Password/PIN hashing | Yes | |
| decimal.js | ^10.6.0 | Tax calculations | Yes | Precision |
| bonjour-service | ^1.4.4 | mDNS | Yes | |
| electron-updater | ^6.8.9 | Auto-update | Yes | |
| electron-log | ^5.4.4 | File logging | Yes | |
| @whiskeysockets/baileys | ^7.0.0-rc13 | WhatsApp | Caution | RC dependency |
| googleapis | ^173.0.0 | Drive backup | Yes | Optional feature |
| pino | ^10.3.1 | Baileys logging | Yes | |
| libphonenumber-js | ^1.13.10 | Phone normalization | Yes | Shared with frontend |
| qrcode | ^1.5.3 | Pairing QR codes | Yes | |
| uuid | ^14.0.1 | ID generation | Yes | |
| cors | ^2.8.5 | CORS middleware | Yes | |

## Printing

| Technology | Where | Notes |
|------------|-------|-------|
| Custom ESC/POS | `main/printers/thermal.ts` | Network TCP 9100, USB |
| @point-of-sale/receipt-printer-encoder | `frontend/src/lib/printer/` | WebUSB path |
| WebUSB API | `frontend/src/lib/printer/PrinterService.ts` | Browser-side |

## Database

| Aspect | Value |
|--------|-------|
| Engine | SQLite 3 (via better-sqlite3) |
| Mode | WAL (`journal_mode = WAL`) |
| ORM | None — raw SQL |
| Schema version | 66 |
| Migration location | `main/db.ts` MIGRATIONS array |

## Build & packaging

| Tool | Purpose |
|------|---------|
| tsc | Compile `main/` → `dist/` |
| electron-builder ^26.15.3 | Windows/macOS/Linux packages |
| cross-env | Desktop build mode flag |

Targets: NSIS, DMG/ZIP, AppImage, deb, rpm, Snap, AppX, Mac App Store.

## Testing

| Tool | Purpose |
|------|---------|
| Custom runner | `tests/run-test.sh`, `run-electron-node-test.cjs` |
| ts-node | Lightweight test execution |
| node:test | Some unit tests (tax, currency, phone) |
| supertest | HTTP integration tests |
| Playwright | Browser E2E |

**Coverage tooling:** c8 v10 (`npm run test:coverage:baseline`) — M1 baseline on auth/tax/payment modules.

## Infrastructure

| Item | Status |
|------|--------|
| Docker | NOT USED |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Package manager | npm (package-lock.json) |

## Hardware integrations (VERIFIED)

| Device | Support | Evidence |
|--------|---------|----------|
| ESC/POS receipt printers | USB, network, WebUSB | `main/printers/`, `docs/printers.md` |
| Bluetooth thermal printers | **NOT BUILT** | UI type stub; DB CHECK excludes bluetooth |
| Kitchen ticket printers | Same stack | KOT in `thermal.ts` |
| Barcode scanner | Keyboard wedge | `useBarcodeScanner.ts` |
| Cash drawer | NOT BUILT | No kick command found |
| Payment terminal | NOT BUILT | Manual methods only |
| Customer display | NOT BUILT | — |

## Replace vs retain recommendations

| Technology | Recommendation | Rationale |
|------------|----------------|-----------|
| SQLite + better-sqlite3 | **Retain** | Core offline-first design |
| Express monolith | **Retain** | Adequate for LAN POS |
| Next.js static export | **Retain** | Proven Electron integration |
| Baileys (WhatsApp) | **Monitor** | RC version; evaluate stability |
| Inline migrations in db.ts | **Retain short-term; split later** | Works but file is large |
