# Test Architecture — OPERAVIA (P1 design)

**Status:** IMPLEMENTED (P1 — 2026-08-21)  
**Date:** 2026-08-21  
**Related:** [TEST-INVENTORY.md](./TEST-INVENTORY.md), [TEST-GATING-CHANGELOG.md](./TEST-GATING-CHANGELOG.md), [P1-TEST-CI-HARDENING-REPORT.md](./P1-TEST-CI-HARDENING-REPORT.md), audit [TESTING-AUDIT.md](../audit/TESTING-AUDIT.md)

---

## 1. Current state (problem)

| Layer               | Reality                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Backend integration | Explicit file lists in `package.json` → serial `testA && testB && …` via `tests/run-test.sh` |
| Unit                | Vitest globs (`tests/unit/**`, `frontend/src/**/*.test.ts`) — **not in CI**                  |
| E2E                 | Playwright glob under `frontend/e2e/` — gated                                                |
| Discovery           | New `tests/*.test.ts` is **orphaned by default** unless someone edits the mega-chain         |

**Constraint:** Most suites require `node tests/run-electron-node-test.cjs` (Electron-as-Node + real SQLite). They are **not** interchangeable with Vitest. A pure “Vitest discovers everything” rewrite would be a large, high-risk migration and is **out of scope for P1**.

---

## 2. Target model

Keep three runners. Eliminate silent orphaning with **directory/manifest discovery + a CI guard**.

```text
npm test                    → merge-gate (alias)
├── test:unit               → Vitest root (tests/unit/**)
├── test:unit:frontend      → Vitest frontend
├── test:integration        → money-path + authz + backup + existing gated core
├── test:recovery           → corrupt-DB, process-kill, unopenable-DB, related
├── test:critical           → recovery + R4.1 + *-boundary + inventory integrity
├── test:extended           → R2–R15, phase-4.*, GUI-000x, retail/synthetic, etc.
├── test:e2e                → Playwright
├── test:all                → unit + integration + critical + extended + e2e
└── test:discover-guard     → fails if any *.test.ts lacks a tier assignment
```

Exact script names may be slightly adjusted during implementation; the **tier semantics** must remain.

### Tiers

| Tier                | When it runs                                                | Must include                                                                                                                        |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Merge gate**      | Every PR/push that touches product/test/CI (see path rules) | `test:unit`, `test:unit:frontend`, current `npm test` core, `test:critical`, lint, `tsc`, frontend build, Playwright, tax invariant |
| **Extended / full** | `main`, nightly, release, `workflow_dispatch`               | `test:extended` (+ merge gate)                                                                                                      |
| **Manual**          | Documented only                                             | Hardware printers, signed-artifact checks, OPS-02 drills, `audit:db`                                                                |

---

## 3. How discovery works (P1 approach)

### 3.1 Do **not** require moving 200+ files in P1

File moves are optional later. P1 uses a **manifest** that every automated test must appear in exactly one of:

- `merge` — merge gate
- `extended` — full/nightly
- `manual` — intentionally not automated in CI
- `obsolete` — must not run; scheduled for deletion (empty at start)

Implemented as `tests/test-tiers.json` (or `.cjs`) generated/checked by `scripts/assert-test-tiers.cjs`.

### 3.2 Running a tier without `&&` chains

`scripts/run-test-tier.cjs <tier>`:

1. Load tier membership from the manifest.
2. For each file, choose runner:
   - `tests/unit/**` → already covered by Vitest command (skip in electron runner)
   - `frontend/**` → Vitest / Playwright as appropriate
   - else → `node tests/run-electron-node-test.cjs <file>` **or** `ts-node` when the existing script used ts-node (detect via small runner map or file header / convention)
3. Fail on first failure (same as today) **or** collect failures and exit non-zero (prefer collect for local; fail-fast in CI via env).

**Compatibility:** Keep existing per-suite `npm run test:r14` etc. as thin aliases. Replace the body of `npm test` with `test:unit && test:integration && test:critical` (or equivalent) rather than an ever-growing `&&` list of 80 scripts.

### 3.3 Orphan guard (Phase 6)

`npm run test:discover-guard`:

1. Enumerate all `tests/**/*.test.ts`, `frontend/src/**/*.test.ts(x)`, `frontend/e2e/**/*.spec.ts`.
2. Assert each path is listed in the tier manifest.
3. Assert no path is listed twice.
4. Assert `obsolete` entries still exist on disk only if flagged with a removal issue id.
5. **CI runs this on every merge-gate job** — a new test file without a tier entry **fails CI**.

