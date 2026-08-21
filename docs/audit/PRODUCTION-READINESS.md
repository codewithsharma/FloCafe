# Production Readiness — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · **Schema:** `user_version = 86`

Status legend: **PASS** (verified adequate, evidence cited) · **PARTIAL** (works but with a named gap) · **FAIL** (a real gap that should block or be explicitly accepted) · **NOT VERIFIED** (could not be confirmed from the repository / static review alone).

> **No item is marked PASS without file-level evidence.** This is a **static** review — no live penetration test, load test, fuzzing, signed-artifact validation, or cross-platform runtime execution was performed (CI is Linux-only; signing is blocked on absent credentials). Those are recorded as NOT VERIFIED, not assumed.

**Overall verdict: PARTIAL — production-capable for its declared target (single-store, local-first, owner-operated), with two categories that should be closed before a confident wider rollout: test-gating breadth and distribution signing.** The money-path _runtime_ behaviour and data-safety machinery are the strongest evidence for readiness; the gaps are in _process_ (untested frontend/concurrency, orphaned suites) and _distribution_ (unsigned Windows, blocked macOS signing), not in core correctness.

---

## 1. Build, correctness & data

| Area                                  | Status      | Evidence / Note                                                                                                                                                                                                                                               |
| ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend compiles under strict TS      | **PASS**    | `tsconfig.json` `strict:true` (main); `tsc --noEmit` runs in `linux-baseline` (`ci.yml`).                                                                                                                                                                     |
| Frontend builds (static export)       | **PASS**    | `npm run build:frontend` runs in CI (`ci.yml:105-114`); `output:'export'`.                                                                                                                                                                                    |
| Money path — functional correctness   | **PASS**    | Transactional (`withTxn`), idempotent (`*_idempotency`, 409 on key reuse), immutable snapshots; exercised by real HTTP+DB suites gated by `npm test` (`integration-payments`, `issue-214-payment-integrity`, `integration-refunds`) — TESTING §2, BACKEND §2. |
| Money **representation** completeness | **PARTIAL** | Core totals still REAL-primary; `_cents` derived from the float, cutover incomplete (`db.ts:3201-3289`, `money.ts:6`) — DATABASE F1 / R-01. No reported money bug, but DB-level integer-cents authority is not yet universal.                                 |
| Payments relational integrity         | **PARTIAL** | Payments are JSON-only; no `bill_payments` table, FK, or CHECK (`db.ts:3291`) — DATABASE F2 / R-06. Integrity relies on app-layer correctness.                                                                                                                |
| Core-table constraints (FK / CHECK)   | **PARTIAL** | Missing FKs on hot columns (F3) and no money/status CHECKs on core tables (F4); newer tables have them. `foreign_keys=ON` at runtime.                                                                                                                         |
| Migrations (fresh + upgrade)          | **PASS**    | 86 atomic in-txn migrations; fresh replays all; `upgrade-path` + `migration-v56-v57` tests with real `.db` fixtures — DATABASE S1/S10.                                                                                                                        |
| Backup / restore                      | **PASS**    | SQLite online-backup API, WAL fold, `integrity_check` on the artifact, fsync + atomic rename; restore is transactional + FK-gated + injection-guarded — DATABASE S4/S5.                                                                                       |
| Corrupt-DB handling                   | **PASS**    | Startup `integrity_check` latches `corrupt_database`; middleware returns 503 before auth on money routes; end-to-end tested (`r14-corrupt-db-fail-closed.test.ts`) — DATABASE S6. **Caveat:** the recovery test itself is **not run by CI** (see below).      |
| Rollback / disaster recovery          | **PASS**    | Unconditional pre-migration auto-backup (S2); atomic crash-safe replacement; soft-delete/terminal-status for all financial data (S9).                                                                                                                         |

## 2. Security

