# Release Candidate Checklist

**Product:** OPERAVIA Restaurant (FloCafe)  
**Version:** 3.0.5  
**Schema tip:** v86  
**Rule:** Check only with evidence. Engineering PASS ≠ site PASS.

---

### Engineering

- [x] Build (`npm run build`) — verified this hardening pass
- [x] Typecheck (`npx tsc --noEmit`, `npx tsc -p frontend --noEmit`)
- [x] Unit tests (GUI-0001…0003, GUI-0005/0006; day-close-z contracts)
- [x] Integration tests (JWT logout lifecycle; money dual-write; backup-restore data-path)
- [ ] E2E tests (full Electron packaged e2e on clean machine — **not claimed here**)
- [x] npm audit (`npm audit --omit=dev` → 0)
- [x] Secrets scan (prior production readiness audit SAFE)
- [x] RBAC audit (GUI matrix failCount 0; route AuthGuard)
- [x] Money smoke (฿64.20 prior RC QA; money-cents 20/20 this pass)
- [x] Backup tests (code-path `backup-restore.test.ts` PASS; **desktop Master PIN restore still operational**)
- [x] P1-06 unopenable DB fail-closed (`tests/p1-06-unopenable-db.test.ts`)

### Security

- [ ] JWT decision — **Phase C residual accepted in writing** (localStorage `token`/`tenant`; 24h / 10d remember; server revoke on logout; refresh API unused by UI)
- [ ] CSP decision — **Phase C residual accepted in writing** (`unsafe-inline` script/style via Helmet for Next static export + Tailwind)
- [ ] localStorage decision — same as JWT (HttpOnly cookie migration = multi-surface Phase C)
- [x] production secrets — no tracked `.env`; JWT secret via `safeStorage` when available
- [x] database encryption / integrity — WAL SQLite + R14 integrity latch; OS-level DB encryption not claimed
- [ ] Master PIN — set + **offline escrow** on pilot host (BLOCKED on e2e-as-node)

### Packaging

- [x] Production build (`npm run build` + `npm run build:frontend`)
- [ ] Electron package (`npm run pack` / `build:mac` / `build:win` / `build:linux` as target)
- [ ] Signed build (requires `CSC_LINK` / platform identity — do not invent)
- [ ] Notarized build (mac: `APPLE_API_KEY*` + electron-builder `notarize: true`)
- [ ] Version verification on installed artifact
- [ ] Clean-machine installation

**Unsigned RC:** `npm run build && npm run build:frontend && npm run pack` (or platform `build:*` with `CSC_IDENTITY_AUTO_DISCOVERY=false`).  
**Signed RC:** same with signing env present (`CSC_LINK`, `CSC_KEY_PASSWORD`, mac identity).  
**Notarized RC (mac):** signed + Apple notarization API credentials configured.

### Operations

- [ ] Printer — OPS-02 drill 1–2
- [ ] KDS/LAN — OPS-02 drill 3–4
- [ ] Offline / WAN loss — OPS-02 drill 5–6
- [ ] Backup — OPS-02 drill 8
- [ ] Restore — OPS-02 drill 7 (**real desktop**)
- [ ] Day-close — OPS-02 drill 10
- [ ] Force-close — covered under day-close / shift policy
- [ ] Power-loss recovery — OPS-02 drill 12

See: [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md)

### Governance

- [ ] Backup policy approved
- [ ] Security residuals accepted (JWT/localStorage + CSP unsafe-inline **or** Phase C remediation scheduled)
- [ ] Pilot approved
- [ ] Executive sign-off

---

## Blocking for live café (not engineering suite)

1. Signed/notarized RC artifact for target OS
2. OPS-02 site drills executed with evidence
3. Master PIN escrow + desktop backup/restore proof
4. Written acceptance of security residuals **or** Phase C
5. Pilot / executive sign-off

Until then: **CONDITIONAL GO** only.
