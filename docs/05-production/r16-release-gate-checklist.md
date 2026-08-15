# R16 — Production Release Gate Checklist

**Role:** Release Gate Orchestrator artifact
**Date verified (engineering host):** 2026-08-15
**Branch:** `restaurant-vertical`
**HEAD at verification:** `91b3e3e` (docs) — confirm with `git log -1` before signing
**Schema tip (migrations):** **v86**
**Rule:** Do **not** mark PASS without evidence. Never fabricate signatures, notarization, site drills, escrow, or executive approval.

Status vocabulary: `PASS` · `PASS WITH CONDITIONS` · `PENDING` · `BLOCKED` · `FAIL` · `N/A`

---

## Verdict (this host)

| Gate                  | Status                   | Evidence                                                                |
| --------------------- | ------------------------ | ----------------------------------------------------------------------- |
| Engineering R1–R15    | **PASS WITH CONDITIONS** | Roadmap completion doc; suites below; tip assertions updated for v86    |
| Signed / notarized RC | **BLOCKED**              | `security find-identity` → **0** identities; artifact `Signature=adhoc` |
| OPS-02 site drills    | **PENDING**              | Checklist unchecked; no café worksheets attached                        |
| Master PIN escrow     | **PENDING**              | No escrow completion record (must stay out of git)                      |
| Executive sign-off    | **PENDING**              | CTO/CEO/pilot owner rows empty in `pilot-signoff.md`                    |
| **Live Go-Live**      | **NO-GO**                | All four human gates incomplete                                         |

Controlled Pilot: **READY WITH CONDITIONS** (engineering). Live café validation: **DEFERRED**.

---

## 1. Engineering

| Item                                | Status                   | Evidence / notes                                                                                        |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| R1–R15 complete (authorized deepen) | **PASS**                 | `docs/05-production/roadmap-engineering-completion-r0-r16.md`                                           |
| Schema tip v86 verified             | **PASS**                 | `main/database/migrations.ts` last `version: 86` (`r13_print_jobs`)                                     |
| `npm run build`                     | **PASS**                 | Verified 2026-08-15 on orchestrator host                                                                |
| `test:r10` … `test:r15`             | **PASS**                 | After tip-assert hygiene; see verification log section                                                  |
| `test:r9.6` tip asserts             | **PASS**                 | Updated to tip ≥86 / fresh == tip                                                                       |
| `test:h4`                           | **PASS**                 | 20/20                                                                                                   |
| Working tree reviewed               | **PASS WITH CONDITIONS** | Unrelated WIP present (staff/KDS/type-harden, `audit-v2/`) — **must not ship in RC**; leave uncommitted |
| Release commit history verified     | **PASS**                 | R10–R16 docs commits present; author Dev Raj Sharma; **not pushed** (ahead of origin)                   |
| R15 sim ≠ OPS-02                    | **PASS** (boundary)      | Documented; sim does not clear site drills                                                              |

### Engineering verification log (2026-08-15)

```text
npm run build → PASS
Schema tip source → 86
npm run test:r10 → 33/33 PASS (tip assert hygiene: >=84 / fresh==tip)
npm run test:r11 → 53/53 PASS
npm run test:r12 → 45/45 PASS
npm run test:r13 → 51/51 PASS
npm run test:r14 → ALL PASSED
npm run test:r15 → 27/27 PASS
npm run test:r9.6 → 14/14 PASS (tip assert hygiene: >=83 / fresh==tip)
npm run test:h4 → 20/20 PASS
codesign identities → 0; Operavia.app Signature=adhoc
zip SHA-256 → 09dd8638a68d0c86d75f696f21c9bfe31ebc5ec79be28e8641f7f51ddc1de129
```

---

## 2. Release Candidate

