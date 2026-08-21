# Consolidated Audit Findings — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · **Schema:** `user_version = 86`

The master, **deduplicated** findings list. Where one issue surfaces in several lenses (e.g. the logger bypass appears in Code-Quality, Backend, and Coding-Style), it is listed **once** here with cross-references, so the counts are distinct issues — not inflated by repetition. Full detail for each lives in the cited lens document.

**Classification:** **Confirmed issue** (verified defect/gap) · **Potential improvement** (plausible, benefits from profiling/decision) · **Recommendation/preference** (sound practice, not a defect). **Confidence:** High / Medium / Strongly-inferred, per finding.

> No finding asserts a vulnerability or a line number without file-level evidence. Two audit seed-premises — a `thermal.ts` command-injection surface and "no CSP" — were **disproven by the code** and are recorded under §6 (Verified-Safe), not as findings.

---

## 1. Severity roll-up (distinct findings)

| Severity          | Count | Findings                                                                                                            |
| ----------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| **Critical**      | 0     | —                                                                                                                   |
| **High**          | 4     | AF-01 money REAL-primary · AF-02 orphaned test suites · AF-03 untested frontend · AF-04 god-files (maintainability) |
| **Medium-High**   | 3     | AF-05 payments JSON-only · AF-06 no concurrency test · AF-07 Linux-only CI                                          |
| **Medium**        | 22    | AF-08 … AF-29                                                                                                       |
| **Low-Medium**    | 6     | AF-30 … AF-35                                                                                                       |
| **Low**           | 14    | AF-36 … AF-49                                                                                                       |
| **Informational** | 9     | AF-50 … AF-58                                                                                                       |

**Confirmed Critical/High _security_ vulnerabilities: 0** (SECURITY §1). The four High findings are one data-representation completeness gap, two testing-process gaps, and one maintainability concentration.

---

## 2. High findings (full format)

### AF-01 — Money is REAL-primary; core totals computed in floating point

- **Severity:** High · **Category:** Database / money representation · **Class:** Confirmed · **Confidence:** High
- **Location:** `main/db.ts:3201-3289`; `main/routes/orders/create.ts:266-381`; `main/lib/money.ts:4-6`; `main/database/migrations.ts:2463-2552`
- **Evidence:** core money columns are `REAL` with nullable `_cents INTEGER` columns dual-written but **derived from the float** (`CAST(ROUND(COALESCE(real,0)*100) AS INTEGER)`); totals accumulate natively then round; `money.ts:6` states "REAL columns remain until a future cutover."
- **Why it matters:** IEEE-754 can't represent all decimal cents; multi-line float accumulation can diverge by a cent from integer math. `_cents` is authoritative only where `preferCents` is called (settlement/refund/shift); order/item/bill _display_ still flows from REAL.
- **Impact:** rare per-cent discrepancies on totals; REAL-vs-cents divergence on legacy rows; reconciliation ambiguity during the incomplete migration.
- **Recommendation:** complete the P0.3 cutover — compute totals in integer cents, make `_cents` the read source-of-truth, retire REAL **via migration + upgrade-path test**. **Effort:** High. · **Ref:** DATABASE F1, R-01, Roadmap H4.

### AF-02 — 63 test scripts + 11 test files never run by `npm test` or CI

- **Severity:** High · **Category:** Testing / CI · **Class:** Confirmed · **Confidence:** High
- **Location:** `.github/workflows/ci.yml`; `package.json` `test:*` set vs `tests/run-test.sh`; 11 files under `tests/` with no npm script
- **Evidence:** `npm test` reaches ~136 of ~199 scripts; orphans include all `r2`–`r15` waves, all `phase-4.*`, all `*-boundary` R4.1 guards, all `inventory-*`, and the DB-recovery suites (`r14-corrupt-db`, `process-kill-recovery`, `rec-01`); 11 files wired to no script at all.
- **Why it matters:** authored, maintained tests that never run give zero regression protection and false confidence — including the two best recovery tests and the guards that enforce the architecture rule.
- **Impact:** regressions in inventory, purchasing, refunds-restock, corrupt-DB latching, and architecture boundaries can merge green.
- **Recommendation:** adopt a directory-glob runner (run every `tests/**/*.test.ts`) so orphaning is impossible; prioritize the recovery + boundary + inventory suites. **Effort:** Low-Medium. · **Ref:** TESTING 3.1, DEVOPS O4, R-02, Roadmap H1.

