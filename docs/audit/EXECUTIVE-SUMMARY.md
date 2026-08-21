# Executive Summary — OPERAVIA (FloCafe) Codebase Audit

**Repository:** FloCafe (product name: **OPERAVIA**) · **Version:** 3.0.5 · **Branch:** `restaurant-vertical` · **Schema:** `user_version = 86`
**Audit date:** 2026-08-21 · **Method:** evidence-based **static** review of the actual source (no live pentest, load test, `npm audit`, or cross-platform runtime — see _Limits_ below)

---

## Headline

|                                                      |                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overall score**                                    | **74 / 100**                                                                                                                                  |
| **Technical maturity**                               | **Early Production** (trending Production)                                                                                                    |
| **Production readiness**                             | **PARTIAL** — GO for the declared single-store target; conditions to close before wider rollout                                               |
| **Confirmed Critical/High security vulnerabilities** | **0**                                                                                                                                         |
| **What it is**                                       | A deliberately-scoped, local-first Electron desktop POS with a genuinely well-engineered money path and mature data-safety machinery          |
| **What holds it back**                               | Test-_gating_ breadth (good tests exist but don't all run) and distribution _signing_ — process/config gaps, not architecture or code defects |

OPERAVIA got the **hard** things right — money integrity, data safety, security fundamentals, release automation — and left **cheap** things undone: running the tests it already wrote, signing its binaries, and converging on abstractions it already built. That is an unusually favorable position: the remaining work is mostly low-risk wiring, and the one genuinely risky change (completing the money→integer-cents migration) is well-understood, already begun, and protected by an existing upgrade-path test discipline.

## Score by category (weighted)

| Category                  | Weight  | Score | Weighted       |
| ------------------------- | ------- | ----- | -------------- |
| Architecture              | 15      | 80    | 12.00          |
| Code Quality              | 15      | 72    | 10.80          |
| Maintainability           | 10      | 68    | 6.80           |
| Security                  | 15      | 80    | 12.00          |
| Testing                   | 15      | 58    | 8.70           |
| Performance               | 10      | 78    | 7.80           |
| Database / Data Integrity | 10      | 72    | 7.20           |
| DevOps                    | 5       | 80    | 4.00           |
| Documentation             | 5       | 85    | 4.25           |
| **Total**                 | **100** | —     | **73.55 → 74** |

Pulled up by **Security, Architecture, DevOps, Documentation**; pulled down primarily by **Testing** (the single largest drag at 15% weight) and **Maintainability**. Full justification per category in [CTO-ASSESSMENT.md](CTO-ASSESSMENT.md) §2.

## Findings at a glance

| Severity      | Count |
| ------------- | ----- |
| Critical      | 0     |
| High          | 4     |
| Medium-High   | 3     |
| Medium        | 22    |
| Low-Medium    | 6     |
| Low           | 14    |
| Informational | 9     |

Distinct, deduplicated across the 13 lenses. Master list: [AUDIT-FINDINGS.md](AUDIT-FINDINGS.md). Two audit seed-premises — a `thermal.ts` command-injection surface and "no CSP" — were **disproven by the code** and are recorded as Verified-Safe, not findings.

## Top 10 strengths

1. **The money path is engineered like a ledger** — every multi-write path is a single `withTxn`, idempotency keys are pervasive and enforced (409 on reuse), financial evidence is frozen in immutable snapshots, the actor is server-authoritative.
2. **Data-safety machinery is mature** — 86 atomic in-transaction migrations, unconditional pre-migration backup, WAL-consistent verified backups, transactional FK-gated injection-guarded restore.
3. **Fail-closed corrupt-DB handling** — startup `integrity_check` latches, money routes return 503 before auth, with a real end-to-end recovery test.
4. **Security fundamentals are exemplary** — role read from the DB (a stolen token can't self-elevate), full Electron hardening trifecta + navigation allowlist, parameterized SQL, shell-free command execution, OS-secure secret storage.
5. **No confirmed Critical/High vulnerability** — all confirmed security items are Medium or lower hardening.
6. **Coherent modular architecture** — clean routes→services→data layering, fail-closed vertical composition, sensible three-server split (POS / KDS / waiter).
7. **Mature release engineering** — sign/notarize triple-verification, auto-update integrity checks, tag==version and CHANGELOG gates, all GitHub Actions SHA-pinned.
8. **Sound single-store performance** — batched hot paths (`batchHydrateOrders` ~300→6 queries), good index coverage, cursor pagination with caps.
9. **Exceptional documentation** — complete community-health set, ADRs, a QA/decision ledger, and release docs enforced by the pipeline.
10. **Active architecture governance (R4.1)** and near-zero dead code — the god-files are already being dismantled behind a stable façade, and debt is tracked in `docs/qa/` rather than scattered TODOs.

## Top 10 issues (by leverage / severity)

1. **63 test scripts + 11 test files never run by CI** (High) — including the best recovery tests and the R4.1 boundary guards. Unrun safety nets are the #1 risk for a money app. _(AF-02 / R-02)_
2. **Money is REAL-primary, mid-migration** (High) — core totals accumulate in floating point; `_cents` is derived, not yet authoritative. _(AF-01 / R-01)_
3. **Frontend behaviour is effectively untested** (High) — no component tests for the cashier UI that _is_ the product; ~5 Playwright cases. _(AF-03 / R-03)_
4. **God-files** (High maintainability) — `settings/page.tsx` (6,654 lines), `db.ts` (4,120), `thermal.ts` (2,505). _(AF-04 / R-13)_
5. **Payments are JSON-only** (Medium-High) — no `bill_payments` table/FK/CHECK, so `sum(payments)==total` isn't enforceable at the DB. _(AF-05 / R-06)_
6. **No cross-process multi-writer test** (Medium-High) — the classic SQLite failure mode (main + standalone KDS on one WAL DB) is untested. _(AF-06 / R-04)_
7. **CI is Linux-only** (Medium-High) — Windows/macOS printing and path code ships untested. _(AF-07 / R-05)_
8. **Distribution signing** (Medium) — Windows ships unsigned; the correct macOS signing pipeline is blocked on absent credentials. _(AF-29 / R-08, R-09)_
9. **Consistency debt** (Medium) — 483 `console.*` bypass the redaction-configured logger; `asyncHandler` used in 1/51 route files; ~567 `any` in `main/`; ~41 `(req as any).user` casts. All fixable by codemod against patterns already in the repo. _(AF-13/14/15/16)_
10. **Security hardening backlog** (Medium/Low) — server-app sets no security headers; CSP `'unsafe-inline'` + JWT in `localStorage`; 4-digit master PIN. None is an open hole; all are defense-in-depth. _(AF-08/09/10 / R-10/11/12)_

## Recommended next steps (see [REFACTORING-ROADMAP.md](REFACTORING-ROADMAP.md))

- **First 30 days — make the safety nets real:** switch to a directory-glob test runner so no suite can be orphaned; wire the recovery + boundary + inventory suites and the unit layer into CI; measure coverage repo-wide; ship the one-line security hardening; add `Request.user` typing; provision macOS signing secrets.
- **Days 30–60 — converge & unblock:** codemod `console.*`→logger and adopt `asyncHandler`; integrate Windows signing + a Windows CI job; route frontend calls through the axios client and reuse `useKdsConnection`; header-harden all three servers.
- **Days 60–90 — test the product surface:** real frontend component tests + expanded Playwright; a cross-process SQLite contention test; split `settings/page.tsx` per tab; complete audit-trail coverage.
- **Beyond 90 days — the money cutover:** complete REAL→integer-cents as one coordinated migration with a `bill_payments` table and folded-in FKs/CHECKs — sequenced last, on top of the coverage built first, per the data-safety mandate.

**Single most important recommendation:** _wire the tests you already wrote into CI._ It is low-risk, high-leverage, retires two of the top three risks, and creates the safety net that makes every later change verifiable.

## Production verdict

**GO for the declared target** (single store, owner-operated, primarily localhost) — the money path, auth, Electron hardening, and backup/restore are all PASS with evidence. **Not yet approved for broad/multi-terminal/LAN rollout** until five conditions close: wire the orphaned + unit suites into CI; add frontend + concurrency tests; unblock signed distribution; header-harden the other servers; broaden CI to Windows. Detail and evidence in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §7.

## Limits of this audit

Static source review only. **Not performed:** live penetration testing, load/stress testing, transitive-dependency CVE scanning (`npm audit` — sandbox network-restricted), signed-artifact validation, and cross-platform (Windows/macOS) runtime execution (CI is Linux-only; signing is blocked on absent credentials). Those areas are marked **NOT VERIFIED** in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) rather than assumed. Findings assert no vulnerability or line number without file-level evidence.

---

_Full index and all 21 documents: [README.md](README.md)._
