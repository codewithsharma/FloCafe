<!-- Last updated: 2026-08-21, schema v88 -->

# Operavia Restaurant — capability matrix

**Canonical product plan** for Operavia Restaurant (repo: FloCafe). Adopted 2026-08-14.
**Complete Restaurant OS blueprint (R0):** [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md) · roadmap [`restaurant-os-roadmap.md`](restaurant-os-roadmap.md) · architecture [`restaurant-os-architecture.md`](restaurant-os-architecture.md). R-waves do **not** replace this matrix’s status column.

This matrix is the backlog and posture for what we keep, harden, build, defer, or freeze. It does **not** authorize implementation. Do not invent Phase 4.16. Prefer **R0–R16** sequencing in the Restaurant OS roadmap for post-4.15 work. Execute only an explicitly authorized slice.

**Code evidence** (what is actually in the tree) remains [`feature-list.md`](feature-list.md). If this plan and the code disagree, **do not rebuild** a shipped slice — deepen it, or update this matrix.

**Strategy freeze** still applies: [`STRATEGY.md`](../../STRATEGY.md). Frozen rows here match that freeze. **Active development vertical:** Restaurant only (Retail/other verticals deferred).

**R0 note (2026-08-15):** Blueprint documents the complete Restaurant OS. **No row statuses were promoted** to Existing solely because of R0. H1–H4 remain Hardening depth where listed. Live pilot remains OPS-02 **NO-GO** until signed RC + site gates.

**R5–R8 note (2026-08-15):** R5 BOM (v79), R6 purchasing (v80), R7 CRM (v82), R8 staff workforce — **COMPLETE**.
**RCP-05 note (2026-08-21):** Recipe consumptions list UI **COMPLETE** (`/products/recipes/consumptions`); Consumption reports → Existing (thin). Schema tip remains **v88**. Advanced actual-vs-theoretical BI remains Later.
**R9 Slice 1 note (2026-08-15):** Expenses **COMPLETE** — schema tip **v83**.
**R9 Slice 2 note (2026-08-15):** Financial Audit-Trail Hardening **COMPLETE** — schema tip remains **v83**.
**R9 Slice 3 note (2026-08-15):** Tax Reporting Depth + Accountant Export **COMPLETE** — schema tip remains **v83**.
**R9 Slice 4 note (2026-08-15):** Day-close / Z Polish **COMPLETE** — schema tip remains **v83**.
**R9 Slice 5 note (2026-08-15):** Operations Finance Reports v1 **COMPLETE** — schema tip remains **v83**.
**R9 Slice 6 note (2026-08-15):** Food-cost Report v1 **COMPLETE** — schema tip remains **v83**.
**R9 COMPLETE (2026-08-15).** Live go-live still **NO-GO** (OPS-02). ADR-014 service charge remains out. **R10 Online / QR COMPLETE (2026-08-15)** — schema v84; pay-at-counter only.
**R11 note (2026-08-15):** Coupon codes thin deepen **COMPLETE** — schema **v85**; `npm run test:r11`. Marketing campaigns remain Later.
**R13 note (2026-08-15):** Print queue / retry thin deepen **COMPLETE** — schema **v86** `print_jobs`; `npm run test:r13`. Terminals / aggregators remain Frozen.
**R12 note (2026-08-15):** Void/Cancel report thin deepen **COMPLETE** — no schema bump; `npm run test:r12`. Advanced BI warehouse remains Later.
---

## Legend

| Mark | Status               | Meaning                                                                          |
| ---- | -------------------- | -------------------------------------------------------------------------------- |
| 🟢   | Existing             | Shipped and accepted as done for v1. Do not rebuild.                             |
| 🟡   | Hardening            | Present but not yet reliable/complete enough. Prefer this over new Planned work. |
| 🔵   | Planned              | In initial product scope. Needs an authorized slice before code.                 |
| ⚪   | Later                | Out of the initial wave. Do not start unless the matrix is updated.              |
| 🔴   | Frozen               | Blocked by strategy/pilot gates. No design-as-implementation, no silent revival. |
| 🔴   | Out of initial scope | Explicitly not in Restaurant v1 (e.g. payroll).                                  |

---

## POS

