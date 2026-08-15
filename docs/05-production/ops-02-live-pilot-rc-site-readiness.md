<!-- Last updated: 2026-08-15, schema v83 -->

# OPS-02 — Live Pilot RC / Site Readiness & Go-Live Audit

**Slice:** Live café release candidate + site readiness (not a product feature phase)  
**Branch:** `restaurant-vertical`  
**Post-R8 engineering HEAD:** `94702f8` (`feat: complete R8 Restaurant staff workforce OS`)  
**Historical engineering baseline (H1–H4):** `24966ba7272aa4e0e6650796ec469a3cd60ed423`  
**App version:** 3.0.5 · **Schema tip:** v83 (R9 Slice 1 Expenses COMPLETE on tip-of-tree; live RC identity still tracked from Post-R8 until a new signed build)  
**Prior:** OPS-01 closed → 🟡 PILOT READY WITH CONDITIONS (engineering + ops docs)  
**Canonical plan:** [`../00-product/capability-matrix.md`](../00-product/capability-matrix.md)

**Development waiver (2026-08-15):** Engineering may continue product slices (e.g. R9 Slice 1). Waiver does **not** mark site gates PASS, signed/notarized RC complete, or live go-live. Live café validation remains **DEFERRED**. Live Go-Live remains **NO-GO**.

## Scope

Determine whether Operavia Restaurant can **safely be installed and run at the first real café**.

**In scope:** RC identity, site/hardware/network/KDS/printer readiness, staff/PIN/escrow, backup/restore site drills, operator acceptance, live go/no-go gates, documentation.

**Out of scope:** H5, Phase 4.16, Planned/Later/Frozen features, durable KDS ticket outbox redesign, schema/money rewrite, inventing hardware, faking site PASS, creating a release tag without authorization, signing without credentials, **R9 Slice 2+** (tax depth, Z polish, ops reports, food-cost) until separately authorized.

---

## Gate 1 tracker (Post-R8 verification — 2026-08-15)

Separate **engineering-completable** from **human/site-completable**. Code cannot satisfy physical drills. Do not mark site PASS without artifact path, worksheet, or signed acknowledgment.

| Gate                                                                               | Engineering can complete?                                                                               | Human/Site required?   | Evidence (this verification)                                                                                                              | Status                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Signed/notarized PILOT/PRODUCTION RC from `94702f8` (or approved clean descendant) | Partial — **`npm run build` PASS**; **unsigned macOS pack PASS**; signing/notarization need credentials | Yes                    | Host: **0** codesign identities; `CSC_*` / `APPLE_*` unset; unsigned `release/mac-arm64/Operavia.app` produced 2026-08-15 (NOT a live RC) | 🔴 BLOCKER (signing/notarization) |
| Master PIN escrow (offline)                                                        | No                                                                                                      | Yes                    | Procedure in runbook / OPS-01; no escrow worksheet completed                                                                              | ⚪ PENDING HUMAN/SITE             |
| Backup policy numbers approved                                                     | No                                                                                                      | Yes                    | Docs exist; no owner/CEO approval recorded                                                                                                | ⚪ PENDING HUMAN/SITE             |
| Printer drill (discover / print / fail / retry)                                    | Suites only (`test:printer`, H1 reprint paths)                                                          | Yes                    | No café hardware evidence                                                                                                                 | ⚪ PENDING HUMAN/SITE EXECUTION   |
| KDS/LAN drill (connect / disconnect / reconnect / guest blocked)                   | Suites only (`test:h2`, `test:r3`)                                                                      | Yes                    | No staff-SSID / guest-block proof                                                                                                         | ⚪ PENDING HUMAN/SITE EXECUTION   |
| Restore drill (backup → restore → restart → integrity)                             | Yes for engineering — `test:backup` / `test:h4` green                                                   | Yes for café/signed RC | Suites PASS; café spare drill not done                                                                                                    | 🟢 ENG / ⚪ PENDING HUMAN/SITE    |
| Force-close shift drill                                                            | Product path exists (UI + `POST /api/shifts/:id/force-close`)                                           | Yes                    | Operator steps now in runbook; drill not executed                                                                                         | ⚪ PENDING HUMAN/SITE EXECUTION   |
| Operator walkthrough (open→…→Z without developer)                                  | Docs support (runbook + training)                                                                       | Yes                    | No independent operator PASS recorded                                                                                                     | ⚪ PENDING HUMAN/SITE             |
| CEO / CTO / pilot sign-offs                                                        | No                                                                                                      | Yes                    | `pilot-signoff.md` signatures empty                                                                                                       | ⚪ PENDING HUMAN                  |