### AF-03 — Frontend behaviour is effectively untested

- **Severity:** High · **Category:** Testing gap · **Class:** Confirmed · **Confidence:** High
- **Location:** `frontend/package.json`; `frontend/vitest.config.ts` (`environment:'node'`); `frontend/e2e/` (3 files)
- **Evidence:** no `@testing-library/*`; `jsdom ^30.0.1` present but unused (node env makes rendering impossible as configured); real browser behaviour is ~5 Playwright cases; the 21 `flo-*` suites are source-string greps (0/21 render).
- **Why it matters:** for a POS where the cashier screen _is_ the product, order entry, payment modal, discount, and split-checks are essentially unverified in the browser.
- **Impact:** money-adjacent UI can regress without a failing test.
- **Recommendation:** add jsdom + testing-library tests (cart, auth guard, `TaxConfigurationPanel`, API client); expand Playwright beyond the happy path. **Effort:** Medium-High. · **Ref:** TESTING 3.4, FRONTEND 2.6, R-03, Roadmap H3.

### AF-04 — God-files concentrate maintainability & merge risk

- **Severity:** High (maintainability) / rated **Medium as a probability-weighted risk** (R-13 — the files are cohesive and R4.1-governed, not spaghetti) · **Category:** Architecture / maintainability · **Class:** Confirmed · **Confidence:** High
- **Location:** `frontend/src/app/(dashboard)/settings/page.tsx` (6,654 lines, 111 `useState`, ~72 inline `fetch`, 18 tabs); `main/db.ts` (4,120, extraction in-flight behind the R4.1 façade); `main/printers/thermal.ts` (2,505). _(`migrations.ts` 2,724 is an append-only ledger — explicitly **not** flagged.)_
- **Evidence:** line counts above; `AGENTS.md:47` names `db.ts`, `routes/orders.ts`, and the Settings page as governed hotspots.
- **Why it matters:** highest-probability merge-conflict/regression surfaces; onboarding cost concentrates here.
- **Recommendation:** enforce R4.1 — split Settings per tab; continue the `db.ts` façade extraction; extract `thermal.ts` formatters. **Effort:** Settings Medium; `db.ts`/`thermal.ts` High. · **Ref:** ARCHITECTURE 7.1, CODE-QUALITY §1, R-13, Roadmap H3/H4.

---

## 3. Medium-High findings (full format)

### AF-05 — Payments have no relational table (JSON-only)

- **Severity:** Medium-High · **Category:** Database / integrity · **Class:** Confirmed · **Confidence:** High
- **Location:** `main/db.ts:3291` (`bills.payment_details TEXT`); `main/routes/bills/payment-tender.ts:612-618`
- **Evidence:** no `payments`/`bill_payments` table; payment lines are JSON in `bills.payment_details`; no per-payment row, FK, index, or CHECK.
- **Why it matters:** you cannot relationally enforce `sum(payments) == bill.total`, index by method/date, or FK-validate the method; split-payment analytics parse JSON.
- **Impact:** payment/settlement discrepancies undetectable at the DB layer.
- **Recommendation:** add a `bill_payments` table (bill_id FK, method, `amount_cents CHECK(>0)`, tendered/change, actor) in the settlement `withTxn`; keep JSON as a transitional cache. **Effort:** Medium-High. · **Ref:** DATABASE F2, R-06, Roadmap H4.

