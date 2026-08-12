# API Specification

## CURRENT STATE

FloCafe exposes a REST JSON API on port **3001** (default).

**Legacy reference:** `docs/API.md` — contains known stale endpoints; verify against source before use.

**Route registry:** `main/routes/index.ts`

### Authentication endpoints
| Method | Path | Auth |
|--------|------|------|
| POST | /api/auth/login | Public |
| POST | /api/auth/logout | Bearer |
| POST | /api/auth/refresh | Bearer |
| GET | /api/auth/me | Bearer |
| POST | /api/auth/setup/initialize | Public (first-run) |
| GET | /api/auth/setup/status | Public (first-run) |
| GET | /api/health | Public |

Staff creation: **`POST /api/staff`** or **`POST /api/users`** (same router). There is **no** `POST /api/auth/register`.

### Core resource groups
| Prefix | Module |
|--------|--------|
| /api/categories | Menu categories |
| /api/products | Products + images + stock |
| /api/addon-groups | Modifiers |
| /api/orders | Order lifecycle |
| /api/bills | Billing and payments (incl. partial via `payment_status`) |
| /api/tables | Table management |
| /api/customers | CRM |
| /api/staff, /api/users | Staff management |
| /api/kitchen-stations | KDS stations |
| /api/kds | Kitchen display |
| /api/printers | Printing (network, usb, webusb) |
| /api/reports | Analytics |
| /api/settings | Configuration |
| /api/tax-packs | Tax configuration |
| /api/db, /api/db-tools | Database management |
| /api/held-orders | Held carts |
| /api/whatsapp | WhatsApp integration |
| /api/audit-logs | Business audit trail (owner/manager read) |

### GET /api/audit-logs

**Auth:** Bearer, `owner` or `manager`

**Query:** `limit` (1–500, default 100), `offset`, `action`, `entity_type`, `entity_id`, `actor_user_id`, `since`

**Response:** `{ audit: AuditLogEntry[] }` — newest first

Full endpoint list: see `03-architecture/backend-architecture.md` and source files in `main/routes/`.

## TARGET STATE
- Auto-generated OpenAPI 3.1 spec (PROPOSED)
- Webhook documentation in `webhooks.md` (NOT IMPLEMENTED)