### Engineering prerequisites (verified this session)

| Area                                                | Result                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Schema tip                                          | **v83** (`migrations.ts` tip + backup suites migrate through v83; R9 Slice 1 Expenses)                 |
| Vertical                                            | Restaurant default; isolation suite green; do not set `retail` on café                                 |
| R3–R8                                               | **ALL GREEN** (R3 70, R4.1 green, R5–R8 COMPLETE)                                                      |
| H1–H4                                               | **ALL GREEN** (37 / 34 / 33 / 20)                                                                      |
| money-cents / process-kill                          | 20/20 · 12/12                                                                                          |
| orders-authz / staff-authz / restaurant-isolation   | green                                                                                                  |
| FIN-01 / financial reporting                        | 34/34; FIN-01 codes unchanged                                                                          |
| Backup / restore / integrity                        | `test:backup` PASS (production + continuity + REC-01)                                                  |
| Offline / kill recovery                             | process-kill + H2 + SQLite SoR suites green                                                            |
| KDS reconnect / retry / no silent loss              | H2 34/34 + R3 CAS; working-tree deepen of pending retries (uncommitted)                                |
| Workforce / RBAC                                    | R8 57/57 + staff-authz 36/36                                                                           |
| `npm run build` (`tsc`)                             | **PASS** (2026-08-15 type-harden wave: **209 → 0**; `dist/` emitted) — see investigation + harden note |
| Unsigned packaging (`electron-builder --mac --dir`) | **PASS** — see **RC packaging verification** below                                                     |
| Signed RC                                           | **BLOCKED** — credentials/identity unavailable                                                         |
| Notarization                                        | **BLOCKED** — credentials unavailable                                                                  |

### RC packaging verification (2026-08-15)

| Item                     | Result                                                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config                   | `package.json` `"build"` — `appId` `com.flo.desktop`, `productName` **Operavia**, version **3.0.5**, `main` `dist/index.js`, output `release/`, mac dmg+zip (x64/arm64), `identity` Codify Apps…, `notarize: true`, hardenedRuntime + entitlements |
| Commands                 | `npm run build` (exit 0); `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --arm64 -c.mac.identity=null -c.mac.notarize=false` (exit 0)                                                                                         |
| **UNSIGNED RC ARTIFACT** | `release/mac-arm64/Operavia.app` (~412 MB); CFBundleIdentifier `com.flo.desktop`; version 3.0.5; includes `app.asar` + `frontend-out` + `assets`                                                                                                   |
| Transfer zip (optional)  | `release/mac-arm64/Operavia-3.0.5-arm64-UNSIGNED.zip` (~144 MB)                                                                                                                                                                                    |
| SHA-256                  | zip `09dd8638a68d0c86d75f696f21c9bfe31ebc5ec79be28e8641f7f51ddc1de129`; `app.asar` `08c13779ae2c65d02dc83934cc5c39894945d8ec204cff2efabb48d762e26f15`                                                                                              |
| Codesign on artifact     | **adhoc / linker-signed** — **not** Developer ID; **not** PILOT/PRODUCTION                                                                                                                                                                         |
| Signing                  | **BLOCKED — credentials/identity unavailable** (0 identities; no `CSC_LINK` / `APPLE_*`)                                                                                                                                                           |
| Notarization             | **BLOCKED — credentials unavailable** (`mac.notarize` configured but cannot run)                                                                                                                                                                   |
| Vertical integrity       | Unset `ACTIVE_VERTICAL_ID` → **restaurant**; no project `.env` in Resources; do not set `retail` / `retail-test` on café                                                                                                                           |
| Suites                   | Not re-run (no app source/config change in this packaging slice); prior Gate 1 / type-harden greens remain baseline                                                                                                                                |