| Feature                    | Status       |
| -------------------------- | ------------ |
| Order creation             | 🟢 Existing  |
| Order items                | 🟢 Existing  |
| Cart                       | 🟢 Existing  |
| Order lifecycle/status     | 🟢 Existing  |
| Order updates              | 🟢 Existing  |
| Order cancellation         | 🟢 Existing  |
| Customer/order information | 🟢 Existing  |
| Held orders                | 🟢 Existing  |
| Prepaid orders             | 🟢 Existing  |
| Split orders/checks        | 🟢 Existing  |
| Modifiers                  | 🟢 Existing  |
| Menu management            | 🟢 Existing  |
| Categories                 | 🟢 Existing  |
| Item availability / 86     | 🔵 Planned   |
| Item notes                 | 🔵 Planned   |
| Combos / meal deals        | 🔵 Planned   |
| Course management          | 🔵 Planned   |
| Order priority             | 🔵 Planned   |
| Reopen order               | 🔵 Planned   |
| Void item                  | 🔵 Planned   |
| Void order                 | 🟡 Hardening |
| Discounts                  | 🟡 Hardening |
| Coupons                    | 🟢 Existing  |
| Promotions                 | 🔵 Planned   |
| Tax calculation            | 🟢 Existing  |
| Service charge             | 🔵 Planned   |
| Takeaway orders            | 🟢 Existing  |
| Dine-in orders             | 🟢 Existing  |
| Delivery orders            | 🟢 Existing  |
| Order source tracking      | 🔵 Planned   |
| Receipt generation         | 🟡 Hardening |
| Receipt reprint            | 🟢 Existing  |
| Digital receipt            | 🔵 Planned   |

## Menu

| Feature                | Status      |
| ---------------------- | ----------- |
| Menu creation          | 🟢 Existing |
| Categories             | 🟢 Existing |
| Items                  | 🟢 Existing |
| Pricing                | 🟢 Existing |
| Modifiers              | 🟢 Existing |
| Modifier groups        | 🔵 Planned  |
| Multiple menus         | 🔵 Planned  |
| Time-based menus       | 🔵 Planned  |
| Item availability      | 🔵 Planned  |
| Sold-out / 86 control  | 🔵 Planned  |
| Combo management       | 🔵 Planned  |
| Recipe-linked items    | 🟢 Existing |
| Item images            | 🔵 Planned  |
| Item descriptions      | 🔵 Planned  |
| Channel-specific menus | ⚪ Later    |
| Bulk menu editing      | ⚪ Later    |

## Payments

| Feature                     | Status      |
| --------------------------- | ----------- |
| Cash payment                | 🟢 Existing |
| Card payment recording      | 🟢 Existing |
| UPI payment recording       | 🟢 Existing |
| Manual tender               | 🟢 Existing |
| Split payment               | 🟢 Existing |
| Partial payment             | 🔵 Planned  |
| Payment status              | 🟢 Existing |
| Refund                      | 🟢 Existing |
| Refund idempotency          | 🟢 Existing |
| Restock on refund           | 🟢 Existing |
| Payment reconciliation      | 🟢 Existing |
| Shift cash reconciliation   | 🟢 Existing |
| Z-report                    | 🟢 Existing |
| End-of-day settlement       | 🟢 Existing |
| Card terminal integration   | 🔴 Frozen   |
| Payment gateway integration | 🔴 Frozen   |
| Automated UPI verification  | ⚪ Later    |
| Tips                        | ⚪ Later    |
| Pay-at-table                | ⚪ Later    |

## Restaurant / Tables

| Feature                  | Status      |
| ------------------------ | ----------- |
| Table CRUD               | 🟢 Existing |
| Table status             | 🟢 Existing |
| Table movement           | 🟢 Existing |
| Table assignment         | 🟢 Existing |
| Table orders             | 🟢 Existing |
| Table split              | 🟢 Existing |
| Transfer table           | 🟢 Existing |
| Split bill               | 🟢 Existing |
| Visual floor plan        | 🔵 Planned  |
| Sections                 | 🟢 Existing |
| Merge tables             | 🟢 Existing |
| Seat management          | 🔵 Planned  |
| Reservations             | ⚪ Later    |
| Waitlist                 | ⚪ Later    |
| Table turnover analytics | ⚪ Later    |

## KDS

