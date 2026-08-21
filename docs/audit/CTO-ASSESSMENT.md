# CTO Assessment — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · **Branch:** `restaurant-vertical` · **Schema:** `user_version = 86`

An executive engineering judgement synthesizing all thirteen lens audits. Written to be honest and decision-useful, not flattering. Every claim traces to a cited finding.

---

## 1. Verdict in one paragraph

OPERAVIA is a **well-engineered, deliberately-scoped local-first desktop POS** whose core — the money path — is built with genuine ledger discipline (transactional, idempotent, immutable-snapshot, actor-authoritative) and whose data-safety machinery (atomic migrations, verified backups, transactional FK-gated restore, fail-closed corrupt-DB handling) is among the best-engineered parts of the system. It is **production-capable today for its declared target** (a single store, owner-operated, running primarily over localhost). It is **not yet ready for a confident wider rollout** because of two fixable weaknesses: **test-gating breadth** (the best recovery tests and the architecture-boundary guards are authored but not run by CI; the frontend and cross-process concurrency are effectively untested) and **distribution signing** (Windows ships unsigned; the correct macOS signing pipeline is blocked on absent credentials). Neither weakness is architectural, and neither reflects a defect in the code that _is_ tested — they are gaps in _process_ and _configuration_. There are **no confirmed Critical or High security vulnerabilities.**

## 2. Weighted score — **74 / 100**

Scored against the mandated category weights. Each score is justified by the cited lens audit; the intent is to be defensibly critical, not to inflate.

| Category                  | Weight  | Score /100 | Weighted       | Basis (cited)                                                                                                                                                                                    |
| ------------------------- | ------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture              | 15      | 80         | 12.00          | Coherent modular monolith; fail-closed vertical composition; clean routes→services→data layering; three-server split. Held down by god-files + duplicated bootstrap (ARCHITECTURE 7.1–7.3).      |
| Code Quality              | 15      | 72         | 10.80          | High-quality ceiling, uneven adoption: ~567 `any`, 483 `console.*` bypassing pino, `asyncHandler` 1/51 — but ~0 dead code and typed-row exemplars (CODE-QUALITY §1–§9).                          |
| Maintainability           | 10      | 68         | 6.80           | Strong docs/ADRs/debt-ledger + governed hotspots, dragged by 6,654- and 4,120-line god-files and split root/frontend governance (PROJECT-STRUCTURE 7.1/7.3, CODE-QUALITY §1).                    |
| Security                  | 15      | 80         | 12.00          | No Critical/High; exemplary auth (role-from-DB), SQL/command discipline, secret storage, path-traversal defense. 3 Mediums are hardening (SECURITY §1–§3).                                       |
| Testing                   | 15      | 58         | 8.70           | Backend money-path integration strong (4/5), but 63 orphaned suites + untested frontend + no concurrency test + Linux-only CI (TESTING §3, maturity ~2.5/5).                                     |
| Performance               | 10      | 78         | 7.80           | Sound for single-store: batched hot paths, good indexes, pagination. Non-urgent: cold-start scans, KDS re-broadcast, memoization (PERFORMANCE §2–§4).                                            |
| Database / Data Integrity | 10      | 72         | 7.20           | Backup/restore/migration/recovery excellent (S1–S10); core-table integrity incomplete — REAL-primary money, JSON payments, missing FKs/CHECKs (DATABASE F1–F4).                                  |
| DevOps                    | 5       | 80         | 4.00           | Mature release engineering (sign/notarize triple-verify, auto-update integrity, tag/CHANGELOG gates, SHA-pinned). Held by unsigned Windows + blocked mac signing + Linux-only CI (DEVOPS §2–§4). |
| Documentation             | 5       | 85         | 4.25           | Over-documented in the best sense: community-health complete, ADRs, QA ledger, enforced release docs. Minor taxonomy/typo/drift (DOCUMENTATION §1–§4).                                           |
| **Total**                 | **100** | —          | **73.55 → 74** |                                                                                                                                                                                                  |

**Interpretation:** a 74 is a **solid, above-average engineering effort with clearly-identified, non-architectural gaps** — not a prototype, not yet enterprise-hardened. The score is pulled up by Security, Architecture, DevOps, and Documentation, and pulled down primarily by Testing (the single largest drag at 15% weight) and Maintainability.

## 3. Technical maturity: **Early Production** (trending Production)

On the ladder _Prototype / Early Production / Production / Mature Production / Enterprise-Ready_:

- **Above Early Production because:** the money path is transactional/idempotent/tested; data-safety is mature; there are real ADRs, a debt ledger, incident-hardened release automation, and a governance rule (R4.1) that is actively dismantling the god-files.
- **Not yet Production (the label that would require closing these) because:** authored safety-net tests don't run in CI, the frontend and cross-process concurrency are untested, distribution isn't signed on two platforms, and the money-cents cutover is mid-flight.
- **What moves it to "Production":** completing Horizon 1 + Horizon 2 of the [roadmap](REFACTORING-ROADMAP.md) (wire the orphaned/unit tests, add a Windows CI job, unblock signing, header-harden the other servers). That is weeks of mostly-low-risk work, not a re-architecture.

## 4. Production go/no-go

- **Approve for production for the declared single-store target?** **Yes, conditionally** — the tested surfaces (money path, auth, data-safety) justify it; the conditions are the five items in [PRODUCTION-READINESS §7](PRODUCTION-READINESS.md).
- **Approve for broad/multi-terminal/LAN rollout today?** **No** — close test-gating breadth, concurrency testing, signing, and server-app headers first.
- **Any blocker rooted in the code's design?** **No.** Every blocker is test-wiring, credentials/config, or a deliberately mid-flight migration.

