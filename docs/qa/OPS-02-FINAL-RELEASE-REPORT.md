# R16 / OPS-02 FINAL RELEASE REPORT

**Role:** Release Owner / Senior Release Engineer  
**Date:** 2026-08-21  
**Host:** engineering macOS (darwin)  
**Rule:** No fabricated PASS. Signing credentials absent → stop at Phase 2.

---

## Release Identity

| Field                | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| Branch               | `restaurant-vertical`                                      |
| Product commit       | **`b236ef0`** (`b236ef0b88af6593b30934bf3d147ab6c8ad9400`) |
| Docs tip (checklist) | `4c1543b` (docs-only; not product)                         |
| Schema               | **v88**                                                    |
| Package              | **3.0.5**                                                  |
| Signing checklist    | `docs/qa/OPS-02-RC-SIGNING-CHECKLIST-b236ef0.md`           |

**Not used as release version:** `2.4.7` (retired health fallback).

---

## Phase results

### Phase 1 — Verify release baseline

| Check                             | Result   | Evidence                                                                                    |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Branch `restaurant-vertical`      | **PASS** | `git branch --show-current` → `restaurant-vertical` (then detached checkout of product tip) |
| Product commit `b236ef0`          | **PASS** | `git checkout b236ef0` → `HEAD = b236ef0b88af6593b30934bf3d147ab6c8ad9400`                  |
| Package `3.0.5`                   | **PASS** | `package.json` → `3.0.5`                                                                    |
| Schema tip `v88`                  | **PASS** | `main/database/migrations.ts` `version: 88`                                                 |
| Working tree clean on product tip | **PASS** | Clean at `b236ef0` after checkout                                                           |
| Initial tip before pin checkout   | **N/A**  | Was `4c1543b` (docs-only); corrected to `b236ef0` before further gates                      |

### Phase 2 — Apple signing readiness

| Check                                                     | Result      | Evidence                                                                    |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| Developer ID Application in keychain                      | **BLOCKED** | `security find-identity -v -p codesigning` → **`0 valid identities found`** |
| `CSC_LINK` / `MAC_CERTS`                                  | **BLOCKED** | unset in environment                                                        |
| `CSC_KEY_PASSWORD` / `MAC_CERTS_PASSWORD`                 | **BLOCKED** | unset                                                                       |
| `APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER` | **BLOCKED** | unset                                                                       |
| GitHub Actions signing secrets (this host)                | **BLOCKED** | No usable secret values available to this session; local keychain empty     |

```text
BLOCKED — signing credentials unavailable
```

No credentials printed. No bypass attempted.

### Phase 3 — Build the RC (signed production path)

| Check                                                  | Result              | Evidence                                                                           |
| ------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------- |
| `build:mac` / `release-mac` signed production artifact | **BLOCKED**         | Stopped after Phase 2 — credentials required for PILOT/PRODUCTION class            |
| Prior unsigned pack (eng OPS-02)                       | **N/A for Live GO** | Historical unsigned `release/mac-arm64/Operavia.app` exists; **not** release-class |

Record (signed path not executed):

```text
Commit: b236ef0
Build command: NOT RUN (signing BLOCKED)
Build timestamp: N/A
Package version: 3.0.5 (source)
Schema version: v88 (source)
Artifact name: N/A (signed)
Artifact location: N/A (signed)
Build result: BLOCKED
```

### Phase 4 — Signing verification

| Check                          | Result                     | Evidence                                                     |
| ------------------------------ | -------------------------- | ------------------------------------------------------------ |
| Developer ID signature on RC   | **BLOCKED**                | No signed RC produced this session                           |
| Local leftover `.app` (if any) | **FAIL** as pilot artifact | `codesign -dv` → `Signature=adhoc`, `TeamIdentifier=not set` |

```text
BLOCKED
```

### Phase 5 — Notarization

```text
BLOCKED
```

No submission. No staple. No notarization ticket. Upload ≠ notarization; neither occurred.

### Phase 6 — Install signed artifact

```text
BLOCKED
```

Mandatory install of signed/notarized artifact **not performed** — artifact does not exist on this host.

Health version **3.0.5** on installed signed RC: **NOT TESTED** (blocked upstream).

### Phase 7 — Production smoke (on signed install)

```text
NOT TESTED
```

