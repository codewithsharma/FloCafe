<!-- Last updated: 2026-08-15, schema v75 -->

# OPS-02 — Live Pilot RC / Site Readiness & Go-Live Audit

**Slice:** Live café release candidate + site readiness (not a product feature phase)  
**Branch:** `restaurant-vertical`  
**Docs HEAD:** `d3322a4041ba0114b3fe821bdbf46fae79e8e47e` (OPS-01)  
**Engineering tree (H1–H4):** `24966ba7272aa4e0e6650796ec469a3cd60ed423`  
**App version:** 3.0.5 · **Schema:** v75  
**Prior:** OPS-01 closed → 🟡 PILOT READY WITH CONDITIONS (engineering + ops docs)  
**Canonical plan:** [`../00-product/capability-matrix.md`](../00-product/capability-matrix.md)

## Scope

Determine whether Operavia Restaurant can **safely be installed and run at the first real café**.

**In scope:** RC identity, site/hardware/network/KDS/printer readiness, staff/PIN/escrow, backup/restore site drills, operator acceptance, live go/no-go gates, documentation.

**Out of scope:** H5, Phase 4.16, Planned/Later/Frozen features, durable KDS outbox, schema/money/KDS redesign, inventing hardware, faking site PASS, creating a release tag without authorization, signing without credentials.

---

## Phase 1 — Baseline verification

| Check                     | Result                                                        |
| ------------------------- | ------------------------------------------------------------- |
| Branch                    | `restaurant-vertical`                                         |
| HEAD                      | `d3322a4` = OPS-01 (matches documented OPS-01)                |
| Working tree (pre-OPS-02) | clean                                                         |
| Origin                    | ahead **4** (not pushed)                                      |
| H4                        | `24966ba` present; author Dev Raj Sharma                      |
| OPS-01                    | `d3322a4` present; docs-only on top of H4                     |
| Code drift H4 → HEAD      | **none** (docs/meta only)                                     |
| Schema                    | v75                                                           |
| App version               | 3.0.5                                                         |
| OPS-01 docs               | present (closure, configuration, checklist, runbook, signoff) |

**Documented engineering baseline remains `24966ba`.** Docs HEAD may be `d3322a4` or this OPS-02 commit — both are documentation descendants of H4.

---

## Phase 2 — Release candidate audit

### Intended RC identity (reproducible source)

