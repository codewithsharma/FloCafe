# Technical Debt — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5

Consolidated, prioritized technical-debt backlog aggregated from the lens audits. Debt here means _deliberate or accreted shortcuts that raise the cost of future change or the probability of defects_ — distinct from bugs (none confirmed on the money path) and from product-scope decisions (Frozen items are **not** debt).

> Framing: this codebase has an unusually **high-quality ceiling with uneven adoption**. Most debt is _consistency debt_ — good abstractions exist (`asyncHandler`, pino logger, typed rows, zod middleware, the `db.ts` R4.1 façade) but are bypassed by the majority of the code. That is the cheapest kind of debt to retire, because the target pattern is already in the repo. The exceptions — the money-cents cutover and the test-wiring gap — are more structural and are the two highest-leverage investments.

---

## 1. Debt themes (ranked by leverage)

### T1 — Test-wiring & coverage debt (highest leverage)

- **What:** 63 `test:*` scripts + 11 test files are never executed by `npm test` or CI (incl. `r14-corrupt-db`, `process-kill-recovery`, `rec-01`, all `*-boundary` R4.1 guards, all `inventory-*`, all `phase-4.*`); the only true unit layer (vitest) isn't gated; c8 coverage is scoped to 4 files so repo-wide coverage is unknown; no cross-process multi-writer test; CI is Linux-only; the 21 `flo-*` "frontend" suites are source-string greps, not UI tests.
- **Why it's debt:** authored, maintained tests that never run give _negative_ value — maintenance cost plus false confidence. The best recovery tests and the architecture-boundary enforcers are among the orphaned.
- **Source:** TESTING 3.1/3.2/3.3/3.5/3.6/3.7; DEVOPS O3/O4.
- **Effort:** Low-Medium (test wiring; **no product code**). **Impact:** High. **Risk of the fix:** Low.
- **Fix:** adopt a directory-glob runner (run every `tests/**/*.test.ts`) so orphaning is impossible by construction; gate `test:unit` (root + frontend); measure coverage repo-wide (report-only, then floor the money-path services); add a Windows CI job; add a two-process SQLite contention test.

### T2 — Money representation & core-table integrity debt

- **What:** money is REAL-primary mid-migration (`_cents` derived from the float, not authoritative) (F1); payments are JSON-only with no relational table (F2); hot FKs are missing (F3); no money/status CHECK constraints on core tables (F4).
- **Why it's debt:** DB-level guarantees that would make bad financial rows _structurally impossible_ are deferred to application correctness. The cutover is explicitly half-done (`money.ts:6` "REAL columns remain until a future cutover").
- **Source:** DATABASE F1–F4.
- **Effort:** High (touches money path + migrations + the full upgrade-path test battery). **Impact:** High. **Risk of the fix:** Medium-High — **must** follow the data-safety mandate (new migration version, preserve data, fresh+upgrade tests, maintainer review).
- **Fix:** one coordinated workstream — compute totals in integer cents, make `_cents` the read source-of-truth, add a `bill_payments` table, fold FKs + CHECKs into the same table-rebuild migration, then retire REAL. **Do not drop REAL columns without a migration + upgrade-path test.**

### T3 — Backend consistency debt (cheap, high-volume)

- **What:** no Express `Request` augmentation → ~41 `(req as any).user` casts + 10 copy-pasted actor helpers under 3 names (`actorId`/`actorUserId`/`actorFrom`); `asyncHandler` used in 1 of 51 route files (rest hand-roll try/catch; `settings.ts` has 62 blocks); 483 `console.*` bypass the redaction-configured pino logger; error-response key drifts (`error` vs `message`); two validation styles (zod middleware vs inline `typeof`); ~567 `any` in `main/` (93 `catch (e: any)`).
- **Why it's debt:** every one has a correct internal exemplar already present; the drift raises cognitive load and carries a latent redaction-bypass risk.
- **Source:** CODE-QUALITY 2/3/4/5/6; BACKEND 5.2/5.3/5.5; CODING-STYLE 3.1–3.5.
- **Effort:** Low-Medium (mostly codemods + one type declaration). **Impact:** Medium-High (leverage). **Risk of the fix:** Low.
- **Fix (evidence-ranked):** (1) add `declare global { namespace Express { interface Request { user?: AuthUser } } }` → deletes ~41 casts, enables one shared actor helper; (2) codemod `console.*` → `logger` in routes/services, then lint-ban `console`; (3) codemod `catch (error: any)` → `catch (error)`; (4) adopt `asyncHandler` + one error shape; (5) migrate the large hand-rolled routes to zod.

### T4 — God-file / maintainability debt

