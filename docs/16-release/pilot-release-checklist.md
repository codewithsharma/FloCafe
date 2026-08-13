# Pilot Release Checklist (P1.6)

**Product:** Nexora POS (`flo-desktop`)  
**Audience:** CTO / Release Engineer / Pilot Owner  
**Related:** [`pilot-signoff.md`](../13-operations/pilot-signoff.md) · [`pilot-runbook.md`](../13-operations/pilot-runbook.md) · [`dr-drill-worksheet.md`](../13-operations/dr-drill-worksheet.md) · [`release-checklist.md`](./release-checklist.md)

Use this checklist for a **controlled first-café pilot**. Mark each item only with evidence. Do not equate automated tests with on-site operational verification.

**Status legend:** `PASS` · `FAIL` · `PENDING` · `NOT APPLICABLE` · `TRAINING/QA ONLY`

---

## A. Release identity

| Item | Value / evidence | Status |
|------|------------------|--------|
| Product version (`package.json`) | **3.0.5** | Recorded |
| Git commit (tree at audit) | `e236542f7d023558e7eb25576a2413fa96ecf25a` on `develop` | Recorded |
| Working tree | **Dirty** — uncommitted P1.5 hotfixes (REC-01 startup, shift Settings allowlist, ops docs). Pilot/production artifact must be built from a **clean, tagged** commit after merge. | PENDING clean release tag |
| Build timestamp (local training pack) | Info.plist / app mtime ~ **2026-08-13** (local `release/mac-arm64/Nexora.app`) | TRAINING/QA ONLY |
| Platform (this audit host) | macOS arm64 | Recorded |
| Artifact (local) | `release/mac-arm64/Nexora.app` — **adhoc / linker-signed**, TeamIdentifier not set, **not notarized** | TRAINING/QA ONLY |

| Channel | Command | Pilot use |
|---------|---------|-----------|
| macOS production | `npm run build:mac` (CI: notarized; requires `MAC_CERTS` / Apple API key) | PENDING — production signing |
| Windows NSIS | `npm run build:win` | PENDING — **WIN-01 signed** required for Windows café pilots |
| Windows AppX | `npm run build:appx` | Store path; separate Store identity |
| Linux | `npm run build:linux` | PENDING — keyring verification on target |

**TRAINING/QA ≠ PILOT/PRODUCTION.** An unsigned or adhoc-signed local pack may be used for isolated drills only. Do not open live café service on a TRAINING/QA binary.

---

## B. Installation

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| B1 | Packaged build (not `npm run dev`) | PENDING | Pilot must use production/notarized (or signed) channel for live service |
| B2 | Fresh install on target café machine | PENDING | Per-café |
| B3 | `FIRST_INSTALL` / setup only when truly new | PENDING | Per-café; see REC-01 STOP RULE |
| B4 | Café creation | PENDING | Per-café |
| B5 | Owner creation | PENDING | Per-café |
| B6 | Isolated training smoke (optional engineering) | **PASS** | `$HOME/nexora-p1-6-fresh-smoke`; flo-desktop Local State untouched; see `p1.6-pilot-release-readiness.md` |

---

## C. Core POS

| # | Check | Status | Evidence notes |
|---|--------|--------|----------------|
| C1 | Login | PENDING (café) / automated suites PASS | `npm test` / security suites |
| C2 | Catalog | PENDING (café) | |
| C3 | Order | PENDING (café) | P1.5 DR training fixture exercised orders |
| C4 | Cash payment | PENDING (café) | |
| C5 | Card/UPI payment | PENDING (café) | |
| C6 | Partial payment | PENDING (café) | FIN-01 product CLOSED; DR fixture verified |
| C7 | Refund | PENDING (café) | `test:refunds` + DR |
| C8 | Outstanding balance (FIN-01) | **VERIFIED** (packaged DR) / PENDING café re-confirm | Non-cash ₹401 reject / exact ₹400 accept; cash over-tender is change-on-cash (applied capped) |
| C9 | Shift open/close | **VERIFIED** (packaged DR) / PENDING café | Shift Settings enablement FIXED |
| C10 | Day close | **VERIFIED** (packaged DR) / PENDING café | |

---