This is the simplest robust anti-orphan mechanism without new dependencies.

---

## 4. CI redesign (preserve strengths)

### Preserve

- SHA-pinned Actions
- PR dependency-review (`fail-on-severity: high`)
- Always-on `tax-category-invariant`
- npm cache + `@electron/rebuild` for `better-sqlite3`
- Frontend lint + build
- Playwright job + artifact upload
- Coverage baseline artifact
- No `continue-on-error` / `|| true` on tests

### Proposed job graph

```text
dependency-review (PR only)
        │
changes ──┼── tax-category-invariant (always)
          │
          ├─ backend-tests     (unit + integration + critical + discover-guard
          │                     + lint backend + tsc)
          ├─ frontend-tests    (FE lint + FE unit + build:frontend)
          │
          └─ critical-e2e      (Playwright; needs frontend build artifacts or rebuild)

nightly / main full:
          └─ extended-tests    (test:extended; longer timeout)
```

### Path-filter safety (must fix)

Widen filters so recovery/integrity cannot be skipped accidentally:

- Treat `.github/workflows/**`, `scripts/**`, `vitest.config.*`, `tests/test-tiers.json`, root `package.json` as **backend** (or always-run baseline).
- Keep tax invariant always-on.
- Prefer: docs-only PRs may skip heavy jobs; **any** `tests/**` or CI/script change must run baseline + discover-guard.

### Timeouts

Current `linux-baseline` is **15m** and already tight. After wiring critical orphans:

- Raise merge backend job to **25–30m**, **or**
- Split unit ∥ integration ∥ critical into parallel jobs sharing `npm ci` cache.

Do **not** drop suites to stay under 15m.

### Nightly

Update `nightly-release.yml` to run `npm run test:all` (or merge + extended), not only legacy `npm test`.

---

## 5. What gets wired where (Phase 3–4)

### Merge gate additions (priority)

| Suite                                            | Reason                           |
| ------------------------------------------------ | -------------------------------- |
| `test:unit` + frontend `test:unit`               | Audit AF — ungated units         |
| `test:r14`, `p1-06-unopenable-db`                | Corrupt / unopenable fail-closed |
| `test:process-kill`                              | Crash atomicity                  |
| `test:r4.1` + all `*-boundary`                   | R4.1 architecture guards         |
| Inventory ledger / movements / void-cancel-stock | Inventory integrity              |
| `phase-4.2-refund-restock`                       | Money + stock                    |
| `integration-inclusive-tax`                      | Tax completeness                 |
| Restaurant isolation pair                        | Vertical isolation               |

### Extended suite

R2–R15 (except surfaces already in merge), remaining phase-4.*, GUI-000x pack, synthetic retail, money-cents, product-images, e2e-argentina-flow, etc.

### Manual / ops

`audit:db`, hardware printers, signed RC validation, OPS-02 — document in inventory; do not fake-gate.

### Do not

- Blindly delete tests
- Mark broken tests as manual without evidence
- Begin REAL→cents or `bill_payments`
- Weaken security / tax / dependency review

---

## 6. How developers add a test (after P1)

1. Add `tests/<name>.test.ts` (or `tests/unit/…` / `frontend/src/…` / `frontend/e2e/…`).
2. Add the path to `tests/test-tiers.json` under `merge`, `extended`, or `manual`.
3. Optionally add a convenience script `test:<shortname>`.
4. Run `npm run test:discover-guard` locally (also CI).
5. Run the tier command that includes the file.

If step 2 is skipped → **CI fails**. Silent orphaning is impossible for normal automated tests.

---

## 7. Implementation sequence (when approved)

1. Add `tests/test-tiers.json` populated from inventory dispositions.
2. Add `scripts/run-test-tier.cjs` + `scripts/assert-test-tiers.cjs`.
3. Wire package.json commands; slim `npm test` to merge-gate composition.
4. Wire unwired files (11) with scripts + tier entries.
5. Update `ci.yml` + nightly; raise timeouts / parallelize.
6. Execute Phase 7 validation; record PASS/FAIL/BLOCKED with evidence.
7. Write `TEST-GATING-CHANGELOG.md` + `P1-TEST-CI-HARDENING-REPORT.md`.
8. Update audit finding status only to the degree validation proves.

---

## 8. Success metric

> Every intended automated test has an explicit execution path, critical tests gate regressions, and a newly added normal test **cannot** silently bypass CI.

Green CI alone is not success.