**Packaging (unsigned construct):** **PASS WITH CONDITIONS** (unsigned only).  
**Engineering Gate:** **PASS WITH CONDITIONS** (unsigned pack + compile; signed/notarized RC still missing).  
**OPS-02 Gate 1:** **PENDING HUMAN/SITE**.  
**Live Gate 1:** **NO-GO**.

### Release owner handoff — signed/notarized RC (credentials required)

**Do not use** the unsigned `Operavia.app` for live café service. Identity configured in `package.json` → `build.mac.identity`:

`Codify Apps Private Limited (BKDY677XJA)`

**Provide (release owner / CI secrets):**

| Secret / env                              | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `MAC_CERTS` → `CSC_LINK`                  | Developer ID Application certificate (.p12 / link)       |
| `MAC_CERTS_PASSWORD` → `CSC_KEY_PASSWORD` | Certificate password                                     |
| `APPLE_API_KEY`                           | Path to App Store Connect API `.p8` (or CI-decoded file) |
| `APPLE_API_KEY_ID`                        | Key ID                                                   |
| `APPLE_API_ISSUER`                        | Issuer UUID                                              |
| `APPLE_TEAM_ID`                           | `BKDY677XJA`                                             |

Unset `CSC_IDENTITY_AUTO_DISCOVERY=false` when signing for real.

**Sequence (once credentials available):**

```bash
# From a clean tree at authorized commit (94702f8 or approved descendant with type-harden)
npm run build:frontend
npm run build
# Preferred local: npm run build:mac
# Equivalent: npx electron-builder --mac --arm64   # (and/or --x64); uses identity + notarize:true
# Or CI: .github/workflows/release.yml on an authorized tag
```

**Post-sign verification (required before pilot install):**

```bash
APP="release/mac-arm64/Operavia.app"   # or extracted from DMG/ZIP
codesign --verify --deep --strict "$APP"
codesign -dv --verbose=4 "$APP"        # must NOT say adhoc; expect Developer ID Application: Codify Apps…
spctl --assess --type execute --verbose "$APP"
xcrun stapler validate "$APP"          # after notarization stapled
shasum -a 256 <dmg-or-zip>             # record on pilot-signoff.md
# Launch app → ACTIVE login → schema v82 → ACTIVE_VERTICAL_ID unset/restaurant → one test sale
```

Record artifact path + checksum + commit on [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md). Then execute [`../13-operations/ops-02-site-readiness-checklist.md`](../13-operations/ops-02-site-readiness-checklist.md).

### Final handoff matrix (2026-08-15)

| Gate                                        | Status       | Owner         |
| ------------------------------------------- | ------------ | ------------- |
| Source build (`npm run build`, 0 TS errors) | **PASS**     | Engineering   |
| Unsigned RC (`Operavia.app` arm64)          | **VERIFIED** | Engineering   |
| Signed RC                                   | **BLOCKED**  | Release owner |
| Notarization                                | **BLOCKED**  | Release owner |
| Master PIN escrow                           | **PENDING**  | Human         |
| Backup policy approval                      | **PENDING**  | Human         |
| Printer drill                               | **PENDING**  | Site          |
| KDS/LAN drill                               | **PENDING**  | Site          |
| Restore drill                               | **PENDING**  | Site          |
| Force-close drill                           | **PENDING**  | Site          |
| Operator walkthrough                        | **PENDING**  | Operator      |
| CEO/CTO/pilot sign-off                      | **PENDING**  | Human         |

---

## Phase 1 — Baseline verification

**Question:** Is the ~209-error `tsc` failure a genuine production packaging blocker, or a non-authoritative / test-only path?

