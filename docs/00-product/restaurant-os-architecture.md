<!-- Last updated: 2026-08-15, schema v75 -->

# Operavia Restaurant OS — Architecture (domains & dependencies)

**Status:** Logical architecture for complete Restaurant OS (docs only)  
**Runtime today:** Electron + Express monolith + SQLite WAL + static Next.js (ADR-001–005, ADR-010 modules)  
**SoR:** SQLite local database. KDS / printers / cloud are **projections or outbound**.  
**Blueprint:** [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md)

Do **not** split into microservices for R0–R3. Prefer module/domain boundaries inside the monolith (`main/modules/`, services, routes).

---

## Domain boundaries

| Domain             | Owns                                                                    | Must not own                                                       |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **POS / Order**    | Cart, order lines, modifiers, notes, lifecycle, holds, splits           | Final money ledger (delegates to Payment)                          |
| **Payment**        | Tenders, partial/split pay, idempotency, FIN-01 outstanding             | Kitchen status                                                     |
| **Kitchen**        | KDS projection, item prep status, stations (future), KOT print requests | Order money, inventory ledger writes except via inventory services |
| **Table / Floor**  | Tables, sections, occupancy, transfer/merge (future)                    | Payments                                                           |
| **Inventory**      | SKU/ingredient stock, movements, adjustments, wastage, valuation        | Recipes definition (Recipe domain)                                 |
| **Recipe**         | BOM, yield, versions, theoretical cost                                  | Live stock counts                                                  |
| **Purchasing**     | Suppliers, PO, receiving, purchase returns                              | Customer CRM                                                       |
| **Customer**       | Profiles, preferences, history links                                    | Loyalty points engine edge cases → Loyalty                         |
| **Loyalty**        | Points, wallet, cashback rules                                          | Tax engine                                                         |
| **Staff**          | Users, roles, PIN policies, shifts, attendance (future)                 | Bill totals                                                        |
| **Finance**        | Shift recon, day close/Z, expenses (future), financial reports inputs   | Menu editing                                                       |
| **Reporting**      | Read models / aggregations                                              | Mutations                                                          |
| **Integration**    | Printers, WhatsApp, Drive, FloAdmin adapters                            | Business rules                                                     |
| **Administration** | Settings, tax packs, printers config, backup triggers                   | Direct silent money edits                                          |

### Cross-cutting

- **AuthZ:** server `requireRole` / future fine-grained permissions; UI mirrors.
- **Audit:** `audit_logs` (+ print_logs).
- **Tax:** tax service facade; snapshots on bills.
- **Idempotency:** payments/refunds mandatory; expand per financial contract.

---

## Dependency graph

```text
MENU / CATALOG
    ↓
ORDERS (POS)
    ├──────────────→ TABLES / FLOOR
    ├──────────────→ KITCHEN (KDS/KOT)     [projection only]
    ↓
PAYMENT / BILLS
    ↓
FINANCE (shifts, Z, recon)
    ↓
REPORTING

INGREDIENTS / SKUs
    ↓
INVENTORY LEDGER
    ↑
RECIPES / BOM ──→ FOOD COST ──→ REPORTING
    ↓
PURCHASING (PO / receive)

CUSTOMERS
    ↓
LOYALTY / WALLET
    ↓
MARKETING

STAFF / ROLES / SHIFTS ──→ (gates) ORDERS, PAYMENT, INVENTORY, ADMIN

INTEGRATIONS (print, WA, Drive) ← consume events; never block billing
```

### Critical path for service day

`OPEN SHIFT → ORDER → (TABLE) → KDS → PAY → RECEIPT → COMPLETE → CLOSE SHIFT → Z → BACKUP`

Inventory deduction and recipe explode must be **deterministic and transactional** with order/pay paths when R4/R5 land.

---

## Role model (product capabilities)

| Role              | Single-location now        | Complete OS                   |
| ----------------- | -------------------------- | ----------------------------- |
| Owner             | Yes                        | Yes                           |
| Manager           | Yes                        | Yes                           |
| Cashier           | Yes                        | Yes                           |
| Waiter            | Yes                        | Yes                           |
| Chef              | Yes                        | Yes                           |
| Inventory Manager | No (Owner/Manager cover)   | Planned product role          |
| Accountant        | No (Owner/Manager reports) | Planned product role          |
| Admin             | Overlaps Owner today       | Optional platform admin later |

**Do not auto-create** Inventory Manager / Accountant / Admin in production until an authorized R8 slice defines schema + RBAC.

Sensitive actions today: see OPS-01 configuration + H3. Future fine-grained matrix stays Planned.

---

## Multi-location readiness

- **Readiness (docs/ADR):** allowed as planning (ADR-006 first).
- **Implementation:** 🔴 Frozen until STRATEGY/matrix unfreeze.
- Domains must avoid hard-coding “one café forever” in new schemas where cheap (e.g. nullable `location_id` only after ADR).

---

## Technology stance

| Keep                          | Avoid (unless ADR)            |
| ----------------------------- | ----------------------------- |
| Electron desktop              | Premature mobile-only rewrite |
| SQLite SoR                    | Cloud SoR for billing         |
| Express monolith + modules    | Microservices/K8s             |
| Cent-precision money math     | Float for money               |
| Local backup + optional Drive | Drive-only backup             |