### AF-06 — No concurrency / multi-writer SQLite test

- **Severity:** Medium-High · **Category:** Testing gap · **Class:** Confirmed · **Confidence:** High (absence) / Medium (field probability)
- **Location:** `tests/` — `database-maintenance-lock.test.ts` (503-during-maintenance only); no cross-process writer test
- **Evidence:** all "concurrent" tests run in-process (`Promise.all`); the real risk — main (3001) + standalone KDS (3002) writing one WAL DB from separate OS processes — has no `SQLITE_BUSY`/contention test.
- **Why it matters:** two processes on one WAL DB is a genuine runtime configuration and the classic SQLite failure mode.
- **Recommendation:** spawn two writers against one DB; confirm `busy_timeout`/retry under `SQLITE_BUSY`. **Effort:** Medium. · **Ref:** TESTING 3.6, R-04, Roadmap H3.

### AF-07 — CI is Linux-only for a tri-platform desktop app

- **Severity:** Medium-High · **Category:** Testing / DevOps · **Class:** Confirmed · **Confidence:** High
- **Location:** `.github/workflows/ci.yml` (all jobs `ubuntu-latest`)
- **Evidence:** Windows/macOS paths (`rewriteNextExportPath`, `kill-ports.js`), native rebuild, and printing (CUPS vs Windows RAW) are built at release but never functionally tested.
- **Why it matters:** the app ships Windows + macOS targets whose platform-specific code (printing especially) can regress undetected.
- **Recommendation:** add a Windows CI job (macOS ideally) for printing-path units, path rewriting, and native rebuild. **Effort:** Medium. · **Ref:** TESTING 3.7, DEVOPS O3, R-05, Roadmap H2.

---

## 4. Medium findings (consolidated)