**Reproduction (clean tree = commit `94702f8`, dirty work stashed):**

| Item                 | Value                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Command              | `npm run build` → `tsc && node scripts/copy-runtime-assets.cjs` (also `npx tsc --pretty false`) |
| Node                 | v24.18.0                                                                                        |
| TypeScript           | 5.9.3 (lockfile; package range `^5.4.5`)                                                        |
| Exit (before harden) | **2** · **209** errors                                                                          |
| Exit (after harden)  | **0** · **0** errors                                                                            |

**Authoritative production path:** **Yes — `npm run build` is required.** Every ship script runs `build:frontend && build && electron-builder`.

**Post-harden (same day):** Production `main/` TypeScript strict harden completed (Express 5 `routeParam`, Zod 4 `formatIssues`, unknown catches, row/nullability). Suites R3–R8 / H1–H4 / money / kill / authz / backup / FIN-01 green. **`dist/` VERIFIED compile**; signed/notarized PILOT artifact still **NOT VERIFIED** (0 codesign identities).

---

## Phase 1 — Baseline verification

> **Historical snapshot** from the original OPS-02 audit (H4 / OPS-01 era). **Current Gate 1 identity** is the document header + Gate 1 tracker above (`94702f8`, schema **v82**, R1–R8 COMPLETE). Do not treat the table below as tip-of-tree truth.

| Check                     | Result                                                        |
| ------------------------- | ------------------------------------------------------------- |
| Branch                    | `restaurant-vertical`                                         |
| HEAD (historical)         | `d3322a4` = OPS-01 (matches documented OPS-01)                |
| Working tree (pre-OPS-02) | clean                                                         |
| Origin                    | ahead **4** (not pushed)                                      |
| H4                        | `24966ba` present; author Dev Raj Sharma                      |
| OPS-01                    | `d3322a4` present; docs-only on top of H4                     |
| Code drift H4 → HEAD      | **none** (docs/meta only) at that snapshot                    |
| Schema (historical)       | v75                                                           |
| App version               | 3.0.5                                                         |
| OPS-01 docs               | present (closure, configuration, checklist, runbook, signoff) |

**Historical engineering baseline for H1–H4:** `24966ba`. **Post-R8 tip for Gate 1:** `94702f8` (schema v82).

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

1. Produce **signed + notarized** PILOT/PRODUCTION artifact from `94702f8` (or approved clean descendant of Post-R8 HEAD; historical H1–H4 baseline `24966ba` remains documented ancestry).
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

| Layer                                                                               | Verdict                                                                     |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Engineering Gate (R1–R8 + H1–H4 + money/authz/backup + type-harden + unsigned pack) | 🟡 **PASS WITH CONDITIONS** (unsigned pack OK; signed/notarized RC missing) |
| Packaging (unsigned construct)                                                      | 🟡 **PASS WITH CONDITIONS**                                                 |
| Signing / notarization                                                              | 🔴 **BLOCKED** (credentials)                                                |
| **OPS-02 Gate 1**                                                                   | ⚪ **PENDING HUMAN/SITE**                                                   |
| Controlled pilot                                                                    | 🟡 **READY WITH CONDITIONS**                                                |
| **Live café go-live**                                                               | 🔴 **NO-GO**                                                                |

Re-run site gates after signed/notarized RC + café drills + sign-offs; only then consider Gate 1 PASS / live GO.

---

## Related

- [`ops-01-pilot-release-operations-closure.md`](./ops-01-pilot-release-operations-closure.md)
- [`../13-operations/ops-01-pilot-configuration.md`](../13-operations/ops-01-pilot-configuration.md)
- [`../13-operations/ops-02-site-readiness-checklist.md`](../13-operations/ops-02-site-readiness-checklist.md)
- [`../16-release/ops-01-pilot-release-checklist.md`](../16-release/ops-01-pilot-release-checklist.md)
- [`../13-operations/pilot-signoff.md`](../13-operations/pilot-signoff.md)
