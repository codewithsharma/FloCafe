# DevOps & Release Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5
**Scope:** CI (`.github/workflows/ci.yml`), release pipeline (`release.yml`, `nightly-release.yml`, `tax-pack-release.yml`), electron-builder packaging (`package.json` `build`), Dependabot, pre-commit hooks, auto-update, observability. Read-only.

> Verdict: **the release engineering is unusually mature for a project this size — SHA-pinned actions, cross-platform packaging, full macOS sign+notarize with double post-publish verification, auto-update manifest integrity gates, and tag/CHANGELOG consistency checks.** The real gaps are **distribution signing** (Windows ships **unsigned**; the signed macOS path is **blocked on credentials not present**) and **CI platform/coverage breadth** (functional tests are **Linux-only**; the Vitest unit layer and 63 orphaned suites don't gate merges — see TESTING-AUDIT).

---

## 1. Posture summary

| Area                        | State                                                                 | Evidence                                                  |
| --------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| CI provider / triggers      | GitHub Actions; push+PR to `main`                                     | `ci.yml:7-11`                                             |
| Action supply-chain hygiene | **All actions SHA-pinned**                                            | `ci.yml`, `release.yml` (every `uses:` has `@<sha> # vX`) |
| Dependency security gate    | `dependency-review-action` fail-on High                               | `ci.yml:23-31`                                            |
| Build reproducibility       | `npm ci` + committed lockfiles                                        | `ci.yml`, `release.yml`                                   |
| Cross-platform packaging    | Linux (x64+arm64), macOS (universal), Windows (nsis)                  | `release.yml`, `package.json` `build`                     |
| macOS signing/notarization  | Implemented + **triple-verified**, but **blocked on missing secrets** | `release.yml:201-370` + `docs/qa`                         |
| Windows signing             | **Unsigned** (documented, needs signing service)                      | `release.yml:386-402`                                     |
| Auto-update                 | electron-updater + manifest integrity checks                          | `release.yml:292-313,415-422`                             |
| Pre-commit                  | husky + lint-staged (eslint + prettier)                               | `package.json:505-516`                                    |
| Functional-test platforms   | **Linux only**                                                        | `ci.yml` (all jobs `ubuntu-latest`)                       |

## 2. CI (`ci.yml`) — assessment

**Jobs:** `dependency-review` (PRs, fail-on High) · `changes` (path filtering) · `tax-category-invariant` (always runs `test:tax-engine` — the "no category → no tax" safety net, deliberately outside path filters) · `linux-baseline` (backend lint → `tsc --noEmit` → frontend lint → frontend build → `npm test` → `m1-gate` → `coverage:baseline` → upload coverage) · `e2e-playwright` (Playwright chromium against a full build).

**Strengths:** SHA-pinned actions; Node 22 with npm cache; native rebuild via `@electron/rebuild`; a standalone always-on tax invariant; path-filtered heavy jobs; frontend **is** linted, type-built, and E2E-tested here (correcting a common misconception — see FRONTEND-AUDIT §2.6); coverage artifact uploaded.

**Gaps (cross-referenced to TESTING-AUDIT):**

- **Linux-only functional testing (Medium-High).** All jobs `runs-on: ubuntu-latest`. Windows/macOS-specific code — `rewriteNextExportPath`, CUPS-vs-Windows-RAW printing, native rebuild, `kill-ports.js` — is only _built_ at release, never _functionally tested_. (TESTING §3.7.)
- **Vitest unit layer + `validate` not gated (Medium).** CI runs `npm test`, not `npm run validate`, so root `test:unit` and frontend `test:unit` never gate merges. (TESTING §3.2.)
- **63 orphaned `test:*` scripts + 11 unwired files (High).** `npm test` is a hand-maintained serial `&&` chain; authored suites — including `r14-corrupt-db`, `process-kill-recovery`, and the `*-boundary` R4.1 guards — don't run in CI. A glob runner would make orphaning impossible. (TESTING §3.1.)

## 3. Release pipeline (`release.yml`) — assessment

Triggered on `X.Y.Z` tags (and `workflow_dispatch`). This is the strongest DevOps asset in the repo:

- **Pre-flight gates:** strict `X.Y.Z` tag validation that must equal `package.json` version (`:31-51`, closes #220); **CHANGELOG-driven** release notes that **fail loudly** if the version has no `## [X.Y.Z]` entry (`:53-81`); full-changelog compare link.
- **Linux:** matrix x64 (`ubuntu-24.04`) + arm64 (`ubuntu-24.04-arm`), each producing AppImage + deb + rpm + snap, with LXD-backed snap builds and optional Snap Store publish (skips cleanly if `SNAPCRAFT_STORE_CREDENTIALS` absent). Per-arch concurrency scoping; artifact-count assertion before upload.
- **macOS:** one job builds **both archs** (x64+arm64), **hardened-runtime signed + notarized** via App Store Connect API key; then **verifies three times** — local `codesign --verify --deep --strict` + `spctl --assess` + `xcrun stapler validate`, an auto-update-manifest completeness check (`latest-mac.yml` `.zip` entries == built `.zip`s), **and a re-download of the just-published artifact re-run through the same checks** (guards upload corruption / `--clobber` / GitHub storage). This is defense-in-depth most shipping teams don't do.
- **Windows:** nsis build with `latest.yml` + `.exe.blockmap` auto-update integrity checks.
- **Concurrency:** `cancel-in-progress: false` with a documented rationale (a release tag doesn't move; cancelling mid-upload can leave a half-published release — #178).

## 4. DevOps findings

### O1 — Windows binaries ship unsigned (Medium)

- **Location:** `release.yml:386-402` — "Check Windows signing credentials" **warns** and continues; `:404-413` builds with `CSC_IDENTITY_AUTO_DISCOVERY: false` and empty certs.
- **Evidence/Why it matters:** the workflow explicitly logs _"building an UNSIGNED Windows installer. Users will see a SmartScreen 'Windows protected your PC' prompt."_ Unsigned installers hurt trust and install conversion, and offer no tamper assurance. The code documents the blocker: post-2023 CA/Browser-Forum rules require the signing key on a hardware token / cloud HSM, so this needs a signing-service integration (e.g. SignPath Foundation's free OSS program), not just two secrets.
- **Recommendation:** integrate a code-signing service; until then, document the SmartScreen step for Windows users. **Confidence:** High.

### O2 — Signed/notarized macOS release is blocked on missing credentials (Medium — release-readiness)

- **Location:** `release.yml:227-256` requires `MAC_CERTS`, `MAC_CERTS_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` and **fails the build** if any is absent; recent `docs/qa` records (see git log: _"signing readiness blocked on missing credentials"_) indicate these secrets are **not currently configured**.
- **Why it matters:** the pipeline is correct and fail-closed, but as configured **no signed macOS release can currently be produced** from CI. Whether a signed macOS artifact has ever shipped from this pipeline is **NOT VERIFIED** from the repo alone.
- **Recommendation:** provision the App Store Connect API key + Developer ID cert secrets; run one signed release end-to-end and confirm the triple-verification passes. **Confidence:** High (that the gate blocks without secrets); the shipped-signed-build history is unverifiable here.

### O3 — CI functional tests are Linux-only (Medium-High)

- **Cross-ref:** TESTING-AUDIT §3.7. The app ships Windows + macOS targets whose platform-specific code paths (printing especially) can regress undetected. **Recommendation:** add at least a Windows CI job for printing-path units, path rewriting, and native rebuild. **Confidence:** High.

### O4 — Merge gate omits the unit layer and most authored suites (High, shared)

- **Cross-ref:** TESTING-AUDIT §3.1/§3.2. Gate `test:unit`; adopt a directory-glob test runner so new/orphaned suites run by default. **Confidence:** High.

### O5 — `npm ci` on every dev launch (Low — dev experience)

- **Cross-ref:** PERFORMANCE-AUDIT §3.9. `build:frontend` runs `npm ci` (full reinstall) on every `npm run dev`. Use `npm install` for dev, keep `npm ci` for release. **Confidence:** High.

## 5. Runtime ops & observability

- **Logging:** structured `pino` + `pino-http` (redaction-configured) and `electron-log`; **but** the pino logger is imported by only one file — 483 `console.*` calls bypass it (CODE-QUALITY §3 / SECURITY §3 note). Structured logging exists but is under-adopted.
- **Telemetry:** `@opentelemetry/api` plus a custom telemetry pipeline **gated by privacy consent** (`telemetry-delivery` + `privacy-consent` tests) — appropriate for a privacy-first local-first app.
- **Auto-update:** `electron-updater` (GitHub provider); release pipeline verifies the update manifests (`latest-mac.yml`/`latest.yml` + blockmaps) so silent background updates aren't shipped broken — a class of bug the comments show was previously hit and specifically hardened against.
- **Backup/DR:** SQLite-backup-API backups + optional Google Drive + cloud-sync outbox + R14 corrupt-DB fail-closed (DATABASE-AUDIT S4–S6). Strong.
- **Repo hygiene:** `CODEOWNERS`, issue templates, PR template, husky + lint-staged pre-commit (eslint + prettier on `main/**`, prettier on frontend + json/md/yml). `nightly-release.yml` and `tax-pack-release.yml` exist as additional pipelines (signed tax-pack distribution is part of the tax-engine trust model).

## 6. Verdict

**DevOps maturity: high on release engineering, uneven on test-gating breadth, blocked on distribution signing.** The release pipeline (sign/notarize + triple verification + auto-update integrity + tag/CHANGELOG gates + SHA-pinned actions) is a standout and clearly battle-hardened through real incidents (the inline #178/#199/#220 references). The prioritized work: **wire up code signing** for Windows (O1) and provision the **macOS signing secrets** so a signed release can actually be produced (O2); **broaden CI** to Windows and to the unit/orphaned suites (O3/O4). None of these are architectural — they are configuration, credentials, and test-wiring.
