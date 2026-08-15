<!-- Last updated: 2026-08-14, schema v75 -->

# Operavia Restaurant — capability matrix

**Canonical product plan** for Operavia Restaurant (repo: FloCafe). Adopted 2026-08-14.

This matrix is the backlog and posture for what we keep, harden, build, defer, or freeze. It does **not** authorize implementation. Do not invent Phase 4.16. Execute only an explicitly authorized slice.

**Code evidence** (what is actually in the tree) remains [`feature-list.md`](feature-list.md). If this plan and the code disagree, **do not rebuild** a shipped slice — deepen it, or update this matrix.

**Strategy freeze** still applies: [`STRATEGY.md`](../../STRATEGY.md). Frozen rows here match that freeze.

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
| Coupons                    | 🔵 Planned   |
| Promotions                 | 🔵 Planned   |
| Tax calculation            | 🟢 Existing  |
| Service charge             | 🔵 Planned   |
| Takeaway orders            | 🟢 Existing  |
| Dine-in orders             | 🟢 Existing  |
| Delivery orders            | 🟢 Existing  |
| Order source tracking      | 🔵 Planned   |
| Receipt generation         | 🟡 Hardening |
| Receipt reprint            | 🔵 Planned   |
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
| Recipe-linked items    | 🔵 Planned  |
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
| Sections                 | 🔵 Planned  |
| Merge tables             | 🔵 Planned  |
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
| Kitchen routing            | 🔵 Planned   |
| Multiple stations          | 🔵 Planned   |
| Prep station               | 🔵 Planned   |
| Expediter                  | 🔵 Planned   |
| Priority queue             | 🔵 Planned   |
| Ticket timers              | 🔵 Planned   |
| Prep-time tracking         | 🔵 Planned   |
| KDS analytics              | 🔵 Planned   |
| Offline KDS                | 🟡 Hardening |
| KDS recovery               | 🟡 Hardening |
| Sound alerts               | 🔵 Planned   |
| Visual alerts              | 🔵 Planned   |

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
| Print queue              | 🔵 Planned  |
| Print retry              | 🔵 Planned  |
| Printer health           | 🔵 Planned  |
| Printer recovery         | 🔵 Planned  |
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
| Ingredient inventory     | 🔵 Planned  |
| Recipe / BOM             | 🔵 Planned  |
| Ingredient deduction     | 🔵 Planned  |
| Food costing             | 🔵 Planned  |
| Purchase orders          | 🔵 Planned  |
| Goods receiving          | 🔵 Planned  |
| Supplier management      | 🔵 Planned  |
| Supplier pricing         | 🔵 Planned  |
| Stock transfer           | 🔵 Planned  |
| Waste management         | 🔵 Planned  |
| Expiry tracking          | 🔵 Planned  |
| Inventory count          | 🔵 Planned  |
| Inventory reconciliation | 🔵 Planned  |
| Consumption reports      | 🔵 Planned  |
| Food-cost percentage     | 🔵 Planned  |
| Auto-86 from stock       | 🔵 Planned  |
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
| Visit frequency         | 🔵 Planned  |
| Customer segmentation   | 🔵 Planned  |
| Customer preferences    | 🔵 Planned  |
| Customer lifetime value | 🔵 Planned  |
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
| Coupons             | 🔵 Planned  |
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

## Digital Ordering

| Feature                 | Status              |
| ----------------------- | ------------------- |
| QR menu                 | 🔵 Planned          |
| QR ordering             | 🔵 Planned          |
| Table QR                | 🔵 Planned          |
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
| Payment report       | 🔵 Planned  |
| Product performance  | 🔵 Planned  |
| Category performance | 🔵 Planned  |
| Discount report      | 🔵 Planned  |
| Void report          | 🔵 Planned  |
| Staff report         | 🔵 Planned  |
| Shift report         | 🟢 Existing |
| Cash reconciliation  | 🟢 Existing |
| Inventory report     | 🔵 Planned  |
| Food-cost report     | 🔵 Planned  |
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
| Printer recovery            | 🔵 Planned   |
| Cloud non-blocking billing  | 🟢 Existing  |
| Offline tax verification    | 🟢 Existing  |

## Tax / Compliance

| Feature                  | Status      |
| ------------------------ | ----------- |
| GST calculation          | 🟢 Existing |
| Signed tax packs         | 🟢 Existing |
| Offline tax verification | 🟢 Existing |
| Tax reporting            | 🟢 Existing |
| E-invoicing              | ⚪ Later    |
| Filing exports           | ⚪ Later    |

## Security