| Field                     | Value                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Git commit (product tree) | `24966ba7272aa4e0e6650796ec469a3cd60ed423`                                                         |
| Docs package              | OPS-01 `d3322a4` (+ this OPS-02 audit)                                                             |
| Schema / migrations       | v75 (migrate on first open)                                                                        |
| Vertical                  | `ACTIVE_VERTICAL_ID` unset or `restaurant`                                                         |
| Companions                | API `:3001`, KDS `:3002`, Server App `:3003` (optional)                                            |
| Startup                   | Signed desktop app (not `npm run dev`)                                                             |
| Config                    | [`../13-operations/ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md) |

### Installable PILOT/PRODUCTION artifact

| Check                                   | Status         | Evidence                                                                                                      |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| Signed macOS build for `24966ba` / HEAD | 🔴 **BLOCKER** | This host: **0** codesign identities; `CSC_*` / `APPLE_*` unset                                               |
| Notarization                            | 🔴 **BLOCKER** | No notarized artifact for this baseline                                                                       |
| Local `release/mac-arm64/Nexora.app`    | 🔴 **not RC**  | `Signature=adhoc`, `TeamIdentifier=not set`, legacy **Nexora** name, dated ~2026-08-13 — **TRAINING/QA only** |
| Release tag                             | ⚪ not created | Not authorized in OPS-01/OPS-02                                                                               |
| Version string alone                    | 🟡 CONDITION   | `3.0.5` is **not** unique to this commit — **commit hash is authoritative**                                   |

**RC reproducibility (source):** 🟢 source tree + schema known.  
**RC reproducibility (installable live binary):** 🔴 **BLOCKER** until signed/notarized build from this tree exists.

---

## Phase 3 — Real site readiness

No café machine, printer, or KDS display was available to this audit session. Claims below use existing docs + implementation; **site verification is not invented**.

| Area                     | Status          | Notes                                                                                                 |
| ------------------------ | --------------- | ----------------------------------------------------------------------------------------------------- |
| POS device (café)        | ⚪ **PENDING**  | Required: host for signed package; OS/storage/power/network per café — not verified on site           |
| Thermal printer          | ⚪ **PENDING**  | Product supports ESC/POS 58/80; Test Print + fail/reprint documented — **hardware not café-verified** |
| KDS device / companion   | ⚪ **PENDING**  | Companion `:3002`; H2 recovery in suites — **kitchen display not café-verified**                      |
| LAN / staff SSID         | ⚪ **PENDING**  | OPS-01: guest must not reach :3001–3003 — **site check not done**                                     |
| Offline billing (design) | 🟢 suite/design | Local SQLite SoR; internet not required for pay                                                       |

---

## Phase 4 — Security / staff setup

| Item                                  | Status                                                |
| ------------------------------------- | ----------------------------------------------------- |
| Role model O/M/C/W/Chef               | 🟢 documented + H3 suites                             |
| Master PIN procedure                  | 🟢 documented                                         |
| Master PIN **escrow** (offline)       | ⚪ **PENDING** (live blocker when going live)         |
| Café staff accounts created           | ⚪ **PENDING**                                        |
| Account recovery / deactivation brief | 🟡 runbook exists; café training PENDING              |
| Credentials in repository             | 🟢 **none found** in ops docs; no `.env` in workspace |

Do **not** commit real PINs/passwords.

---

## Phase 5 — Backup / restore drill

| Environment                  | Status         | Evidence                                             |
| ---------------------------- | -------------- | ---------------------------------------------------- |
| Engineering suites           | 🟢 PASS        | `npm run test:h4`, `npm run test:backup` (OPS-01)    |
| Café / signed-RC spare drill | ⚪ **PENDING** | No site access; historical lab DR ≠ signed café PASS |

**Do not mark café restore PASS.**

---

## Phase 6 — Real operating drill

| Environment                                       | Status                    |
| ------------------------------------------------- | ------------------------- |
| Suite simulation (shift → sale → pay → recon → Z) | 🟢 PASS (OPS-01 evidence) |
| On-café full day simulation                       | ⚪ **PENDING**            |

---

## Phase 7 — Failure drills

| Drill                 | Suite / design | Café       |
| --------------------- | -------------- | ---------- |
| Internet failure      | 🟢             | ⚪ PENDING |
| KDS companion failure | 🟢 H2          | ⚪ PENDING |
| Printer failure       | 🟢 H1          | ⚪ PENDING |
| App restart           | 🟢 SQLite SoR  | ⚪ PENDING |
| Device restart        | 🟢 design      | ⚪ PENDING |
| Backup restore        | 🟢 suites      | ⚪ PENDING |

---

## Phase 8 — Operator acceptance

No independent café operator walkthrough was performed in this session.

| Task                                                                                                  | Result                                 |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Opening / sale / discount / KDS / pay / reprint / close / backup / failure recovery without developer | ⚪ **PENDING** / **REQUIRES TRAINING** |

Runbook: [`../13-operations/pilot-runbook.md`](../13-operations/pilot-runbook.md). Training: [`../13-operations/pilot-staff-training-checklist.md`](../13-operations/pilot-staff-training-checklist.md).

---

## Phase 9 — Live pilot gates

| Gate                           | Status                                           |
| ------------------------------ | ------------------------------------------------ |
| RC reproducibility (source)    | 🟢 PASS                                          |
| RC installable signed artifact | 🔴 BLOCKER                                       |
| POS hardware                   | ⚪ PENDING                                       |
| Printer                        | ⚪ PENDING                                       |
| KDS                            | ⚪ PENDING                                       |
| LAN (OPS-01)                   | ⚪ PENDING                                       |
| Offline billing                | 🟢 PASS (engineering)                            |
| Payment workflow               | 🟢 PASS (engineering)                            |
| GST/tax                        | 🟢 PASS (engineering)                            |
| Shift/cash                     | 🟡 CONDITION (must enable settings on install)   |
| Backup (procedure + suites)    | 🟢 PASS (engineering) / ⚪ PENDING (café)        |
| Restore (café/signed)          | ⚪ PENDING                                       |
| RBAC                           | 🟢 PASS (engineering)                            |
| Operator training              | ⚪ PENDING                                       |
| Master PIN escrow              | ⚪ PENDING                                       |
| Recovery procedure             | 🟡 CONDITION (docs + suites; café drill PENDING) |

---

## Phase 10 — Go / No-Go

# 🔴 NO-GO

**For first live café transaction.** Engineering remains ready with conditions; **release/site gates are not closed.**

### Must complete before first transaction

1. Produce **signed + notarized** PILOT/PRODUCTION artifact from `24966ba` (or approved clean descendant including OPS docs).
2. Record artifact path/URL + commit on [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md).
3. Fresh install on café POS; set Restaurant vertical; enable `shifts_enabled` + `require_open_shift_for_cash`.
4. Complete **Master PIN escrow** (offline).
5. If LAN/KDS: enforce OPS-01 staff SSID; prove guest cannot reach :3001–3003.
6. Create staff roles used on site; brief refunds vs cancel-after-tender.
7. If printer/KDS required: on-site Test Print + KDS ticket + failure fallback once.
8. Local backup create + **spare/test restore** on signed RC.
9. Operator completes opening → sale → close → backup from runbook **without developer**.
10. CTO + CEO/operator + pilot owner signatures on sign-off.

### Must complete before end of pilot week

- Backup policy numbers approved or written waiver
- Incident log practice
- At least one mid-week restore tabletop or spare drill refresh
- Review variance / Z discipline daily

### Operator procedure

- Settle before complete; paper/verbal KDS; manual reprint; Drive ≠ sole backup (DRV-01)

### Post-pilot engineering (not OPS-02)

Hardening candidates (audit trail, DRV-01, order-status CAS, etc.) · Planned · Later · Frozen — **do not start in OPS-02**

---

## Phase 11 — Feature discipline (classified findings)

| Finding                                   | Class                                              |
| ----------------------------------------- | -------------------------------------------------- |
| No signed/notarized RC on this baseline   | **1 Pilot blocker**                                |
| Master PIN escrow not done                | **1 Pilot blocker** (live)                         |
| Café hardware/LAN/operator drills undone  | **1 Pilot blocker** / **2 Operational** until done |
| `shifts_enabled` defaults false           | **2 Operational condition**                        |
| Drive backup-now without Master PIN       | **4 Hardening** (DRV-01) — ops: local PIN backups  |
| Adhoc `Nexora.app` local pack             | **2** — TRAINING only, not live                    |
| Durable KDS outbox / BOM / QR / terminals | **5–7** Planned/Later/Frozen — out of scope        |
| `security-hardening` JWT test order       | **4** test debt (OPS-01) — not live blocker        |

**No category-3 production bug** requiring immediate engineering was proven in this audit.

---

## FINAL VERDICT

| Layer                          | Verdict                  |
| ------------------------------ | ------------------------ |
| Engineering (H1–H4 + OPS-01)   | 🟡 Ready with conditions |
| **Live café go-live (OPS-02)** | 🔴 **NO-GO**             |

Re-run OPS-02 site gates after signed RC + café drills; only then consider 🟡/🟢 for live service.

---

## Related

- [`ops-01-pilot-release-operations-closure.md`](./ops-01-pilot-release-operations-closure.md)
- [`../13-operations/ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md)
- [`../13-operations/ops-02-site-readiness-checklist.md`](../13-operations/ops-02-site-readiness-checklist.md)
- [`../16-release/ops-01-pilot-release-checklist.md`](../16-release/ops-01-pilot-release-checklist.md)
- [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md)