## 5. Top 3 strengths

1. **The money path is engineered like a ledger.** Every multi-write path is a single `withTxn`; idempotency keys are pervasive and enforced (409 on key reuse); financial evidence is frozen in immutable snapshots; the actor is server-authoritative. This is the hardest thing for a POS to get right, and it is right (BACKEND §2, ARCHITECTURE §5).
2. **Data-safety machinery is mature and tested.** Atomic in-transaction migrations with unconditional pre-migration backup, WAL-consistent verified backups, transactional FK-gated injection-guarded restore, and fail-closed corrupt-DB latching with a real end-to-end test (DATABASE S1–S10).
3. **Security fundamentals are exemplary.** Role-from-DB authentication (a stolen token can't self-elevate), the full Electron hardening trifecta + navigation allowlist, parameterized SQL, shell-free command execution, and OS-secure secret storage — with no Critical/High finding (SECURITY §3).

## 6. Top 3 weaknesses / risks

1. **Testing breadth is the weakest link.** The two best recovery tests and the R4.1 boundary guards are authored but **never run by CI**; the frontend that _is_ the product has no component tests; there is no cross-process multi-writer test; CI is Linux-only for a tri-platform app (TESTING §3 / R-02, R-03, R-04, R-05). For a money-handling app, unrun safety nets are the highest-priority risk.
2. **Money representation is mid-migration.** Core order/bill totals still accumulate in floating point with derived (non-authoritative) `_cents`, payments are JSON-only, and core tables lack FKs/CHECKs — so DB-level financial integrity leans on application correctness (DATABASE F1–F4 / R-01, R-06).
3. **Distribution isn't trustworthy on two platforms.** Windows binaries ship unsigned (SmartScreen); the correct macOS signing pipeline is blocked on missing credentials, so no signed macOS build can currently be produced (DEVOPS O1/O2 / R-08, R-09).

## 7. Strategic questions for the team

1. **Money cutover intent:** is completing the REAL→integer-cents cutover (with a `bill_payments` table + FKs/CHECKs) on the near-term roadmap, or is the dual-write state intended to persist? This is the one High data-integrity item.
2. **Multi-writer reality:** in the field, do the main server and the standalone KDS (or multiple terminals) ever write the same DB concurrently? The answer sets the true probability on R-04 and whether the concurrency test is urgent or precautionary.
3. **Distribution timeline:** is a signed public release imminent? If so, signing (R-08/R-09) is the gating item; if distribution stays hand-managed for known operators, it is lower priority.
4. **Cashback-on-refund and split-check rounding** (BACKEND §3): are the current behaviours intended, or latent bugs? These need a product decision before code.

## 8. 30 / 60 / 90-day plan

Maps to [REFACTORING-ROADMAP.md](REFACTORING-ROADMAP.md) horizons; framed as management outcomes.

### First 30 days — _make the safety nets real_ (Roadmap H1 + start H2)

- Switch to a glob test runner; wire the orphaned recovery + `*-boundary` suites; gate the unit layer; measure coverage repo-wide.
- Ship the one-line security hardening (algorithm pinning, constant-time login, `0o600` temp files, bcrypt cost 12).
- Add the `Request.user` augmentation (deletes ~41 casts, unlocks the shared actor helper).
- Provision macOS signing secrets; run one signed release end-to-end.
- **Outcome:** the corrupt-DB/crash-recovery/boundary tests run on every PR; a signed macOS build is producible. Testing and DevOps scores move first.

### Days 30–60 — _converge the abstractions & unblock Windows_ (Roadmap H2)

- Codemod `console.*` → logger (+ lint-ban); adopt `asyncHandler` + one error shape.
- Integrate a Windows code-signing service; add a Windows CI job.
- Route frontend calls through the axios client; reuse `useKdsConnection`; header-harden the server-app/KDS listeners.
- **Outcome:** structured logging is the default; both desktop platforms sign; frontend data-fetching/realtime go through one path; all servers are header-hardened. This is the set that earns the "Production" maturity label.

### Days 60–90 — _test the product surface & take the first god-file_ (Roadmap H3)

- Add real frontend component/unit tests (cart, auth guard, tax panel, API client) + expand Playwright; add the cross-process SQLite contention test.
- Split `settings/page.tsx` per tab (discharges an R4.1 obligation); memoization pass on hot pages; complete the audit-trail coverage (bill discount, drawer, in-txn).
- **Outcome:** the cashier UI and concurrency have real coverage; the worst god-component is gone; the audit trail is complete.

**Beyond 90 days (H4):** the coordinated money-cents cutover + `bill_payments` + FKs/CHECKs, the remaining `db.ts`/`thermal.ts` extractions, and the CSP/token/PIN hardening — sequenced last, on top of the coverage built in the first 90 days, per the data-safety mandate.

## 9. Bottom line

This is a codebase that got the **hard** things right (money integrity, data safety, security fundamentals, release automation) and left the **cheap** things undone (running the tests it already wrote, signing the binaries, converging on the abstractions it already built). That is an unusually favorable position: the remaining work is largely low-risk wiring and configuration, and the one genuinely risky change (the money cutover) is well-understood, already begun, and protected by an existing upgrade-path test discipline. **Score 74/100; Early Production trending Production; approve for the single-store target with the listed conditions; do not scale reliance on unsigned distribution or untested concurrency until Horizons 1–2 are closed.**
