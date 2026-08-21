# OPS-02 / R16 — Release-Owner Signing Checklist (pinned)

**Pinned RC identity (do not substitute):**

| Field           | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| Branch          | `restaurant-vertical`                                        |
| Commit (short)  | `b236ef0`                                                    |
| Commit (full)   | `b236ef0b88af6593b30934bf3d147ab6c8ad9400`                   |
| Remote          | `origin/restaurant-vertical` @ `b236ef0` (pushed 2026-08-21) |
| Schema tip      | **v88**                                                      |
| Package version | **3.0.5**                                                    |
| Product         | Operavia                                                     |
| Bundle ID       | `com.operavia.desktop`                                       |

**Do not use `2.4.7` as the release version.** That string was only a stale `/api/health` fallback removed in OPS-02 (`b236ef0`).

**Statuses:** `PASS` · `FAIL` · `BLOCKED` · `PENDING` · `N/A`  
**Rule:** No PASS without evidence. Signing does not equal Live GO.

---

## 0. Preflight (release owner)

| #   | Check                                                                                                        | Status | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------ | ------ | -------- |
| 0.1 | `git fetch origin && git rev-parse origin/restaurant-vertical` == `b236ef0b88af6593b30934bf3d147ab6c8ad9400` |        |          |
| 0.2 | Clean checkout of that commit (no local WIP in RC tree)                                                      |        |          |
| 0.3 | Confirm `package.json` version is **3.0.5** (or approved bump **after** this pin is reissued)                |        |          |
| 0.4 | Confirm migrations tip **v88** in `main/database/migrations.ts`                                              |        |          |
| 0.5 | Eng gate pack present: `docs/qa/OPS-02-FINAL-REPORT.md`                                                      |        |          |

---

## 1. Credentials (macOS pilot path)

Populate on the **signing host** or GitHub Actions secrets (never commit secrets):

| Secret / identity                                    | Present? | Status |
| ---------------------------------------------------- | -------- | ------ |
| Developer ID Application (or `MAC_CERTS` + password) |          |        |
| Notarization API key (`APPLE_API_KEY` / ID / issuer) |          |        |
| Team ID (`BKDY677XJA` / `APPLE_TEAM_ID`)             |          |        |

If any required item is missing → **BLOCKED** (do not ship unsigned as PILOT).

Reference: `docs/qa/FINAL-SIGNING-READINESS.md`, `.github/workflows/release.yml`.

---

## 2. Build · sign · notarize

Preferred: tag/release workflow from **`b236ef0`**, or local:

```bash
git checkout b236ef0
npm ci
npm run build:frontend
npm run build
# With credentials available:
npm run build:mac
# or CI: release.yml / release-mac against this commit
```

| #   | Check                                                             | Status | Evidence |
| --- | ----------------------------------------------------------------- | ------ | -------- |
| 2.1 | Artifact built from **exactly** `b236ef0`                         |        |          |
| 2.2 | `codesign -dv --verbose=4` shows Developer ID (not adhoc)         |        |          |
| 2.3 | Notarization accepted; `stapler validate` / `spctl` OK            |        |          |
| 2.4 | SHA-256 of DMG/ZIP recorded                                       |        |          |
| 2.5 | Artifact class labeled **PILOT** or **PRODUCTION** (not TRAINING) |        |          |

---

## 3. Install verification (mandatory)

Install the **signed** artifact on a clean machine (not only open the build output folder).

| #   | Check                                                 | Status | Evidence |
| --- | ----------------------------------------------------- | ------ | -------- |
| 3.1 | Gatekeeper allows open (no adhoc quarantine fight)    |        |          |
| 3.2 | App launches; `/api/health` reports version **3.0.5** |        |          |
| 3.3 | Fresh or upgraded DB reaches schema **v88**           |        |          |
| 3.4 | Login + one smoke sale (create → pay)                 |        |          |

---

## 4. After install — site drills (do not skip)

Canonical: `docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`  
Record matrix: `docs/qa/OPS-02-MANUAL-TEST-MATRIX.md`

Pin the matrix “Artifact under test” line to:

```text
b236ef0 · schema v88 · package 3.0.5 · signed <artifact name + SHA-256>
```

Every OFF/POS/KDS/shift/backup row: **PASS / FAIL / BLOCKED** only.

---

## 5. Governance → Live GO

| Gate                         | Doc                                                                       | Status |
| ---------------------------- | ------------------------------------------------------------------------- | ------ |
| Master PIN escrow            | `docs/13-operations/r16-master-pin-escrow-attestation.md`                 |        |
| JWT/CSP residual acceptance  | written acceptance (Phase C deferred)                                     |        |
| Lifecycle residuals accepted | OPS-02-LIF-001 / LIF-002                                                  |        |
| QR keyless create            | **DEFER** QR-ORD-IDEM (no eng start)                                      |        |
| Executive sign-off           | `docs/13-operations/r16-executive-signoff-packet.md` → `pilot-signoff.md` |        |

**Live café Go-Live** only when signed RC + site drills + escrow + sign-off are **PASS**.

Until then:

```text
Engineering: CONDITIONAL GO (OPS-02 eng pack at b236ef0)
Live Café Go-Live: NO-GO
```

---

## Explicit non-claims

- Pushing `b236ef0` is **not** production release.
- Unsigned `npm run pack` remains TRAINING/QA only.
- Do not start QR-ORD-IDEM or new feature waves while Live P0s are open.