| ID    | Finding                                                                                                   | Category                     | Location                                                              | Class     | Conf.                  | Ref                               |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- | --------- | ---------------------- | --------------------------------- |
| AF-08 | Master PIN 4-digit + restart-resettable in-memory lockout                                                 | Security                     | `main/services/master-pin.ts`                                         | Confirmed | High                   | SEC 2.1 / R-10                    |
| AF-09 | CSP `'unsafe-inline'` + JWT in `localStorage`                                                             | Security                     | `main/middleware/http-observability.ts`; `frontend/src/lib/api.ts:24` | Confirmed | High                   | SEC 2.2 / FE 2.7 / R-11           |
| AF-10 | Standalone server-app sets no security headers (+ KDS/server-app middleware asymmetry)                    | Security / Architecture      | `main/server-app.ts:148-157,315`; only `server.ts` applies helmet     | Confirmed | High                   | SEC 2.3 / ARCH 7.3 / BE §6 / R-12 |
| AF-11 | LAN mode can bind the money API to all interfaces                                                         | Architecture / Security      | `main/services/network-mode.ts`; `security.ts` `bypassPrivateIp`      | Confirmed | High                   | ARCH 7.4 / R-19                   |
| AF-12 | Order write-logic lives in routes, not a service                                                          | Architecture / Backend       | `main/routes/orders/*`, `main/routes/bills.ts`                        | Confirmed | High                   | BE 5.1 / ARCH §3                  |
| AF-13 | `asyncHandler` used in 1 of 51 route files; error-key drift (`error` vs `message`)                        | Code quality                 | `main/routes/*`; `whatsapp.ts` (only user); `customers.ts:564`        | Confirmed | High                   | CQ §4 / BE 5.2 / STYLE 3.5        |
| AF-14 | Structured pino logger bypassed by 483 `console.*` (latent redaction gap)                                 | Code quality / Observability | `main/lib/logger.ts` (1 importer); 261 `console.*` in routes          | Confirmed | High                   | CQ §3 / BE 5.3 / STYLE 3.1 / R-14 |
| AF-15 | No Express `Request` augmentation → ~41 `(req as any).user` casts + 10 duplicated actor helpers (3 names) | Code quality                 | `main/server.ts:161`; `actorId`/`actorUserId`/`actorFrom`             | Confirmed | High                   | CQ §2/§6 / BE 5.5 / STYLE 3.2     |
| AF-16 | ~567 `any` in `main/` (93 `catch (e:any)`, 41 `req.user`, SQLite row casts)                               | Code quality                 | `main/**` (frontend is clean: 14 `:any`, 0 `as any`)                  | Confirmed | High                   | CQ §2                             |
| AF-17 | Duplicated server bootstrap across the three servers (static-serve, path rewrite, port scan)              | Architecture                 | `server.ts`/`kds-server.ts`/`server-app.ts`                           | Confirmed | High                   | ARCH 7.2 / BE §6                  |
| AF-18 | Missing FOREIGN KEYs on hot columns                                                                       | Database                     | `main/db.ts:3229,3235,3269,3299-3308`                                 | Confirmed | High                   | DB F3 / R-15                      |
| AF-19 | No money-non-negativity / core status-enum CHECK constraints                                              | Database                     | `main/db.ts:3201-3289`                                                | Confirmed | High                   | DB F4 / R-16                      |
| AF-20 | Audit-trail coverage gaps (bill discount, no-sale drawer; order-create/item-discount audit out of txn)    | Database / audit             | `routes/bills.ts:800-1032`; `routes/printers.ts:753`; `create.ts:435` | Confirmed | High                   | DB F5 / R-17                      |
| AF-21 | `settings/page.tsx` god-component (frontend view of AF-04)                                                | Frontend                     | `frontend/src/app/(dashboard)/settings/page.tsx`                      | Confirmed | High                   | FE 2.1                            |
| AF-22 | `TaxConfigurationPanel.tsx` 1,613-line component                                                          | Frontend                     | `frontend/src/components/settings/TaxConfigurationPanel.tsx`          | Confirmed | High                   | FE 2.2                            |
| AF-23 | Orders page hand-rolls a 2nd `/kds` socket + polling instead of `useKdsConnection`                        | Frontend / realtime          | `frontend/src/app/(dashboard)/orders/page.tsx`                        | Confirmed | High                   | FE 2.3 / BE §7                    |
| AF-24 | Inline `fetch` (~72) bypasses the centralized axios client                                                | Frontend                     | `settings/page.tsx`; `frontend/src/lib/api.ts`                        | Confirmed | High                   | FE 2.4                            |
| AF-25 | Missing render memoization on hot pages (`OrderCard`, `ProductGrid`)                                      | Frontend / performance       | `orders/page.tsx`; `components/pos/ProductGrid.tsx`                   | Confirmed | Strongly-inferred      | FE 2.5 / PERF 3.6/3.7             |
| AF-26 | Three full-table scans on every cold start (grow with data)                                               | Performance                  | `main/db.ts:651-653,862-933`                                          | Confirmed | Measured/Str-inf       | PERF 3.1 / R-20                   |
| AF-27 | KDS full-state re-broadcast + per-client re-auth per event                                                | Performance / WS             | `main/services/kds.ts:785-811`                                        | Confirmed | Measured/Str-inf       | PERF 3.2 / R-21                   |
| AF-28 | Baileys pre-release, unofficial WhatsApp client on the runtime path                                       | Dependency                   | `@whiskeysockets/baileys ^7.0.0-rc13`; `services/whatsapp.ts`         | Confirmed | High (ver) / Med (ban) | DEP D1 / R-07                     |
| AF-29 | Windows unsigned · macOS signing blocked on missing credentials                                           | DevOps / release             | `release.yml:386-402` (Win); `:227-256` (mac)                         | Confirmed | High                   | DEVOPS O1/O2 / R-08/R-09          |

