# Dependency Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5
**Scope:** `package.json` (root/main), `frontend/package.json`, lockfiles, `overrides`, Dependabot, CI dependency gating. Read-only.

> Verdict: **the core stack is current, deliberately maintained, and actively guarded against transitive vulnerabilities — a genuine strength.** The material risks are narrow and specific: a **pre-release, unofficial WhatsApp client** on the runtime path, a **bleeding-edge frontend** (Next 16 / React 19 that the frontend's own `AGENTS.md` warns is "NOT the Next.js you know"), and **toolchain version skew** between the two package trees. No live CVE scan was run in this environment (network-restricted) — see scope note.

---

## 1. Posture summary

| Area                                                          | Assessment                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Core runtime currency (Electron/Express/SQLite/security libs) | **Excellent** — all on current majors                      |
| Transitive-vuln management (`overrides`)                      | **Strong** — both trees pin known-bad transitives          |
| Automated updates (Dependabot)                                | **Strong** — root + frontend + actions, weekly             |
| CI dependency gating                                          | **Good** — `dependency-review-action` fails PRs on High+   |
| WhatsApp client (Baileys)                                     | **Risk** — pre-release `rc`, unofficial                    |
| Frontend framework currency                                   | **Aggressive** — Next 16.2.12 / React 19.2.8, leading edge |
| Cross-tree toolchain consistency                              | **Weak** — vitest/eslint/typescript majors diverge         |

## 2. Core dependencies (verified current)

**Main process (`package.json`):** electron `^43.3.0`, express `^5.2.1`, better-sqlite3 `^13.0.3` (N-API — ABI-stable, no per-Electron rebuild), helmet `^8.3.0`, cors `^2.8.5`, jsonwebtoken `^9.0.2`, bcryptjs `^3.0.3`, zod `^4.4.3`, decimal.js `^10.6.0`, ws `^8.21.2`, pino `^10.3.1` / pino-http `^11.0.0`, electron-updater `^6.8.9`, electron-log `^5.4.4`. **All on current majors** — this is an up-to-date, security-relevant core (corroborated by SECURITY-AUDIT §3, which found no known-critical CVEs in these at audit time).

**Toolchain (dev):** electron-builder `^26.15.3`, eslint `^10.8.0`, typescript `^5.4.5`, vitest `^4.1.10`, prettier `^3.9.6`, husky `^9.1.7`, lint-staged `^17.3.0`, c8 `^10.1.3`, ts-node `^10.9.2`.

**Frontend (`frontend/package.json`):** next `16.2.12` (pinned exact), react/react-dom `19.2.8` (pinned exact), @tanstack/react-query `^5.101.4`, zustand `^5.0.14`, axios `^1.18.1`, radix-ui `^1.6.7`, tailwindcss `^4`, sharp `^0.35.3`, @point-of-sale/receipt-printer-encoder `^3.0.3`.

## 3. Findings

### D1 — Baileys is a pre-release, unofficial WhatsApp client on the runtime path (Medium)

- **Location:** `package.json` `@whiskeysockets/baileys: ^7.0.0-rc13`; used by `main/services/whatsapp.ts`, bridged via `baileys-loader.cjs`.
- **Evidence:** the pinned version is a **release candidate** (`7.0.0-rc13`), and `^` on a pre-release still allows newer `7.0.0-rc*` to float. Baileys is a reverse-engineered, unofficial WhatsApp Web client, not a WhatsApp-sanctioned API.
- **Why it matters:** three compounding risks — (1) **stability**: `rc` builds can carry breaking changes/regressions; (2) **ToS/ban**: unofficial automation can get the connected WhatsApp number banned (the code's extensive anti-ban rate limiting acknowledges this); (3) **supply-chain**: a fast-moving unofficial client is a larger trust surface than a stable, audited library.
- **Impact:** WhatsApp receipts/notifications (outbound-only — not the money path) could break on an upstream change or a number ban. Contained to a non-critical feature.
- **Recommendation:** pin Baileys to an exact version (drop the `^` on a pre-release), gate the feature behind a clearly-optional toggle, and track upstream for a stable `7.0.0`. Document the ban risk for operators. Cross-ref BACKEND-AUDIT §8, RISK-REGISTER.
- **Confidence:** High (version + role); Medium (field ban probability).

### D2 — Bleeding-edge frontend framework (Next 16.2.12 / React 19.2.8) (Low-Medium)

- **Location:** `frontend/package.json` (`next 16.2.12`, `react`/`react-dom 19.2.8`, both pinned exact); `frontend/AGENTS.md` states: _"This is NOT the Next.js you know … breaking changes — APIs, conventions, and file structure may all differ."_
- **Why it matters:** Next 16 and React 19 are very recent majors; leading-edge framework versions have a smaller pool of community-vetted patterns, third-party-lib compatibility, and known-issue coverage. The project itself flags Next 16's divergence in-repo.
- **Mitigations (verified):** versions are **pinned exact** (reproducible), and the app is a static export (`output: 'export'`) so no Next SSR runtime is shipped — the surface actually exercised at runtime is narrower than a full Next server deployment.
- **Recommendation:** keep versions pinned; watch for patch releases; treat major bumps as their own tested change, not a Dependabot auto-merge. **Confidence:** High (versions); Medium (risk magnitude, given static-export mitigation).

### D3 — Toolchain version skew between the two package trees (Low)

- **Location:** vitest `^4.1.10` (root) vs `^3.2.7` (frontend); eslint `^10.8.0` (root) vs `^9.39.5` (frontend); typescript `^5.4.5` (root) vs `5.9.3` (frontend); duplicated runtime libs with minor skew (`libphonenumber-js` `^1.13.10` root vs `^1.13.9` frontend; `date-fns ^4.4.0` in both).
- **Why it matters:** not a runtime risk (separate trees, separate installs), but it raises maintenance cost and cognitive load — two ESLint majors and two Vitest majors mean two rule/behavior baselines to reason about, and duplicated libs can subtly diverge.
- **Recommendation:** converge the dev toolchain majors across trees where feasible (align Vitest and ESLint), and document intentional duplications. **Confidence:** High.

### D4 — Pre-1.0 / early-version UI dependencies (Low)

- **Location:** `@dnd-kit/dom` + `@dnd-kit/react` `^0.5.0` (pre-1.0, API-unstable), `class-variance-authority ^0.7.1`, `vaul ^1.1.2`, `radix-ui ^1.6.7`.
- **Why it matters:** pre-1.0 packages can make breaking changes in minor releases; `^0.5.0` permits `0.x` drift.
- **Recommendation:** pin the pre-1.0 packages to exact versions; review their changelogs before bumping. **Confidence:** High.

### D5 — `googleapis ^173.0.0` is a very large dependency for one optional feature (Low/Info)

- **Location:** `package.json` `googleapis: ^173.0.0`; used only by `main/services/google-drive.ts` for optional Drive backup.
- **Why it matters:** `googleapis` is a very large meta-package; it inflates install size and the bundled `asar`, and enlarges the dependency attack surface for a feature many single-store operators won't use.
- **Recommendation:** import the specific Drive submodule (e.g. `@googleapis/drive`) instead of the umbrella package to shrink footprint and surface. **Confidence:** Medium (footprint impact not measured here).

## 4. Strengths (credit)

- **Active transitive-vulnerability management via `overrides`.** Root pins `node-abi ^4.33.0`, `brace-expansion ^5.0.8` (+ a nested `minimatch@3.1.5 → brace-expansion ^1.1.17`); frontend pins `brace-expansion` (two ranges), `fast-uri ^3.1.5`, `ip-address ^10.4.0`, `undici ^7.29.0`, `postcss 8.5.23`, plus `hono`/`@hono/node-server`. These are exactly the packages that have carried recent advisories (e.g. the `brace-expansion` ReDoS) — evidence of deliberate, ongoing remediation rather than drift.
- **Dependabot across all three ecosystems** (`/`, `/frontend`, github-actions), weekly, with grouped minor/patch PRs — keeps the surface fresh without PR spam.
- **CI dependency gate:** `dependency-review-action` with `fail-on-severity: high` blocks PRs that introduce High/Critical advisories.
- **Reproducible installs:** committed `package-lock.json` in both trees; `npm ci` used in CI and release; exact pins on the highest-risk frontend framework packages.
- **N-API `better-sqlite3`** avoids the per-Electron-version native rebuild trap (documented rationale in `AGENTS.md`).
- **Current, security-relevant core** (Electron 43, Express 5, helmet 8, jsonwebtoken 9, zod 4) — no stale/abandoned core dependency found.

## 5. Scope note (honest limitation)

**No live `npm audit` / advisory scan was run in this environment** — the sandbox has no npm-registry network access. CVE-freeness of the _transitive_ tree is therefore **not independently verified here**; SECURITY-AUDIT §3 reviewed the _direct_ security-relevant versions and found no known-critical CVEs at audit time. **Recommendation for maintainers:** run `npm audit --omit=dev` (both trees) and `npm outdated` as a routine gate; the `overrides` block shows this is already part of the workflow, but a periodic full-tree scan should be confirmed in CI.

## 6. Verdict

**Dependency health: good, and clearly curated.** The core is modern and the transitive-vuln discipline (overrides + Dependabot + dependency-review) is above average for a project this size. The prioritized actions are: pin/contain **Baileys** (D1), treat frontend framework majors as tested changes (D2), converge the **cross-tree toolchain** (D3), and pin the **pre-1.0 UI libs** (D4). None block production for a single-store deployment; D1 is the one with real operational (ban) consequences and should be owned explicitly.
