<!-- Last updated: 2026-08-15, schema v79 -->

# OPS-01 — Pilot configuration (Restaurant)

**Audience:** Owner / installer / pilot engineer.  
**Baseline:** commit `24966ba7272aa4e0e6650796ec469a3cd60ed423` · app **3.0.5** · schema **v79**.  
**Canonical product plan:** [`../00-product/capability-matrix.md`](../00-product/capability-matrix.md).

This document lists **operator settings** for a controlled single-café pilot. Defaults in a fresh install are **not** the pilot-required profile. Do not silently flip production values in code; change them in Settings on the café machine (or spare) with owner/manager authority.

Related: [`ops-01-pilot-release-operations-closure.md`](../05-production/ops-01-pilot-release-operations-closure.md) · [`pilot-runbook.md`](./pilot-runbook.md).

---

## Classification legend

| Class             | Meaning                                                |
| ----------------- | ------------------------------------------------------ |
| **REQUIRED**      | Must be set as specified before live café service      |
| **OPTIONAL**      | May be enabled if the café uses that hardware/workflow |
| **NOT SUPPORTED** | Must not be relied on for this pilot                   |
| **FROZEN**        | Product-frozen; do not enable or build around          |

---

## REQUIRED

| Setting / control             | Pilot value                                   | Where / how                                           | Notes                                           |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Vertical                      | Restaurant                                    | `ACTIVE_VERTICAL_ID` unset or `restaurant`            | Never `retail` / `retail-test` on café          |
| `shifts_enabled`              | `true`                                        | Settings → Shift history → Enable Shift Management    | Fresh default is `false`                        |
| `require_open_shift_for_cash` | `true`                                        | Same tab → Require Open Shift for Cash                | Fresh default is `false`                        |
| Local backup practice         | ≥1 local backup per service day               | Settings → Backup & Data → Create Backup + Master PIN | Path `{userData}/backups/`                      |
| Master PIN escrow             | Offline paper/envelope                        | Set at first launch; never store in chat/Drive/git    | Restore requires Master PIN                     |
| Staff roles                   | Owner, Manager, Cashier, Waiter, Chef as used | Staff UI                                              | See RBAC table below                            |
| Settle before complete        | Ops discipline                                | Complete after payment (or at settle)                 | Code allows postpaid complete; recon uses bills |
| OPS-01 network                | Staff-only SSID if LAN used                   | See network section                                   | Guest Wi‑Fi = stop trading                      |

---

## OPTIONAL (café-dependent)

| Setting / control      | When to use                                                     | Pilot notes                                                              |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `network_mode`         | `localhost` (same machine) **or** `kds_lan`/`lan` on staff SSID | Default `localhost`. Restart after change.                               |
| `kds_enabled`          | Kitchen display required                                        | Companion default port **3002** (`KDS_PORT`)                             |
| `kot_printing_enabled` | Paper KOT in addition to / instead of KDS                       | Default `true`                                                           |
| Thermal printer        | Receipts / KOT / Z print                                        | ESC/POS 58mm or 80mm; Test Print before service                          |
| Cash drawer kick       | Manual open from POS                                            | Not auto-on-pay                                                          |
| Google Drive backup    | Secondary offsite copy only                                     | **NOT** sole backup (DRV-01: backup-now is owner JWT without Master PIN) |
| WhatsApp / FloAdmin    | Marketing / outbound                                            | Internet required; never blocks billing                                  |

---

## NOT SUPPORTED (this pilot)

| Item                                 | Why                                                             |
| ------------------------------------ | --------------------------------------------------------------- |
| Drive as **sole** backup             | DRV-01 residual; Master PIN not required for Drive “backup now” |
| Durable KDS offline outbox           | Not built; use paper/verbal fallback when companion down        |
| Print queue / auto-retry             | Planned; use manual reprint                                     |
| Adhoc / unsigned live binary         | TRAINING/QA only; live café needs signed/notarized RC           |
| `npm run dev` for live service       | Dev server is not a pilot artifact                              |
| Wrong-café restore by filename alone | No `installation_id`; operator must identity-check backup       |

---

## FROZEN (do not enable)

Card terminals · payment gateways · online payment · multi-location · payroll · aggregators · AI · Bluetooth printing (Later/Frozen per matrix).

---

## Network modes

| Mode        | Bind / use                       | Pilot rule                             |
| ----------- | -------------------------------- | -------------------------------------- |
| `localhost` | POS + companions on same machine | Preferred if KDS is in-app / same host |
| `kds_lan`   | Staff LAN for KDS pairing        | Staff-only SSID/VLAN only              |
| `lan`       | Broader LAN listen               | Staff-only SSID/VLAN only              |

**NEVER** guest Wi‑Fi or public hotspot. Ports **3001–3003** must be unreachable from guest. Cleartext HTTP/WS on staff LAN is an accepted pilot limitation (TLS deferred).

---

## Companion services

| Service       | Default port | Required if…              | Verify                                                                               |
| ------------- | ------------ | ------------------------- | ------------------------------------------------------------------------------------ |
| Main API      | 3001         | Always (desktop app)      | App login works                                                                      |
| KDS companion | 3002         | Café uses kitchen display | Settings → Kitchen Display / `GET /api/kds-info`; H2 returns 503 when companion down |
| Server App    | 3003         | Waiter handheld used      | Optional for counter-only café                                                       |

---

## Hardware

| Item            | Class    | Notes                                  |
| --------------- | -------- | -------------------------------------- |
| POS host        | REQUIRED | macOS/Windows/Linux per signed package |
| Thermal printer | OPTIONAL | If used: Test Print + failure drill    |
| KDS display     | OPTIONAL | Browser/device to `:3002` when enabled |
| Spare disk/USB  | OPTIONAL | For off-machine local backup copy      |

---

## Roles — sensitive actions (H3)

| Action              | Owner                               | Manager | Cashier | Waiter | Chef  |
| ------------------- | ----------------------------------- | ------- | ------- | ------ | ----- |
| Order discount      | Y                                   | Y       | N       | N      | N     |
| Item restore        | Y                                   | Y       | N       | N      | N     |
| Item cancel         | Y                                   | Y       | Y\*     | own\*  | N     |
| Order cancel        | Y                                   | Y       | Y\*     | own\*  | Y\*\* |
| Refund              | Y                                   | Y       | Y+PIN   | N      | N     |
| Settings write      | Y                                   | Y       | N       | N      | N     |
| KDS item status     | Y                                   | Y       | N       | N      | Y     |
| Stock / wastage     | Y                                   | Y       | N       | N      | N     |
| Shift open/close    | Y                                   | Y       | Y†      | N      | N     |
| Local backup create | Y+Master PIN                        | —       | —       | —      | —     |
| Restore             | Master PIN (desktop IPC / Recovery) | —       | —       | —      | —     |

\* PIN / own-order rules apply for in-progress voids.  
\*\* Chef cancel requires manager PIN.  
† Cashier close: matching terminal.

---

## Explicit non-defaults (operator action)

Fresh install leaves `shifts_enabled=false` and `require_open_shift_for_cash=false`. **Pilot operators must turn both ON** before live cash service. Do not treat defaults as pilot-ready.
