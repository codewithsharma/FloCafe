# Dependencies

See `04-technology/tech-stack.md` for version inventory.

## Root `package.json` (production)

| Package | Purpose |
|---------|---------|
| better-sqlite3 | Database |
| express | HTTP servers |
| ws | WebSocket |
| jsonwebtoken | Auth tokens |
| bcryptjs | Password hashing |
| decimal.js | Tax precision |
| electron-log | Logging |
| electron-updater | Auto-update |
| @whiskeysockets/baileys | WhatsApp |
| googleapis | Drive backup |
| bonjour-service | mDNS |
| cors | CORS |
| libphonenumber-js | Phone parsing |
| pino | Structured logging (Baileys) |
| qrcode | QR generation |
| uuid | ID generation |

## Frontend `package.json` (production)

| Package | Purpose |
|---------|---------|
| next, react, react-dom | UI framework |
| zustand | State |
| axios | HTTP client |
| radix-ui | Accessible primitives |
| @point-of-sale/receipt-printer-encoder | ESC/POS encoding |
| @dnd-kit/* | KDS drag-and-drop |
| lucide-react | Icons |
| libphonenumber-js | Phone (shared logic) |
| sharp | Image processing |
| react-hot-toast | Notifications |

## Dependency policy (TARGET)
- Pin Electron and better-sqlite3 carefully
- Avoid RC dependencies in critical path (Baileys — monitor)
- Run `npm audit` in CI (dependency-review workflow)