- **What:** `settings/page.tsx` 6,654 lines (111 `useState`, ~72 inline `fetch`, 12 dirty-flag pairs, 18 tabs); `TaxConfigurationPanel.tsx` 1,613; `db.ts` 4,120 (extraction in-flight behind the R4.1 façade); `thermal.ts` 2,505 (five formatters + embedded C#). (`migrations.ts` 2,724 is an append-only ledger — **not** debt; do not split.)
- **Why it's debt:** concentrated merge-conflict and regression surface; `settings/page.tsx` and `db.ts`/`orders.ts` are explicitly fenced by the R4.1 governance rule.
- **Source:** ARCHITECTURE 7.1; CODE-QUALITY 1; FRONTEND 2.1/2.2; PROJECT-STRUCTURE 7.3.
- **Effort:** Settings — Medium; `db.ts`/`thermal.ts` — High. **Impact:** Medium. **Risk of the fix:** Medium (behaviour-preserving extraction; needs tests, which loops back to T1).
- **Fix:** split Settings per-tab into `memo`'d components with their own hooks (discharges an R4.1 obligation); continue the `db.ts` façade extraction; extract the `thermal.ts` formatters (~1,300 lines) behind the existing seam.

### T5 — Frontend architecture debt

- **What:** ~72 inline `fetch` calls bypass the centralized axios client (so the 401-redirect/auth behaviour isn't uniform); `orders/page.tsx` hand-rolls a second `/kds` socket + a 10 s poll instead of reusing `useKdsConnection`; `OrderCard` (583 lines) and `ProductGrid` are unmemoized on the two hottest interactive pages.
- **Source:** FRONTEND 2.3/2.4/2.5; PERFORMANCE 3.6/3.7; BACKEND §7.
- **Effort:** Medium. **Impact:** Medium (consistency + tap latency). **Risk of the fix:** Low-Medium.
- **Fix:** route all calls through the axios client (lint-ban raw `fetch` in the renderer); reuse `useKdsConnection` and apply WS payloads to state instead of refetching; `memo` the cards, `useMemo` derived lists, select narrow store slices, precompute a `Map<productId, qty>`.

### T6 — Cross-server duplication

- **What:** static-serving, Windows `rewriteNextExportPath`, and the EADDRINUSE 10-port scan are copy-pasted across `server.ts`/`kds-server.ts`/`server-app.ts` (subtly different SPA fallbacks); only `server.ts` applies helmet/logging/compression/recovery-protection.
- **Source:** ARCHITECTURE 7.2/7.3; BACKEND §6.
- **Effort:** Medium. **Impact:** Medium (a fix to one can miss the other two). **Risk of the fix:** Low-Medium.
- **Fix:** extract shared `serveStaticExport()` / `listenWithPortScan()` / security-header factory into `main/lib`.

### T7 — Security hardening backlog (defense-in-depth)

- **What:** Master PIN 4-digit + restart-resettable lockout (2.1); CSP `'unsafe-inline'` + `localStorage` JWT (2.2); server-app no security headers (2.3); login timing enumeration (2.4); JWT algorithm not pinned (2.5); world-readable temp receipt file (2.6); server-app no per-account lockout (2.7); bcrypt cost 10; audit-log tamper-evidence (F6).
- **Why it's debt:** all Medium-or-lower hardening — none is an open hole — but they are the highest-value security investments and several are one-line fixes.
- **Source:** SECURITY 2.1–2.7 + bcrypt; DATABASE F6.
- **Effort:** Low (each). **Impact:** Medium. **Risk of the fix:** Low.
- **Fix:** persist PIN lockout + allow 6+ digits; drop `'unsafe-inline'` + move token off `localStorage`; reuse `applySecurityHeaders` on all listeners; constant-time login; pin `algorithms:['HS256']`; `0o600` temp files + unlink in `finally`; share the account-lockout logic; raise bcrypt cost to 12; add an audit hash-chain/trigger.

### T8 — Release / distribution debt

- **What:** Windows ships **unsigned** (SmartScreen); signed macOS is blocked on absent credentials; the merge gate omits the unit layer and orphaned suites (overlaps T1).
- **Source:** DEVOPS O1/O2/O4.
- **Effort:** Medium (signing-service integration) + config (secrets). **Impact:** Medium (trust/conversion) . **Risk of the fix:** Low.
- **Fix:** integrate a code-signing service for Windows; provision the macOS signing secrets and run one signed release end-to-end.

### T9 — Dependency debt

- **What:** Baileys `^7.0.0-rc13` (pre-release, unofficial, floats across RCs); cross-tree toolchain skew (vitest 4/3, eslint 10/9, typescript 5.4/5.9); pre-1.0 UI libs (`@dnd-kit ^0.5.0`) on caret ranges; `googleapis ^173` umbrella for one optional feature.
- **Source:** DEPENDENCY D1/D3/D4/D5.
- **Effort:** Low. **Impact:** Medium (D1) / Low (rest). **Risk of the fix:** Low.
- **Fix:** pin Baileys exact + feature-toggle; converge dev toolchain majors; pin the pre-1.0 packages; import `@googleapis/drive` instead of the umbrella.

### T10 — Performance debt (non-urgent at single-store scale)

- **What:** cold-start full-table scans grow with data (3.1); KDS full-state re-broadcast + per-client re-auth per event (3.2); floor-view N+1 (3.4); macOS printer detection blocks the event loop (3.5); `npm ci` on every dev launch (3.9, dev-only).
- **Source:** PERFORMANCE 3.1/3.2/3.4/3.5/3.9.
- **Effort:** Low-Medium. **Impact:** Low-Medium (none an emergency at one restaurant's scale). **Risk of the fix:** Low.
- **Fix:** gate the legacy startup repairs behind a completion flag; throttle KDS re-auth + send deltas; batch the floor-view query; use async printer probes; `npm install` for dev.

### T11 — Documentation janitorial debt

- **What:** numbered-taxonomy prefix collisions + duplicate `product`/`audit` directories; "Opervia" typo in the CHANGELOG (product is Operavia); currency drift (docs reference schema v75 vs live v86); split API docs.
- **Source:** DOCUMENTATION 2.1–2.5; PROJECT-STRUCTURE 7.2.
- **Effort:** Low. **Impact:** Low (navigability/trust). **Risk of the fix:** Low.
- **Fix:** renumber/consolidate directories; grep-fix "Opervia"; add "last verified against schema vNN" stamps to living docs.

## 2. Debt quantification (indicative)

| Theme                  | Primary metric                                            | Effort   | Impact   | Fix risk |
| ---------------------- | --------------------------------------------------------- | -------- | -------- | -------- |
| T1 Test wiring         | 63 scripts + 11 files orphaned; coverage on 4/‰ files     | Low-Med  | **High** | Low      |
| T2 Money/integrity     | REAL-primary money; 0 payment rows; missing FKs/CHECKs    | High     | **High** | Med-High |
| T3 Backend consistency | 567 `any`, 483 `console.*`, 1/51 `asyncHandler`, 41 casts | Low-Med  | Med-High | Low      |
| T4 God-files           | 6,654 + 4,120 + 2,505 lines                               | Med-High | Med      | Med      |
| T5 Frontend arch       | ~72 inline fetch; 2 sockets; 0 memo on hot pages          | Med      | Med      | Low-Med  |
| T6 Cross-server dup    | 3× copied bootstrap; headers on 1/3                       | Med      | Med      | Low-Med  |
| T7 Security hardening  | 3 Medium + ~6 Low items                                   | Low      | Med      | Low      |
| T8 Release/signing     | Windows unsigned; mac blocked                             | Med      | Med      | Low      |
| T9 Dependencies        | 1 pre-release runtime dep; toolchain skew                 | Low      | Med/Low  | Low      |
| T10 Performance        | 3 startup scans; per-event KDS re-auth                    | Low-Med  | Low-Med  | Low      |
| T11 Docs               | taxonomy + typo + drift                                   | Low      | Low      | Low      |

## 3. What is explicitly NOT debt (credit, so it isn't "paid down" by mistake)

- **Near-zero dead code** and only 2 TODO markers repo-wide (debt tracked in `docs/qa/` instead). Do not "add TODOs."
- **`migrations.ts` size** — an append-only ledger; splitting it adds risk.
- **Synchronous `better-sqlite3`** — the correct choice for a local-first single-store app; not a scalability defect.
- **Frozen scope** (payment gateways, multi-location, payroll, online payment) — product decisions, not debt.
- **The Operavia/FloCafe naming split** — documented and intentional for upgrade continuity (only the customer-visible "Opervia" typo is debt).
- **Money-path design** (transactional, idempotent, immutable snapshots, actor-authoritative) — the system's core strength; the F1 cutover _completes_ it, it does not repair a defect.

## 4. Sequencing

Retire in this order for maximum risk reduction per unit effort: **T1 → T7/T9/T11 (fast wins) → T3 → T5/T6 → T2 (coordinated workstream) → T4 → T8/T10**. Full horizon mapping in [REFACTORING-ROADMAP.md](REFACTORING-ROADMAP.md).