| Feature                    | Status       |
| -------------------------- | ------------ |
| KDS integration            | 🟢 Existing  |
| Order update notifications | 🟢 Existing  |
| KDS notification gating    | 🟢 Existing  |
| Order queue                | 🟢 Existing  |
| Item status                | 🟢 Existing  |
| Preparing status           | 🟢 Existing  |
| Ready status               | 🟢 Existing  |
| Completed status           | 🟢 Existing  |
| Kitchen routing            | 🟢 Existing  |
| Multiple stations          | 🟢 Existing  |
| Prep station               | 🟢 Existing  |
| Expediter                  | 🔵 Planned   |
| Priority queue             | 🟢 Existing  |
| Ticket timers              | 🟢 Existing  |
| Prep-time tracking         | 🟢 Existing  |
| KDS analytics              | 🔵 Planned   |
| Offline KDS                | 🟡 Hardening |
| KDS recovery               | 🟡 Hardening |
| Sound alerts               | 🟢 Existing  |
| Visual alerts              | 🟢 Existing  |

## Printing / Hardware

| Feature                  | Status      |
| ------------------------ | ----------- |
| Thermal receipt printer  | 🟢 Existing |
| ESC/POS                  | 🟢 Existing |
| 58mm printer             | 🟢 Existing |
| 80mm printer             | 🟢 Existing |
| Kitchen printer          | 🟢 Existing |
| KOT printing             | 🟢 Existing |
| Multiple printer routing | 🔵 Planned  |
| Bar printer              | 🔵 Planned  |
| Print queue              | 🟢 Existing |
| Print retry              | 🟢 Existing |
| Printer health           | 🟢 Existing |
| Printer recovery         | 🟢 Existing |
| Bluetooth printing       | ⚪ Later    |
| Cash drawer              | 🔵 Planned  |
| Barcode scanner          | ⚪ Later    |
| Weighing scale           | ⚪ Later    |
| Card terminal            | 🔴 Frozen   |

## Inventory

| Feature                  | Status      |
| ------------------------ | ----------- |
| SKU/item quantity        | 🟢 Existing |
| Stock ledger             | 🟢 Existing |
| Low-stock alerts         | 🟢 Existing |
| Stock adjustment         | 🟢 Existing |
| Stock movement           | 🟢 Existing |
| Ingredient inventory     | 🟢 Existing |
| Recipe / BOM             | 🟢 Existing |
| Ingredient deduction     | 🟢 Existing |
| Food costing             | 🟢 Existing |
| Purchase orders          | 🟢 Existing |
| Goods receiving          | 🟢 Existing |
| Supplier management      | 🟢 Existing |
| Supplier pricing         | 🟢 Existing |
| Partial receiving        | 🟢 Existing |
| Purchase inventory link  | 🟢 Existing |
| Stock transfer           | 🔵 Planned  |
| Waste management         | 🟢 Existing |
| Expiry tracking          | 🔵 Planned  |
| Inventory count          | 🟢 Existing |
| Inventory reconciliation | 🟢 Existing |
| Consumption reports      | 🟢 Existing |
| Food-cost percentage     | 🟢 Existing |
| Auto-86 from stock       | 🟢 Existing |
| Demand forecasting       | ⚪ Later    |

## CRM

| Feature                 | Status      |
| ----------------------- | ----------- |
| Customer profile        | 🟢 Existing |
| Phone number            | 🟢 Existing |
| E.164 handling          | 🟢 Existing |
| Customer history        | 🟢 Existing |
| Customer lifecycle      | 🟢 Existing |
| Purchase history        | 🟢 Existing |
| Visit frequency         | 🟢 Existing |
| Customer segmentation   | 🟢 Existing |
| Customer preferences    | 🟢 Existing |
| Customer lifetime value | 🟢 Existing |
| Birthday / anniversary  | ⚪ Later    |
| Customer feedback       | ⚪ Later    |

## Loyalty

| Feature             | Status      |
| ------------------- | ----------- |
| Points              | 🟢 Existing |
| Wallet              | 🟢 Existing |
| Cashback            | 🟢 Existing |
| Rewards             | 🔵 Planned  |
| Redemption rules    | 🔵 Planned  |
| Gift cards          | 🔵 Planned  |
| Digital gift cards  | 🔵 Planned  |
| Coupons             | 🟢 Existing |
| Promotions          | 🔵 Planned  |
| Happy-hour pricing  | ⚪ Later    |
| Marketing campaigns | ⚪ Later    |

## Staff

