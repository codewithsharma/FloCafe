# API Specification

## CURRENT STATE

FloCafe exposes a REST JSON API on port **3001** (default).

**Existing reference:** `docs/API.md` (may drift — verify against `main/routes/`)

**Route registry:** `main/routes/index.ts`

### Authentication endpoints
| Method | Path | Auth |
|--------|------|------|
| POST | /api/auth/login | Public |
| POST | /api/auth/logout | Bearer |
| POST | /api/auth/refresh | Bearer |
| GET | /api/auth/me | Bearer |
| POST | /api/auth/setup/initialize | Public (first-run) |
| GET | /api/health | Public |

### Core resource groups
| Prefix | Module |
|--------|--------|
| /api/categories | Menu categories |
| /api/products | Products + images + stock |
| /api/addon-groups | Modifiers |
| /api/orders | Order lifecycle |
| /api/bills | Billing and payments |
| /api/tables | Table management |
| /api/customers | CRM |
| /api/staff, /api/users | Staff management |
| /api/kitchen-stations | KDS stations |
| /api/kds | Kitchen display |
| /api/printers | Printing |
| /api/reports | Analytics |
| /api/settings | Configuration |
| /api/tax-packs | Tax configuration |
| /api/db, /api/db-tools | Database management |
| /api/held-orders | Held carts |
| /api/whatsapp | WhatsApp integration |

Full endpoint list: see backend architecture report in `03-architecture/backend-architecture.md` and source files in `main/routes/`.

## TARGET STATE
- Auto-generated OpenAPI 3.1 spec (PROPOSED)
- Webhook documentation in `webhooks.md` (NOT IMPLEMENTED)