| Feature                   | Status       |
| ------------------------- | ------------ |
| Authentication            | 🟢 Existing  |
| Authorization             | 🟡 Hardening |
| Role-based access         | 🟡 Hardening |
| Sensitive-action controls | 🔵 Planned   |
| Audit trail               | 🟡 Hardening |
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
| Data integrity checks  | 🔵 Planned   |
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
| Data integrity validation    | 🟡 Hardening |
| Audit logging                | 🟡 Hardening |

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
| KDS workflow tests          | 🔵 Planned  |
| Printing tests              | 🔵 Planned  |
| Offline/reconnect tests     | 🔵 Planned  |
| Recovery tests              | 🔵 Planned  |
| Inventory integrity tests   | 🔵 Planned  |
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

Remaining after H3 (not falsely marked Existing): Sensitive-action controls (Planned); authz-denial audit flood; cashier in-progress void UI; manager settings save UX quirks; broader audit-trail Hardening.

### H4 delivered depth (2026-08-15)

| Row                  | Still        | H4 closed                                                                         |
| -------------------- | ------------ | --------------------------------------------------------------------------------- |
| Conflict handling    | 🟡 Hardening | Cancel re-check in txn; item cancel no-op; item restore status conflict 409       |
| App restart recovery | 🟡 Hardening | Restore audit + create-time backup integrity; interrupted swap recovery preserved |
| Restore              | 🟡 Hardening | Backup integrity before success; `backup.created` / `restore.completed            | failed` audits |

Remaining after H4 (not falsely marked Existing): order-status CAS, stock adjust idempotency, Drive backup-now PIN, corrupt-openable live DB fail-closed, durable KDS outbox, disaster recovery (Planned).

### OPS-01 operations closure (2026-08-15)

Pilot **release/ops documentation** closed for baseline `24966ba` (config, runbook, checklist, gates, drill evidence). Does **not** promote H1–H4 rows to Existing. Does **not** create Phase 4.16. Live café still requires signed RC + human sign-off gates. Docs: `docs/05-production/ops-01-pilot-release-operations-closure.md`, `docs/13-operations/ops-01-pilot-configuration.md`, `docs/16-release/ops-01-pilot-release-checklist.md`.

### Frozen (do not start)

Card terminal, payment gateway, online payment, multi-location (central menu/inventory/transfers/reporting/franchise), payroll.

---

## Engineering alignment (do not rebuild)

Some 🔵 Planned rows already have a **shipped slice**. Treat Planned as remaining product depth, not a greenfield rebuild:

| Matrix row                               | Shipped slice (evidence)                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item availability / 86, sold-out control | Phase 4.7 `POST /api/products/:id/availability` + Restaurant POS 86                                                                                |
| Void item                                | Item cancel/restore on order routes; H1 blocks cancel after successful tender                                                                      |
| Void order                               | Status cancel + PIN override; H1 adds `order.cancelled` audit                                                                                      |
| Discounts                                | Order/item discount APIs; H1 adds audit + post-tender 409                                                                                          |
| Receipt generation                       | Thermal print + H1 server-side `print_logs` on successful print-bill                                                                               |
| Partial payment                          | `payment_status=partial` + FIN-01 collectible outstanding                                                                                          |
| Modifier groups                          | `addon_groups` / addons                                                                                                                            |
| Item images                              | Product images + `test:product-images`                                                                                                             |
| Kitchen routing / multiple stations      | `kitchen_stations`                                                                                                                                 |
| Multiple printer routing                 | `kitchen_stations.printer_id`                                                                                                                      |
| Cash drawer                              | Phase 3.6F `POST /api/printers/kick-drawer`                                                                                                        |
| Waste management                         | Phase 4.15 SKU `action=wastage` (not ingredient waste)                                                                                             |
| Inventory report                         | Phase 4.11 on-hand valuation (not food-cost %)                                                                                                     |
| Service charge                           | ADR-014 **Proposed** — no wiring until human Accept                                                                                                |
| Merge tables                             | Phase 4.13 discovery only; billed merge still ADR_REQUIRED                                                                                         |
| Recipe / BOM, PO, suppliers              | STRATEGY historically frozen as ERP depth; this matrix now lists them 🔵 Planned — still require an authorized slice + ADR if schema/money changes |

Recipe/BOM and procurement moving from STRATEGY freeze to Planned is a **product-plan change**. Do not implement until a human authorizes a phase; keep aggregators, terminals, multi-location, and AI frozen.

---

## Related docs

- Code truth: [`feature-list.md`](feature-list.md)
- Living roadmap: [`roadmap.md`](roadmap.md)
- Prompt pipeline (4.6–4.15 **COMPLETE**): [`prompts/STATE.md`](../../prompts/STATE.md)
- Agent memory: [`.ai/context.md`](../../.ai/context.md)