| Feature            | Status                  |
| ------------------ | ----------------------- |
| Owner role         | 🟢 Existing             |
| Manager role       | 🟢 Existing             |
| Cashier role       | 🟢 Existing             |
| Waiter role        | 🟢 Existing             |
| Chef role          | 🟢 Existing             |
| PIN authentication | 🟢 Existing             |
| Roles              | 🟢 Existing             |
| Permissions        | 🟡 Hardening            |
| Staff activity     | 🟢 Existing             |
| Shift management   | 🟢 Existing             |
| Cash attribution   | 🟢 Existing             |
| Attendance         | 🔵 Planned              |
| Scheduling         | ⚪ Later                |
| Tips               | ⚪ Later                |
| Payroll            | 🔴 Out of initial scope |

R8 (2026-08-15) deepened Existing staff management (search/filter, detail, shift visibility / currently working, audits) without promoting Attendance, Scheduling, Tips, or Payroll. See `docs/05-production/r8-staff-workforce-os.md`.

## Digital Ordering

| Feature                 | Status              |
| ----------------------- | ------------------- |
| QR menu                 | 🟢 Existing (R10)   |
| QR ordering             | 🟢 Existing (R10)   |
| Table QR                | 🟢 Existing (R10)   |
| Self-ordering           | 🔵 Planned          |
| Kiosk                   | ⚪ Later            |
| Branded online ordering | ⚪ Later            |
| Pickup ordering         | ⚪ Later            |
| Delivery ordering       | ⚪ Later            |
| Online payment          | 🔴 Frozen initially |
| Order-ahead             | ⚪ Later            |
| Customer notifications  | 🔵 Planned          |

## Delivery

| Feature                       | Status      |
| ----------------------------- | ----------- |
| Delivery order type           | 🟢 Existing |
| Delivery customer information | 🟢 Existing |
| Delivery tax                  | 🟢 Existing |
| Rider management              | 🔵 Planned  |
| Delivery status               | 🔵 Planned  |
| Delivery tracking             | ⚪ Later    |
| Aggregator integration        | ⚪ Later    |
| Swiggy integration            | ⚪ Later    |
| Zomato integration            | ⚪ Later    |
| Uber Eats integration         | ⚪ Later    |
| DoorDash integration          | ⚪ Later    |

## Reports

| Feature              | Status      |
| -------------------- | ----------- |
| Daily sales          | 🟢 Existing |
| Order report         | 🟢 Existing |
| Tax report           | 🟢 Existing |
| Z-report             | 🟢 Existing |
| CSV export           | 🟢 Existing |
| Payment report       | 🟢 Existing |
| Product performance  | 🟢 Existing |
| Category performance | 🟢 Existing |
| Discount report      | 🟢 Existing |
| Void report          | 🟢 Existing |
| Staff report         | 🟢 Existing |
| Shift report         | 🟢 Existing |
| Cash reconciliation  | 🟢 Existing |
| Inventory report     | 🟢 Existing |
| Food-cost report     | 🟢 Existing |
| Profitability        | 🔵 Planned  |
| KDS performance      | 🔵 Planned  |
| Customer analytics   | 🔵 Planned  |
| Management dashboard | 🔵 Planned  |
| Advanced BI          | ⚪ Later    |
| AI analytics         | ⚪ Later    |

## Offline

| Feature                     | Status       |
| --------------------------- | ------------ |
| SQLite as system of record  | 🟢 Existing  |
| Offline billing             | 🟢 Existing  |
| Offline order creation      | 🟢 Existing  |
| Local persistence           | 🟢 Existing  |
| Sync queue                  | 🟢 Existing  |
| Reconnect / synchronization | 🟢 Existing  |
| Retry                       | 🟢 Existing  |
| Duplicate prevention        | 🟢 Existing  |
| Conflict handling           | 🟡 Hardening |
| App restart recovery        | 🟡 Hardening |
| Device failure recovery     | 🔵 Planned   |
| KDS offline behavior        | 🟡 Hardening |
| Printer recovery            | 🟢 Existing  |
| Cloud non-blocking billing  | 🟢 Existing  |
| Offline tax verification    | 🟢 Existing  |

## Tax / Compliance

| Feature                  | Status      |
| ------------------------ | ----------- |
| GST calculation          | 🟢 Existing |
| Signed tax packs         | 🟢 Existing |
| Offline tax verification | 🟢 Existing |
| Tax reporting            | 🟢 Existing |
| Expenses (R9 Slice 1)    | 🟢 Existing |
| E-invoicing              | ⚪ Later    |
| Filing exports           | ⚪ Later    |

## Security