| Item                              | Status                   | Evidence / notes                                                                                |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| RC artifact identified            | **PASS WITH CONDITIONS** | Local only: `release/mac-arm64/Operavia.app` + `Operavia-3.0.5-arm64-UNSIGNED.zip` (gitignored) |
| Signed (Developer ID)             | **BLOCKED**              | `codesign` → `Signature=adhoc`; TeamIdentifier not set                                          |
| Notarized                         | **BLOCKED**              | No notarization ticket; `APPLE_*` / `CSC_*` unset                                               |
| Checksum recorded                 | **PASS** (unsigned zip)  | SHA-256 zip: `09dd8638a68d0c86d75f696f21c9bfe31ebc5ec79be28e8641f7f51ddc1de129` (re-verified)   |
| Provenance                        | **PASS WITH CONDITIONS** | TRAINING/QA / unsigned only — **not** PILOT/PRODUCTION class                                    |
| Codesign identities on build host | **BLOCKED**              | `0 valid identities found`                                                                      |

**Required for PASS:** Developer ID signed + notarized (macOS) artifact built from approved commit; path + checksum recorded on `pilot-signoff.md`; class = PILOT/PRODUCTION.

---

## 3. OPS-02 site drills

Canonical checklist: `docs/13-operations/ops-02-site-readiness-checklist.md`
Drill worksheet: `docs/13-operations/dr-drill-worksheet.md` (if used)
Operator pack: see `docs/13-operations/r16-ops-02-drill-script.md`

| Item                          | Status      | Evidence required                                       |
| ----------------------------- | ----------- | ------------------------------------------------------- |
| Site drill completed          | **PENDING** | Filled OPS-02 checklist A–H with café name/date         |
| Offline / LAN isolation drill | **PENDING** | Guest Wi‑Fi cannot reach 3001–3003                      |
| Backup/restore drill          | **PENDING** | Worksheet + restore success on café host                |
| Corrupt-DB recovery drill     | **PENDING** | Observe recovery_required / restore clear (R14) on café |
| Payment / day-close / Z drill | **PENDING** | Operating drill section E                               |
| Operational evidence recorded | **PENDING** | Paths/screenshots/worksheets (not empty checkboxes)     |
| Drill sign-off recorded       | **PENDING** | Operator initials on checklist / pilot-signoff          |

---

## 4. Master PIN escrow

| Item                          | Status                | Evidence required                                      |
| ----------------------------- | --------------------- | ------------------------------------------------------ |
| Escrow configured             | **PENDING**           | Offline paper/envelope **per café** — never commit PIN |
| Recovery procedure documented | **PASS** (docs exist) | `pilot-runbook.md` § Master PIN                        |
| Access controlled             | **PENDING**           | Dual-control / sealed envelope process at site         |
| Verification recorded         | **PENDING**           | Sign-off that escrow exists (no PIN value in repo)     |

Template: `docs/13-operations/r16-master-pin-escrow-attestation.md`

---

## 5. Executive approval

| Item                            | Status      | Evidence required                                  |
| ------------------------------- | ----------- | -------------------------------------------------- |
| Authorized approvers identified | **PENDING** | Names on `pilot-signoff.md`                        |
| Sign-off recorded               | **PENDING** | CTO / CEO / pilot owner signatures                 |
| Date recorded                   | **PENDING** | Signature dates                                    |
| Release decision recorded       | **PENDING** | Live service GO only when all mandatory gates PASS |

Template remains: `docs/13-operations/pilot-signoff.md`

---

## 6. Explicit non-claims (current)

- Live production / live café PASS — **NOT CLAIMED**
- Go-Live GO — **NOT CLAIMED**
- Signed RC VERIFIED — **NOT CLAIMED**
- Site drills PASS — **NOT CLAIMED**

---

## 7. Human action order (recommended)

1. Obtain Apple Developer ID + notarization credentials (or Windows Authenticode if Windows café).
2. Build signed/notarized RC from clean tree **without** unrelated WIP; record commit SHA + checksums on `pilot-signoff.md`.
3. Install **signed** RC on café hardware; complete `ops-02-site-readiness-checklist.md` using `r16-ops-02-drill-script.md`.
4. Complete Master PIN escrow attestation (paper only).
5. Collect Operational + CTO + CEO signatures on `pilot-signoff.md`.
6. Only then flip Live Go-Live to GO and update this checklist + `r16-production-release-blocker.md`.

---

## Related

- Blocker summary: `docs/05-production/r16-production-release-blocker.md`
- Engineering completion: `docs/05-production/roadmap-engineering-completion-r0-r16.md`
- OPS-02 audit: `docs/05-production/ops-02-live-pilot-rc-site-readiness.md`
