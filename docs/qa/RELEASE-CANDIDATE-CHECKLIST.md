# Release Candidate Checklist

**Product:** OPERAVIA Restaurant (FloCafe)  
**Version:** 3.0.5  
**Schema tip:** v86  
**Unsigned RC path:** `release/mac-arm64/Operavia.app` (~413 MB, darwin-arm64, adhoc)  
**Rule:** Check only with evidence. Engineering PASS ≠ site PASS.  
**Status labels:** PASS · BLOCKED · NOT TESTED · REQUIRES REAL SITE · REQUIRES SIGNING CREDENTIALS · REQUIRES POLICY/APPROVAL

---

### Engineering

- [x] Build (`npm run build`) — **PASS** (unsigned RC pass 2026-08-15)
- [x] Typecheck (`npx tsc --noEmit`, `npx tsc -p frontend --noEmit`) — **PASS** (prior hardening)
- [x] Unit tests (GUI-0001…0003, GUI-0005/0006; day-close-z) — **PASS** (prior)
- [x] Integration tests (JWT lifecycle; money dual-write; backup data-path; day-close) — **PASS** (prior)
- [ ] E2E tests (full Electron packaged e2e on clean machine) — **NOT TESTED**
- [x] npm audit (`npm audit --omit=dev` → 0) — **PASS** (re-run this pack)
- [x] Secrets scan (artifact) — **PASS** (no `E2ePass123!` / private keys / signing secrets; `@flo.local` placeholders only)
- [x] RBAC audit — **PASS** (prior GUI evidence)
- [x] Money smoke — **PASS** (prior)
- [x] Backup tests (code-path) — **PASS**; desktop Master PIN restore — **REQUIRES REAL SITE** / **BLOCKED** on e2e-as-node
- [x] P1-06 unopenable DB fail-closed — **PASS** (prior)

### Security

- [ ] JWT decision — **REQUIRES POLICY/APPROVAL** (Phase C residual: localStorage)
- [ ] CSP decision — **REQUIRES POLICY/APPROVAL** (Phase C: `unsafe-inline`)
- [ ] localStorage decision — **REQUIRES POLICY/APPROVAL** (same as JWT)
- [x] production secrets in artifact — **PASS** (scan this pack)
- [x] database path when packaged — **PASS** (`userData/flo.db` in code)
- [ ] Master PIN set + offline escrow — **REQUIRES REAL SITE** / **REQUIRES POLICY/APPROVAL**

### Packaging

- [x] Production build — **PASS**
- [x] Electron package (`npm run pack` → `--dir`) — **PASS** (unsigned)
- [ ] Signed build — **REQUIRES SIGNING CREDENTIALS**
- [ ] Notarized build — **REQUIRES SIGNING CREDENTIALS**
- [x] Version verification (Info.plist / asar / root package = 3.0.5) — **PASS**
- [ ] Clean-machine installation — **NOT TESTED**
- [ ] Note: `frontend/package.json` still **0.1.0** (metadata drift; not silently bumped)

### Operations

- [ ] Printer — **REQUIRES REAL SITE** (OPS-02)
- [ ] KDS/LAN — **REQUIRES REAL SITE**
- [ ] Offline / WAN loss — **REQUIRES REAL SITE**
- [ ] Backup — **REQUIRES REAL SITE**
- [ ] Restore — **REQUIRES REAL SITE** (real desktop)
- [ ] Day-close — **REQUIRES REAL SITE** (site worksheet; eng suites prior PASS)
- [ ] Force-close — **REQUIRES REAL SITE**
- [ ] Power-loss recovery — **REQUIRES REAL SITE**

See: [`docs/ops/OPS-02-SITE-DRILL-CHECKLIST.md`](../ops/OPS-02-SITE-DRILL-CHECKLIST.md)

### Governance

- [ ] Backup policy approved — **REQUIRES POLICY/APPROVAL**
- [ ] Security residuals accepted — **REQUIRES POLICY/APPROVAL**
- [ ] Pilot approved — **REQUIRES POLICY/APPROVAL**
- [ ] Executive sign-off — **REQUIRES POLICY/APPROVAL**

---

## Blocking for live café (not engineering suite)

1. Signed/notarized RC for target OS — **REQUIRES SIGNING CREDENTIALS**
2. OPS-02 site drills with evidence — **REQUIRES REAL SITE**
3. Master PIN escrow + desktop backup/restore proof — **REQUIRES REAL SITE**
4. Written acceptance of security residuals **or** Phase C — **REQUIRES POLICY/APPROVAL**
5. Pilot / executive sign-off — **REQUIRES POLICY/APPROVAL**

**Unsigned RC decision:** **READY FOR SIGNING** — see [`FINAL-UNSIGNED-RC-REPORT.md`](./FINAL-UNSIGNED-RC-REPORT.md).  
Until signed + OPS-02 + governance: **CONDITIONAL GO** for live café only.