| Feature                   | Status       |
| ------------------------- | ------------ |
| Authentication            | 🟢 Existing  |
| Authorization             | 🟡 Hardening |
| Role-based access         | 🟡 Hardening |
| Sensitive-action controls | 🟢 Existing  |
| Audit trail               | 🟢 Existing  |
| Financial auditability    | 🟢 Existing  |

## Reliability

| Feature                | Status       |
| ---------------------- | ------------ |
| Error handling         | 🟡 Hardening |
| Health checks          | 🔵 Planned   |
| Error monitoring       | 🔵 Planned   |
| Structured logging     | 🔵 Planned   |
| Operational monitoring | 🔵 Planned   |
| Backup                 | 🟢 Existing  |
| Restore                | 🟡 Hardening |
| Disaster recovery      | 🔵 Planned   |
| Data integrity checks  | 🟡 Hardening |
| Recovery procedures    | 🟢 Existing  |

## Integrations

| Feature                          | Status      |
| -------------------------------- | ----------- |
| FloAdmin sync                    | 🟢 Existing |
| WhatsApp transactional messaging | 🟢 Existing |
| Google Drive backup              | 🟢 Existing |
| RevFlo                           | 🟢 Existing |
| Public API                       | ⚪ Later    |
| QuickBooks                       | ⚪ Later    |
| Tally                            | ⚪ Later    |
| Accounting integrations          | ⚪ Later    |
| Swiggy                           | ⚪ Later    |
| Zomato                           | ⚪ Later    |
| Delivery providers               | ⚪ Later    |
| Integration marketplace          | ⚪ Later    |

## Architecture

| Feature                       | Status      |
| ----------------------------- | ----------- |
| Restaurant vertical           | 🟢 Existing |
| Vertical isolation            | 🟢 Existing |
| Fail-closed vertical loading  | 🟢 Existing |
| `ACTIVE_VERTICAL_ID`          | 🟢 Existing |
| Shared platform foundation    | 🟢 Existing |
| Modular vertical architecture | 🟢 Existing |

## Data

| Feature                      | Status       |
| ---------------------------- | ------------ |
| Restaurant schema/data model | 🟢 Existing  |
| Data integrity validation    | 🟡 Hardening | P13 deepened targeted mutation audits; full integrity warehouse still open      |
| Audit logging                | 🟡 Hardening | P13 closed critical post-commit / missing-audit gaps; DB deny-triggers deferred |

## Branding

| Feature           | Status      |
| ----------------- | ----------- |
| Operavia branding | 🟢 Existing |

## Operations

| Feature                 | Status      |
| ----------------------- | ----------- |
| Deployment runbook      | 🟢 Existing |
| Pilot support procedure | 🟢 Existing |
| Incident procedure      | 🔵 Planned  |
| End-of-day procedure    | 🟢 Existing |
| Device setup procedure  | 🔵 Planned  |

## Testing

| Feature                     | Status      |
| --------------------------- | ----------- |
| Unit test foundation        | 🟢 Existing |
| Integration test foundation | 🟢 Existing |
| POS workflow tests          | 🔵 Planned  |
| Payment workflow tests      | 🔵 Planned  |
| KDS workflow tests          | 🟢 Existing |
| Printing tests              | 🔵 Planned  |
| Offline/reconnect tests     | 🔵 Planned  |
| Recovery tests              | 🔵 Planned  |
| Inventory integrity tests   | 🟢 Existing |
| End-to-end restaurant tests | 🔵 Planned  |
| Pilot acceptance tests      | 🔵 Planned  |

## Multi-location

| Feature                   | Status      |
| ------------------------- | ----------- |
| Single-location operation | 🟢 Existing |
| Multi-location            | 🔴 Frozen   |
| Central menu              | 🔴 Frozen   |
| Central inventory         | 🔴 Frozen   |
| Inter-store transfers     | 🔴 Frozen   |
| Central reporting         | 🔴 Frozen   |
| Franchise management      | 🔴 Frozen   |

## Advanced

| Feature                 | Status   |
| ----------------------- | -------- |
| AI business assistant   | ⚪ Later |
| Demand forecasting      | ⚪ Later |
| AI menu optimization    | ⚪ Later |
| AI purchasing           | ⚪ Later |
| Voice ordering          | ⚪ Later |
| Self-order kiosk        | ⚪ Later |
| Customer-facing display | ⚪ Later |
| Reservations            | ⚪ Later |
| Waitlist                | ⚪ Later |
| Catering                | ⚪ Later |
| Events / banquets       | ⚪ Later |
| Central kitchen         | ⚪ Later |