_(AF-13/AF-14/AF-15 are the three highest-leverage, lowest-risk fixes — all codemods against patterns already in the repo.)_

## 5. Low-Medium, Low & Informational (consolidated)

| ID    | Finding                                                                                     | Sev                        | Category          | Class          | Ref                           |
| ----- | ------------------------------------------------------------------------------------------- | -------------------------- | ----------------- | -------------- | ----------------------------- |
| AF-30 | Audit log has no tamper-evidence / write-protection trigger                                 | Low-Med                    | Database          | Recommendation | DB F6 / R-18                  |
| AF-31 | SQL in both routes and services; no repository tier                                         | Low-Med                    | Backend           | Potential      | BE 5.4 / CQ §6                |
| AF-32 | Two validation styles (zod vs inline `typeof`)                                              | Low-Med                    | Code quality      | Confirmed      | CQ §5 / STYLE 3.3 / SEC 2.9   |
| AF-33 | Floor/tables view N+1 (`activeOrderForTable` per table)                                     | Low-Med (Med at 80 tables) | Performance       | Confirmed      | PERF 3.4                      |
| AF-34 | macOS printer detection: 3 sync `execFileSync` per printer                                  | Low-Med                    | Performance       | Confirmed      | PERF 3.5                      |
| AF-35 | Bleeding-edge Next 16 / React 19; customer-visible "Opervia" typo (branding)                | Low-Med                    | Dependency / Docs | Confirmed      | DEP D2 / DOC 2.3 / STRUCT 7.2 |
| AF-36 | Login user-enumeration via response timing                                                  | Low                        | Security          | Confirmed      | SEC 2.4                       |
| AF-37 | JWT algorithm not pinned (non-exploitable today)                                            | Low                        | Security          | Confirmed      | SEC 2.5                       |
| AF-38 | World-readable temp file holds receipt PII while printing                                   | Low                        | Security          | Confirmed      | SEC 2.6                       |
| AF-39 | server-app login lacks per-account progressive lockout                                      | Low                        | Security          | Confirmed      | SEC 2.7                       |
| AF-40 | bcrypt cost factor 10 (below common cost-12)                                                | Low                        | Security          | Recommendation | SEC §2.8                      |
| AF-41 | Startup `foreign_key_check` logged, not fail-closed                                         | Low                        | Database          | Recommendation | DB F7                         |
| AF-42 | Minor index gaps (`customers.phone` raw, `refunds.order_id`)                                | Low                        | Database          | Potential      | DB F8                         |
| AF-43 | `flo-*` "frontend" tests are static string greps (mislabeled coverage)                      | Low-Med                    | Testing           | Confirmed      | TEST 3.3                      |
| AF-44 | Vitest unit layer not gated in CI                                                           | Med→ (grouped)             | Testing           | Confirmed      | TEST 3.2                      |
| AF-45 | Repo-wide coverage unmeasured (c8 scoped to 4 files)                                        | Med→ (grouped)             | Testing           | Confirmed      | TEST 3.5                      |
| AF-46 | Printer fault-injection / load / fuzz testing absent                                        | Med→ (grouped)             | Testing           | Recommendation | TEST 3.8                      |
| AF-47 | Toolchain skew across trees (vitest 4/3, eslint 10/9, ts 5.4/5.9); pre-1.0 UI libs on caret | Low                        | Dependency        | Confirmed      | DEP D3/D4                     |
| AF-48 | `npm ci` on every dev launch (dev experience)                                               | Low                        | Build             | Confirmed      | PERF 3.9 / DEVOPS O5          |
| AF-49 | Doc taxonomy collisions + duplicate product/audit dirs; currency drift (v75 vs v86)         | Low                        | Docs              | Confirmed      | DOC 2.1/2.2/2.4               |
| AF-50 | General `/api` rate limiter exempts private IPs by default                                  | Info                       | Security          | By design      | SEC 2.8                       |
| AF-51 | Network printing opens a socket to an operator-configured `ip:port`                         | Info                       | Security          | Config-gated   | SEC 2.10                      |
| AF-52 | `O(items×orders)` `.find()` in KDS snapshot builder                                         | Low                        | Performance       | Confirmed      | PERF 3.3                      |
| AF-53 | Mixed primary-key types (string-prefix vs int)                                              | Info                       | Database          | Confirmed      | DB F9                         |
| AF-54 | WAL `synchronous=NORMAL` durability tradeoff                                                | Info                       | Database          | Recommendation | DB F10 / R-23                 |
| AF-55 | `googleapis ^173` umbrella for one optional feature                                         | Info                       | Dependency        | Recommendation | DEP D5                        |
| AF-56 | Two route-registration styles (`export const` vs `registerXRoutes`)                         | Info                       | Style             | Preference     | STYLE 3.4                     |
| AF-57 | API documentation split across locations                                                    | Info                       | Docs              | Confirmed      | DOC 2.5                       |
| AF-58 | Sparse inline/code-level docs (deliberate trade-off)                                        | Info                       | Docs              | Preference     | DOC 2.6                       |