Blocked — requires Phase 6.

### Phase 8 — Café site drills

```text
NOT TESTED
```

| Scenario         | Result         | Evidence          |
| ---------------- | -------------- | ----------------- |
| OFF-01 … OFF-08  | **NOT TESTED** | No signed install |
| POS matrix       | **NOT TESTED** | No signed install |
| KDS matrix       | **NOT TESTED** | No signed install |
| Shift matrix     | **NOT TESTED** | No signed install |
| Backup / restore | **NOT TESTED** | No signed install |

Templates remain: `docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`, `docs/qa/OPS-02-MANUAL-TEST-MATRIX.md`.

### Phase 9 — Governance

| Gate                     | Result                                     | Owner                                                                       |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| Master PIN escrow        | **BLOCKED** / PENDING                      | Human — no escrow attestation completed this session                        |
| Desktop DR ownership     | **BLOCKED** / PENDING                      | Human                                                                       |
| JWT / CSP Phase C        | **PENDING** — disposition not newly signed | Accept as **ACCEPTED RISK** requires explicit owner signature (not assumed) |
| OPS-02-LIF-001 / LIF-002 | Documented **ACCEPTED** in eng pack        | Still needs release-owner confirm on signed path                            |
| OPS-02-LIF-003           | Covered by site drills                     | **NOT TESTED**                                                              |
| QR-ORD-IDEM              | **DEFERRED**                               | Confirmed — not implemented this phase                                      |

### Phase 10 — Executive sign-off

```text
PENDING
```

Cannot request GO without signed RC + drills + governance evidence.

---

## Signing

Result: **BLOCKED**  
Evidence: `0 valid identities found`; env Apple/`CSC_*` unset; no signed artifact.

## Notarization

Result: **BLOCKED**  
Evidence: Not attempted (upstream signing BLOCKED).

## Installed Artifact

Result: **BLOCKED**  
Environment: N/A  
Health Version: **NOT TESTED** (must be **3.0.5** when available; never accept **2.4.7**)

## Production Smoke Test

Result: **NOT TESTED**

## Site Drills

Result: **NOT TESTED**

## Governance

Result: **BLOCKED** (escrow/DR/acceptance not completed)

## Remaining Risks

| Risk                                                     | Severity   | Disposition                                   |
| -------------------------------------------------------- | ---------- | --------------------------------------------- |
| No Developer ID / notarization credentials on build host | P0 release | **BLOCKED** — populate secrets / signing host |
| Live site drills unexecuted on signed RC                 | P0 release | **NOT TESTED**                                |
| Master PIN escrow / exec sign-off incomplete             | P0 ops     | **PENDING**                                   |
| JWT/CSP Phase C residual                                 | P1 eng     | Needs **explicit** ACCEPTED RISK or Phase C   |
| Adhoc local `.app` mistaken for pilot RC                 | P0 process | Reject — `Signature=adhoc`                    |

## Final Decision

```text
NO-GO
```

### Rationale

- Signing **BLOCKED** — credentials unavailable.
- Notarization **BLOCKED**.
- Installed signed artifact **BLOCKED**.
- Site drills **NOT TESTED**.
- Governance **not** complete.
- Engineering CONDITIONAL GO at `b236ef0` remains valid for **eng**; Live café deployment is **NO-GO**.

## Executive Sign-off

Status: **PENDING**

## R16 / OPS-02 Status

```text
PARTIAL
```

Engineering gates: complete at `b236ef0`.  
Release-owner path: **stopped at Phase 2 (signing readiness)**.

---

## Explicit non-claims

- Did **not** claim signed RC VERIFIED.
- Did **not** claim notarization PASS.
- Did **not** claim site drills executed.
- Did **not** start QR-ORD-IDEM or product code changes.
- Did **not** treat adhoc `Operavia.app` as pilot-class.

---

## Next Action (release owner)

1. Provision Developer ID + notarization credentials on a designated **signing host** (or GitHub Actions secrets for `release.yml`).
2. Re-run from Phase 2 of `docs/qa/OPS-02-RC-SIGNING-CHECKLIST-b236ef0.md` pinned to **`b236ef0`**.
3. Install signed/notarized artifact → confirm `/api/health` = **3.0.5**.
4. Execute site drills + governance + executive sign-off.
5. Only then reconsider Live **GO**.