| Area                                    | Status                | Evidence / Note                                                                                                                                                                                                  |
| --------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication & authorization          | **PASS**              | Global `requireAuth` (Bearer + revocation + `jwt.verify` + active-user + staleness); **role read from DB, not the JWT claim**; `requireRole` on mutations; destructive order ops Master-PIN-gated — SECURITY §3. |
| Electron process hardening              | **PASS**              | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` (`index.ts:281-283`); navigation allowlist; `setWindowOpenHandler` deny — SECURITY §3.                                                          |
| SQL injection defense                   | **PASS**              | Values parameterized; dynamic identifiers gated by `isSafeIdentifier()`; generated `?` placeholders for `IN(...)` — SECURITY §3 (premise re-verified).                                                           |
| Command-execution defense               | **PASS**              | `execFile`/`execFileSync` with array args, no shell; Windows printing passes values as env vars into a static PowerShell script — SECURITY §3 (premise disproven — SAFE).                                        |
| Secret storage & log redaction          | **PASS**              | JWT secret via `safeStorage` → `jwt-secret.enc` (`0o600`); Master PIN encrypted; pino `redact` config; data-export redaction; `.env*` gitignored; no hardcoded secrets found — SECURITY §3.                      |
| Path-traversal defense (restore)        | **PASS**              | `security/restore-path.ts` rejects separators/`..`/absolute/symlink; filename regex — SECURITY §3.                                                                                                               |
| Security headers — main server          | **PASS**              | helmet CSP + `frameAncestors 'none'`, `objectSrc 'none'`, `baseUri 'self'`, frameguard deny (`http-observability.ts`) — SECURITY §3.                                                                             |
| Security headers — server-app / KDS     | **FAIL**              | `server-app.ts` applies **no** security headers and can bind beyond loopback (`:148-157,315`) — SECURITY 2.3 / R-12. Fix: reuse `applySecurityHeaders` on all three listeners.                                   |
| CSP script policy + token storage       | **PARTIAL**           | CSP allows `'unsafe-inline'` and the JWT is in `localStorage` (`http-observability.ts`; `api.ts:24`) — SECURITY 2.2 / R-11. Mitigated by small XSS surface today, but not hardened.                              |
| Master PIN strength                     | **PARTIAL**           | 4-digit PIN, restart-resettable in-memory lockout (`master-pin.ts`) — SECURITY 2.1 / R-10. Bounded by local-access precondition.                                                                                 |
| Input validation coverage               | **PARTIAL**           | zod middleware on ~26 routes; ~24 hand-roll `typeof` guards (`orders/*`, `printers.ts`, `reports.ts`) — not a vulnerability (SQL parameterized), a consistency gap — SECURITY 2.9 / CODE-QUALITY §5.             |
| Confirmed Critical/High vulnerabilities | **PASS (none found)** | SECURITY §1 roll-up: no Critical/High; all confirmed items Medium or lower.                                                                                                                                      |
| Live penetration test / fuzzing         | **NOT VERIFIED**      | Static review only — SECURITY §5.                                                                                                                                                                                |
| Transitive-dependency CVE scan          | **NOT VERIFIED**      | No live `npm audit` (sandbox network-restricted); direct security-relevant deps reviewed, no known-critical CVEs at audit time — DEPENDENCY §5.                                                                  |

## 3. Testing

| Area                             | Status      | Evidence / Note                                                                                                                                                             |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend money-path tests (gated) | **PASS**    | Order→tax→payment→settle→refund→day-close covered by real HTTP+DB suites in `npm test` — TESTING §2.                                                                        |
| Orphaned suites in CI            | **FAIL**    | 63 `test:*` scripts + 11 files never run — incl. `r14-corrupt-db`, `process-kill-recovery`, `rec-01`, all `*-boundary` R4.1 guards, all `inventory-*` — TESTING 3.1 / R-02. |
| Unit layer gated                 | **FAIL**    | Neither root nor frontend `test:unit` runs in CI — TESTING 3.2.                                                                                                             |
| Frontend behaviour tests         | **FAIL**    | No component/interaction tests; only ~5 Playwright cases; `flo-*` suites are source-string greps — TESTING 3.3/3.4 / R-03.                                                  |
| Concurrency / multi-writer       | **FAIL**    | No cross-process SQLite contention test for main + standalone KDS on one WAL DB — TESTING 3.6 / R-04.                                                                       |
| Cross-platform (Windows/macOS)   | **FAIL**    | CI is Linux-only; platform code (printing, path rewrite, native rebuild) never functionally tested — TESTING 3.7 / R-05.                                                    |
| Repo-wide coverage measured      | **PARTIAL** | c8 scoped to 4 files; true coverage unknown — TESTING 3.5.                                                                                                                  |
| CI gating breadth                | **PARTIAL** | Strong where present (SHA-pinned, dependency-review fail-on-high, tax invariant, frontend lint/build, Playwright) but omits the unit layer and orphaned suites — DEVOPS §2. |

## 4. Release, DevOps & operations

| Area                                      | Status             | Evidence / Note                                                                                                                                                                          |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI supply-chain hygiene                   | **PASS**           | All GitHub Actions SHA-pinned; `dependency-review-action` fail-on High; `npm ci` + committed lockfiles — DEVOPS §1/§2.                                                                   |
| Release pipeline — pre-flight gates       | **PASS**           | Strict `X.Y.Z` tag == `package.json` check; CHANGELOG-driven notes that fail if the version has no entry — DEVOPS §3.                                                                    |
| Release — Linux packaging                 | **PASS**           | Matrix x64+arm64 → AppImage/deb/rpm/snap; per-arch concurrency; artifact-count assertion — DEVOPS §3.                                                                                    |
| Release — macOS signing/notarization      | **FAIL (blocked)** | Pipeline is correct + triple-verified but **fails without secrets that are not configured**; no signed macOS build can currently be produced (`release.yml:227-256`) — DEVOPS O2 / R-09. |
| Whether a signed macOS build ever shipped | **NOT VERIFIED**   | Not determinable from the repo — DEVOPS O2.                                                                                                                                              |
| Release — Windows signing                 | **FAIL**           | Ships **unsigned**; SmartScreen prompt (`release.yml:386-402`) — DEVOPS O1 / R-08.                                                                                                       |
| Auto-update integrity mechanism           | **PASS**           | `latest-mac.yml`/`latest.yml` + blockmap completeness checks; re-download of the published artifact re-verified — DEVOPS §3. (Depends on signing being live to be end-to-end useful.)    |
| Logging / observability                   | **PARTIAL**        | Structured pino + OTel + consent-gated telemetry exist, but the logger is imported by 1 file; 483 `console.*` bypass it — DEVOPS §5 / CODE-QUALITY §3 / R-14.                            |
| Error handling                            | **PARTIAL**        | Global handler + typed correlated errors + `asyncHandler` exist; `asyncHandler` used in 1/51 routes; error-key drift — CODE-QUALITY §4.                                                  |
| Dependency management                     | **PASS**           | `overrides` in both trees, Dependabot (3 ecosystems), dependency-review gate — DEPENDENCY §4.                                                                                            |
| Runtime WhatsApp dependency (Baileys)     | **PARTIAL**        | Pre-release, unofficial client on a non-money-path feature; ToS/ban + supply-chain risk — DEPENDENCY D1 / R-07.                                                                          |

## 5. Performance (judged at single-store scale)

| Area                          | Status           | Evidence / Note                                                                                                                  |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Hot read paths                | **PASS**         | Order list/detail, KDS feed, products, recent-orders batched to `IN(...)`; `batchHydrateOrders` ~300→6 queries — PERFORMANCE §2. |
| Index coverage on hot columns | **PASS**         | Strong (orders/order_items/bills/loyalty_ledger/audit_logs) — PERFORMANCE §2.                                                    |
| Pagination                    | **PASS**         | `/orders` cursor pagination (default 50, cap 500); reports server-capped — PERFORMANCE §2.                                       |
| Cold-start scans              | **PARTIAL**      | Three full-table scans every boot grow with data (`db.ts:651-653,862-933`) — PERFORMANCE 3.1 / R-20.                             |
| KDS broadcast cost            | **PARTIAL**      | Full-state re-broadcast + per-client re-auth per event (`kds.ts:785-811`) — PERFORMANCE 3.2 / R-21.                              |
| Frontend hot-page render cost | **PARTIAL**      | Unmemoized `OrderCard`/`ProductGrid`; refetch-on-broadcast — PERFORMANCE 3.6/3.7.                                                |
| Load / stress testing         | **NOT VERIFIED** | No load/perf harness; _Potential_ items need profiling on real store data — PERFORMANCE §1.                                      |

## 6. Documentation

| Area                                | Status      | Evidence / Note                                                                                |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Community-health + product/eng docs | **PASS**    | Full root set + 333-file `docs/` tree + ADRs + QA/debt ledger — DOCUMENTATION §1.              |
| Release documentation enforced      | **PASS**    | CHANGELOG gates releases; signing requirements documented — DOCUMENTATION §3.                  |
| Doc organization & currency         | **PARTIAL** | Taxonomy collisions, duplicate dirs, "Opervia" typo, v75-vs-v86 drift — DOCUMENTATION 2.1–2.4. |

---

## 7. Go / No-Go summary

**GO for the declared target (single-store, owner-operated, local-first, primarily localhost)** — the money path, auth, Electron hardening, data-safety, and backup/restore are all PASS with evidence, and no Critical/High vulnerability was found.

**Conditions to close before a confident _wider_ rollout (multi-terminal / LAN / broad distribution):**

1. **Wire the orphaned recovery + boundary suites and the unit layer into CI** (FAIL → PASS is mostly test-wiring) — R-02.
2. **Add frontend and cross-process concurrency tests** — R-03, R-04.
3. **Unblock signed distribution** (macOS credentials; Windows signing service) — R-08, R-09.
4. **Add security headers to the server-app/KDS listeners** and tighten CSP + token storage — R-11, R-12.
5. **Broaden CI to Windows** for the platform-specific paths — R-05.

**Recommended before scaling reliance on DB-level financial integrity:** complete the money-cents cutover + `bill_payments` table + FKs/CHECKs (R-01, R-06, R-15, R-16) — the H4 workstream.

None of the FAIL items indicate a _broken_ system; they indicate _unverified_ or _unhardened_ surfaces. The distinction matters: the parts that are tested are tested well.