_(AF-44/45/46 are Medium in TESTING but grouped here with the testing cluster for readability; their weight is captured in the Testing category score.)_

## 6. Verified-Safe / premises disproven (credit — do not "fix")

- **Command injection — SAFE:** `execFile`/`execFileSync` array args, no shell; Windows printing passes values as env vars into a static PowerShell script (SECURITY §3).
- **SQL injection — SAFE:** parameterized values; `isSafeIdentifier()` allowlist for dynamic identifiers; generated `?` placeholders (SECURITY §3).
- **CSP present:** helmet CSP with `frameAncestors 'none'`, `objectSrc 'none'`, `baseUri 'self'` (the `'unsafe-inline'` weakness is AF-09) (SECURITY §3).
- **Destructive `DELETE FROM` import/restore — SAFE:** backup-first, transactional, FK-gated, injection-guarded (DATABASE S5).
- **Electron isolation, secret storage, path-traversal defense, global auth (role-from-DB) — all verified strong** (SECURITY §3).
- **`flo.db` at root — gitignored demo data**, not a data leak; only two upgrade-snapshot fixture `.db` files are tracked (intentional) (PROJECT-STRUCTURE §1).
- **Near-zero dead code; `migrations.ts` size is inherent** to an append-only ledger — do not split (CODE-QUALITY §1/§7).

## 7. Dedup / cross-reference map

One issue, multiple lenses — counted once above:

- **Logger bypass** = CQ §3 = BACKEND 5.3 = STYLE 3.1 → **AF-14**
- **JWT in `localStorage` / CSP** = SECURITY 2.2 = FRONTEND 2.7 → **AF-09**
- **server-app headers / middleware asymmetry** = SECURITY 2.3 = ARCHITECTURE 7.3 = BACKEND §6 → **AF-10**
- **Orphaned suites** = TESTING 3.1 = DEVOPS O4 → **AF-02**
- **Linux-only CI** = TESTING 3.7 = DEVOPS O3 → **AF-07**
- **god-files** = ARCHITECTURE 7.1 = CODE-QUALITY §1 = FRONTEND 2.1 (settings) → **AF-04 / AF-21**
- **`Request` augmentation / actor helper** = CQ §2/§6 = BACKEND 5.5 = STYLE 3.2 → **AF-15**
- **cross-server bootstrap dup** = ARCHITECTURE 7.2 = BACKEND §6 → **AF-17**
- **memoization on hot pages** = FRONTEND 2.5 = PERFORMANCE 3.6/3.7 → **AF-25**
- **`npm ci` on dev** = PERFORMANCE 3.9 = DEVOPS O5 → **AF-48**

Full write-ups, evidence, and recommendations for every finding are in the cited lens documents (see [README.md](README.md) for the index).
