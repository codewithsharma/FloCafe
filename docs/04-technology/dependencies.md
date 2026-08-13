# Dependencies

See `04-technology/tech-stack.md` for version inventory.

## Root `package.json` (production)

| Package                 | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| better-sqlite3          | Database                                    |
| express                 | HTTP servers                                |
| ws                      | WebSocket                                   |
| jsonwebtoken            | Auth tokens                                 |
| bcryptjs                | Password hashing                            |
| decimal.js              | Tax precision                               |
| electron-log            | Electron main logging                       |
| electron-updater        | Auto-update                                 |
| @whiskeysockets/baileys | WhatsApp                                    |
| googleapis              | Drive backup                                |
| bonjour-service         | mDNS                                        |
| cors                    | CORS                                        |
| libphonenumber-js       | Phone parsing                               |
| pino                    | Structured logging                          |
| pino-http               | HTTP request logging                        |
| helmet                  | Security headers                            |
| compression             | Thresholded API compression                 |
| zod                     | Boundary validation                         |
| date-fns                | Business-day / reporting dates              |
| @opentelemetry/api      | Tracing foundation (noop without collector) |
| qrcode                  | QR generation                               |
| uuid                    | ID generation                               |

## Frontend `package.json` (production)

| Package                                | Purpose                                 |
| -------------------------------------- | --------------------------------------- |
| next, react, react-dom                 | UI framework                            |
| zustand                                | Client/UI state                         |
| @tanstack/react-query                  | Server/API state                        |
| axios                                  | HTTP client                             |
| i18next, react-i18next                 | i18n foundation (namespaced locales)    |
| date-fns                               | Client date ranges / formatting helpers |
| radix-ui                               | Accessible primitives                   |
| @point-of-sale/receipt-printer-encoder | ESC/POS encoding                        |
| @dnd-kit/*                             | KDS drag-and-drop                       |
| lucide-react                           | Icons                                   |
| libphonenumber-js                      | Phone (shared logic)                    |
| sharp                                  | Image processing                        |
| react-hot-toast                        | Notifications                           |

## Dependency policy (TARGET)

- Pin Electron and better-sqlite3 carefully
- Avoid RC dependencies in critical path (Baileys — monitor)
- Run `npm audit` in CI (dependency-review workflow)