## D. Recovery

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| D1 | Master PIN backup | **PASS** (P1.5 DR) | `flo-backup-2026-08-13T03-09-17-436Z-883089da.db` |
| D2 | DB loss → marker retained | **PASS** (P1.5 DR) | Isolated UD `$HOME/nexora-p1-5-dr-final` |
| D3 | `RECOVERY_REQUIRED` alive | **PASS** (P1.5 DR) | REC-01; no empty café |
| D4 | Setup blocked | **PASS** (P1.5 DR) | HTTP 503 |
| D5 | Money routes blocked | **PASS** (P1.5 DR) | HTTP 503 |
| D6 | Recovery UI | **PASS** (P1.5 DR) | `/recovery` |
| D7 | Master PIN restore | **PASS** (P1.5 DR) | UI + exact backup path |
| D8 | ACTIVE after restore | **PASS** (P1.5 DR) | |
| D9 | Financial verification | **PASS** (P1.5 DR) | FIN-01 continuity |
| D10 | Post-restore sale | **PASS** (P1.5 DR) | Controlled test sale |
| D11 | Observed RTO / RPO | **PASS** (drill) | RTO **6.12 min**; RPO **18 s** (≤30 min drill target) |
| D12 | New-machine JWT restore path | **NOT VERIFIED** | Same-machine JWT PASS only |

---

## E. Operations

| # | Check | Status | Evidence |
|---|--------|--------|----------|
| E1 | KDS | **PASS** post-restore ports (DR) / PENDING café hardware | :3002 listening after ACTIVE |
| E2 | Printer | **NOT VERIFIED** | No printers in DR environment |
| E3 | Server App | **PASS** ports (DR) / PENDING café | :3003 after ACTIVE |
| E4 | localhost / LAN mode | **PASS** (DR localhost) / PENDING café OPS-01 | |
| E5 | mDNS | **PASS** (skipped in recovery; localhost post-restore) | |
| E6 | OPS-01 accepted & enforced on site | **PENDING** | CEO/operator + café network |

---

## F. Security

| # | Check | Status | Notes |
|---|--------|--------|-------|
| F1 | Owner/manager permissions | PENDING café hygiene | Product gates CLOSED (authz suites) |
| F2 | Staff restrictions | PENDING café | |
| F3 | Master PIN escrow (offline) | **PENDING** | Must not store PIN in chat/Drive/DB |
| F4 | JWT (`jwt-secret.enc` / safeStorage) | **PASS** same-machine DR / PENDING Linux keyring if Linux | |
| F5 | Signed production artifact | **PENDING** | Local app = TRAINING/QA adhoc |
| F6 | Phase C (CSP / session JWT) | **Deferred** — do not start | Residual XSS→JWT risk accepted with conditions |

---

## G. Backup

| # | Check | Status |
|---|--------|--------|
| G1 | Backup frequency (approved pilot policy) | **POLICY VALUE PENDING APPROVAL** |
| G2 | Local retention (approved) | **POLICY VALUE PENDING APPROVAL** |
| G3 | Drive retention (approved) | **POLICY VALUE PENDING APPROVAL** (product default 10 exists; not pilot SLA) |
| G4 | Backup sensitivity (PII) briefed | **PENDING** café |
| G5 | Restore verification (DR) | **PASS** (P1.5) |

Recommended (not approved SLA): verify ≥1 local backup per service day; treat `.db` as sensitive.

---

## H. Incident handling

| # | Check | Status |
|---|--------|--------|
| H1 | S1–S4 understood | See `incident-response.md` + `pilot-incident-log.md` |
| H2 | REC-01 STOP RULE briefed | **PENDING** café training (product CLOSED) |
| H3 | Escalation path | Owner → support/engineering; GitHub Issues |
| H4 | Rollback awareness | `rollback.md` |
| H5 | Pilot incident log ready | `pilot-incident-log.md` |

---

## I. Sign-off

| Role | Name | Date | Signature / initials |
|------|------|------|----------------------|
| CTO | | | |
| CEO / operator | | | |
| Pilot owner (café) | | | |

Attach completed [`pilot-signoff.md`](../13-operations/pilot-signoff.md) and executed [`dr-drill-worksheet.md`](../13-operations/dr-drill-worksheet.md) to the go-live packet.

**Do not open live service until mandatory gates in `pilot-signoff.md` are PASS or explicitly waived by CEO/CTO.**