---

## Execution order (when a slice is authorized)

1. **Human/pilot gates** still block live café (signed RC, OPS-01, PIN escrow, drills). Do not substitute feature work for those.
2. **🟡 Hardening** before new 🔵 Planned surfaces.
3. **🔵 Planned** only as an explicit phase/prompt — one slice, reuse existing APIs, no silent schema/money-path.
4. **⚪ Later** and **🔴 Frozen / out of scope** stay closed.

### Hardening cluster (prefer next)

- POS: void order, discounts, receipt generation — **H1 (2026-08-15) closed audit + paid-tender guards + print-bill `print_logs`**; remaining depth below
- KDS: offline KDS, KDS recovery — **H2 (2026-08-15) closed live-companion advertise, stale-board UX, one silent status retry on reconnect**; remaining depth below
- Staff: permissions — **H3 (2026-08-15) closed cancel/restore/status `requireRole` + POS discount UI + Settings deep-link**; remaining depth below
- Offline: conflict handling, app restart recovery, KDS offline behavior — **H2 covers KDS; H4 (2026-08-15) closed cancel TOCTOU + item cancel/restore conflict guards**; remaining depth below
- Security: authorization, role-based access — **H3 (2026-08-15) closed same RBAC depth + test DB-role parity**; audit trail still open
- Reliability: error handling, restore — **H4 (2026-08-15) closed create-time backup integrity + backup/restore audit**; remaining depth below
- Data: integrity validation, audit logging

### H1 delivered depth (2026-08-15)

| Row                | Still        | H1 closed                                                                                                                                                      |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Void order         | 🟡 Hardening | Full-order cancel writes `order.cancelled` audit; paid cancel already 409                                                                                      |
| Void item          | 🔵 Planned   | Paid tender now blocks item cancel (409); in-progress void audit already existed                                                                               |
| Discounts          | 🟡 Hardening | `order.discount_applied` audit; discount blocked after successful tender                                                                                       |
| Receipt generation | 🟡 Hardening | Successful `POST /printers/print-bill` writes `print_logs` + `printed_at`; failed print does not log; Orders UI skips duplicate client log when `print_logged` |

Remaining after H1 (not falsely marked Existing): cancel/discount Idempotency-Key, void reports, item-discount UI, digital receipt product, browser/WebUSB POS auto-print log parity.

### H2 delivered depth (2026-08-15)

| Row                  | Still        | H2 closed                                                                                                                             |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Offline KDS          | 🟡 Hardening | No dead-port LAN advertise (`kds-info` 503 + mDNS omit) when companion stopped; board keeps last-known orders with stale label        |
| KDS recovery         | 🟡 Hardening | Companion restart restores advertise; WS/REST reconnect resync; one silent chef status PATCH retry after reconnect; CAS 409 preserved |
| KDS offline behavior | 🟡 Hardening | Same advertise + stale UX + reconnect retry as above                                                                                  |

Remaining after H2 (not falsely marked Existing): durable offline ticket outbox, exponential reconnect backoff, kitchen routing/stations/timers (Planned), POS-wide conflict/restore (separate Hardening).

### H3 delivered depth (2026-08-15)

| Row               | Still        | H3 closed                                                                                                                           |
| ----------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Permissions       | 🟡 Hardening | Item cancel `requireRole` O/M/C/W; restore O/M; order-items status chef/M/O; POS discount UI owner/manager; Settings deep-link gate |
| Authorization     | 🟡 Hardening | Same server `requireRole` + UI gates; test `createApp` uses DB role over JWT claim                                                  |
| Role-based access | 🟡 Hardening | Role gates aligned on cancel/restore/status + discount/settings; no auth rewrite                                                    |

Remaining after H3 (not falsely marked Existing): authz-denial audit flood; cashier in-progress void UI; manager settings save UX quirks; broader audit-trail Hardening. **Sensitive-action controls closed by P15 (2026-08-21)** — see `docs/qa/P15-SENSITIVE-ACTION-CONTROLS-IMPLEMENTATION-REPORT.md`.

### H4 delivered depth (2026-08-15)

