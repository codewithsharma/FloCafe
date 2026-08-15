<!-- Last updated: 2026-08-15, schema v80 -->

# Operavia Restaurant OS — Offline Contract

**Status:** Product contract (docs only)  
**Principle:** Cloud must **never** block core restaurant billing.  
**SoR:** Local SQLite (ADR-002).  
**Blueprint:** [`restaurant-os-blueprint.md`](restaurant-os-blueprint.md)

---

## Classes

| Class               | Meaning                                              |
| ------------------- | ---------------------------------------------------- |
| **OFFLINE SAFE**    | Full workflow without internet                       |
| **OFFLINE LIMITED** | Core works; secondary features degrade with clear UX |
| **ONLINE REQUIRED** | Needs internet; must not gate SAFE paths             |

---

## Domain classification

| Domain                              | Class                             | Notes                                                                                  |
| ----------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| POS / Orders                        | OFFLINE SAFE                      | Local API + SQLite                                                                     |
| Payments (cash/card/UPI **record**) | OFFLINE SAFE                      | No gateway; record-only card/UPI                                                       |
| Tables / Floor                      | OFFLINE SAFE                      | Local                                                                                  |
| Kitchen / KDS                       | OFFLINE LIMITED                   | Needs LAN/companion for multi-device; same-machine localhost OK; paper/verbal fallback |
| KOT / thermal print                 | OFFLINE LIMITED                   | Local printer; fail open for payment                                                   |
| Inventory / Recipes / Purchasing    | OFFLINE SAFE                      | Local ledger when built                                                                |
| Customers / Loyalty                 | OFFLINE SAFE                      | Local wallet/points                                                                    |
| Staff / Shifts / Finance / Z        | OFFLINE SAFE                      | Local                                                                                  |
| Reporting (local)                   | OFFLINE SAFE                      |                                                                                        |
| WhatsApp / FloAdmin / cloud sync    | ONLINE REQUIRED                   | Outbound; queue/retry; never block pay                                                 |
| Google Drive backup                 | ONLINE REQUIRED                   | Secondary only (DRV-01); local Master-PIN backup remains SAFE                          |
| QR / online ordering accept         | OFFLINE LIMITED / ONLINE REQUIRED | Browsing may need LAN; public internet for remote guests — design per R10              |
| Payment **gateways** / terminals    | ONLINE REQUIRED                   | 🔴 Frozen — not in product until unfrozen                                              |
| Aggregators                         | ONLINE REQUIRED                   | 🔴 Frozen / Later                                                                      |
| App updates / notarization checks   | ONLINE REQUIRED                   | Not required for billing                                                               |

---

## ONLINE REQUIRED — required documentation pattern

For every ONLINE REQUIRED feature, the authorizing slice must specify:

1. **Why** internet is required
2. **Fallback** when offline (disable, queue, or hide)
3. **UX** (explicit unavailable state — no spinner forever)
4. **Failure behavior** (retry, dead-letter, operator message)
5. **Non-blocking proof** (billing path tested with network down)

---

## Failure UX standards

| Failure            | Operator experience                             |
| ------------------ | ----------------------------------------------- |
| No internet        | POS continues; cloud features show unavailable  |
| KDS companion down | POS continues; stale board / paper tickets (H2) |
| Printer down       | Pay succeeds; reprint later (H1)                |
| Drive backup fail  | Local backup still available; alert owner       |

---

## LAN vs internet

- **Internet:** optional for core service day.
- **LAN:** required only for multi-device KDS/Server App (`kds_lan`/`lan` on staff SSID — OPS-01).
- Guest Wi‑Fi must not reach :3001–3003.