| Row                  | Still        | H4 closed                                                                                                                                                         |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conflict handling    | 🟡 Hardening | H4 cancel/restore guards + **P14** order-status CAS (`expected_status` / monotonicity → `409 ORDER_STATUS_CONFLICT`); payment complete cannot overwrite cancelled |
| App restart recovery | 🟡 Hardening | Restore audit + create-time backup integrity; **P14** POS sticky-attempt clear on permanent/409; stock adjust stable Idempotency-Key across retry                 |
| Restore              | 🟡 Hardening | Backup integrity before success; `backup.created` / `restore.completed                                                                                            | failed` audits |

Remaining after H4/P14 (not falsely marked Existing): disaster recovery (Planned); Device failure recovery (Planned). Drive backup-now PIN closed R4.1; durable KDS outbox closed P4; stock adjust server idempotency closed R4 (+ P14 FE key stability); order-status CAS closed P14 (Hardening deepen, not full offline DR).

**P14 POS / Offline Conflict Hardening (2026-08-21):** No schema bump (v88). Suite `npm run test:p14`. Plan/report under `docs/qa/P14-*`. Conflict handling / App restart recovery remain 🟡 Hardening.

**R14 thin deepen (2026-08-15):** Corrupt-openable live DB fail-closed latched via install-state `corrupt_database` + schema-health integrity — see [`docs/05-production/r14-corrupt-db-fail-closed.md`](../05-production/r14-corrupt-db-fail-closed.md). Data integrity checks → 🟡 Hardening. Does not promote Disaster recovery → Existing.

### OPS-01 operations closure (2026-08-15)

Pilot **release/ops documentation** closed for baseline `24966ba` (config, runbook, checklist, gates, drill evidence). Does **not** promote H1–H4 rows to Existing. Does **not** create Phase 4.16. Live café still requires signed RC + human sign-off gates. Docs: `docs/05-production/ops-01-pilot-release-operations-closure.md`, `docs/13-operations/ops-01-pilot-configuration.md`, `docs/16-release/ops-01-pilot-release-checklist.md`.

### OPS-02 live RC / site readiness (2026-08-15)

Go-live audit: source RC = `24966ba`; installable signed/notarized artifact **missing** on audit host; café hardware/LAN/escrow/operator drills **PENDING**. Verdict **🔴 NO-GO** for first live transaction. Docs: `docs/05-production/ops-02-live-pilot-rc-site-readiness.md`, `docs/13-operations/ops-02-site-readiness-checklist.md`. No H5 / Phase 4.16.

### R0 Restaurant OS blueprint (2026-08-15)

Complete-product blueprint (docs only): [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md), [`restaurant-os-roadmap.md`](restaurant-os-roadmap.md) (R0–R16), architecture / offline / financial contracts, [`restaurant-simulation.md`](restaurant-simulation.md). Does **not** promote Hardening→Existing. Does **not** authorize R1. Retail/other verticals deferred for development. No Phase 4.16.

### R1 POS Core Completion (2026-08-15)

| Row                | Still        | R1 closed                                                                 |
| ------------------ | ------------ | ------------------------------------------------------------------------- |
| Void order         | 🟡 Hardening | Cancel Idempotency-Key replay (no double audit); terminal transition lock |
| Discounts          | 🟡 Hardening | Discount Idempotency-Key + UI keys; item discount audit                   |
| Receipt generation | 🟡 Hardening | WebUSB/local/browser best-effort print log parity                         |
| Receipt reprint    | 🟢 Existing  | Server coerces second print-bill to `reprint`                             |
| Order lifecycle    | 🟢 Existing  | Illegal leave from cancelled/completed → 409                              |
| Modifier groups    | 🔵 Planned   | Required/min groups enforced on empty addons (deepen, not Existing)       |
| Digital receipt    | 🔵 Planned   | Preview foundation (`bill_id`, text, escpos_base64) — no delivery         |

Remaining after R1: mandatory cancel/discount keys; item-discount UI; `order.updated` audit depth; full status CAS; digital delivery; ADR-014 service charge; coupons/reopen/courses. Doc: `docs/05-production/r1-pos-core-completion.md`. **Do not start R2 automatically.**

### Frozen (do not start)

Card terminal, payment gateway, online payment, multi-location (central menu/inventory/transfers/reporting/franchise), payroll.

---

## Engineering alignment (do not rebuild)

Some 🔵 Planned rows already have a **shipped slice**. Treat Planned as remaining product depth, not a greenfield rebuild:

| Matrix row                                 | Shipped slice (evidence)                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Item availability / 86, sold-out control   | Phase 4.7 `POST /api/products/:id/availability` + Restaurant POS 86                                                                         |
| Void item                                  | Item cancel/restore on order routes; H1 blocks cancel after successful tender                                                               |
| Void order                                 | Status cancel + PIN override; H1 adds `order.cancelled` audit                                                                               |
| Discounts                                  | Order/item discount APIs; H1 adds audit + post-tender 409                                                                                   |
| Receipt generation                         | Thermal print + H1 server-side `print_logs` on successful print-bill                                                                        |
| Partial payment                            | `payment_status=partial` + FIN-01 collectible outstanding                                                                                   |
| Modifier groups                            | `addon_groups` / addons                                                                                                                     |
| Item images                                | Product images + `test:product-images`                                                                                                      |
| Kitchen routing / multiple stations        | R3 Existing: `kitchen_stations` + category/table routing + KDS `station_name`; per-product station FK still gap                             |
| Priority queue / ticket timers / prep-time | R3: `orders.kitchen_priority` + item timestamps + aging UI; expediter/analytics/sound still Planned                                         |
| Multiple printer routing                   | `kitchen_stations.printer_id`                                                                                                               |
| Cash drawer                                | Phase 3.6F `POST /api/printers/kick-drawer`                                                                                                 |
| Waste management                           | R4 SKU wastage + reasons (not ingredient waste); Phase 4.15 base                                                                            |
| Inventory count / reconciliation           | R4 `inventory_counts` draft→apply via ledger `count_variance`; UI `/products/counts`                                                        |
| Inventory report                           | Phase 4.11 on-hand valuation (not food-cost %)                                                                                              |
| Stock adjustment                           | R4 mandatory Idempotency-Key + audits; units convert on adjust                                                                              |
| Service charge                             | ADR-014 **Proposed** — no wiring until human Accept                                                                                         |
| Merge tables                               | R2 unpaid-only merge (`POST /api/tables/:id/merge`); billed merge still **ADR_REQUIRED** (4.13)                                             |
| Sections                                   | R2 free-text `section` on CRUD + list filter + create UI; no first-class section entity / floor designer                                    |
| Table assignment                           | Kitchen station assignment + R2 `assigned_waiter_id` (`POST /api/tables/:id/assign-waiter`, owner/manager)                                  |
| Transfer table                             | R2 hardened: held-cart/cleaning guards, audit `table.order_transferred`, transfer UI on `/tables`                                           |
| Table split                                | Split bill remains Existing; R2 adds unpaid physical split (`POST /api/tables/:id/split`) — UI still API-primary                            |
| Recipe-linked items                        | R5 `recipes.product_id` → menu item; one active recipe per product                                                                          |
| Ingredient inventory                       | R5 reuses `products` SKUs as ingredients (`track_inventory`); no separate ingredient catalog                                                |
| Recipe / BOM                               | R5 schema v79 `recipes` + `recipe_ingredients`; CRUD + UI `/products/recipes`                                                               |
| Ingredient deduction                       | R5 consume at order create/add-items via Inventory `applyRecipeStockDelta`; BLOCK insufficient; cancel reverse; `order_item_id` idempotency |
| Food costing                               | R5 theoretical cost in integer cents (`recipe-cost.ts`); catalog `cost` × qty                                                               |
| Food-cost percentage                       | R5 basic theoretical % (cost vs sell); full BI food-cost report stays Planned                                                               |
| Recipe / BOM, PO, suppliers                | R5 BOM/recipes/food-cost **Existing**; R6 PO / receiving / suppliers **Existing (COMPLETE)**                                                |

R5–R8 shipped 2026-08-15 (schema tip **v82**). Do not start R9 without authorization. Keep aggregators, terminals, multi-location, and AI frozen.

---

## Related docs

- Complete OS blueprint (R0): [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md)
- R-waves: [`restaurant-os-roadmap.md`](restaurant-os-roadmap.md)
- Architecture / offline / financial / simulation: `restaurant-os-architecture.md`, `restaurant-os-offline-contract.md`, `restaurant-os-financial-contract.md`, `restaurant-simulation.md`
- Code truth: [`feature-list.md`](feature-list.md)
- Living roadmap: [`roadmap.md`](roadmap.md)
- Prompt pipeline (4.6–4.15 **COMPLETE**): [`prompts/STATE.md`](../../prompts/STATE.md)
- Agent memory: [`.ai/context.md`](../../.ai/context.md)
