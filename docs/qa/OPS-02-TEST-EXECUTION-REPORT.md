# OPS-02 — Test Execution Report

**Date:** 2026-08-21  
**HEAD (eng work):** post-P19 OPS-02 phase on `restaurant-vertical`  
**Schema tip:** **v88**  
**Package:** **3.0.5**

---

## Summary

| Area                  | Command / method                                 | Result                                | Classification notes                                                                                                                         |
| --------------------- | ------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint (backend)        | `npm run lint:backend`                           | **PASS** (0 errors, 912 warnings)     | Warnings = debt, not gate fail                                                                                                               |
| Lint (full)           | `npm run lint`                                   | **FAIL**                              | **Pre-existing** frontend React Compiler / refs rules (e.g. `useKdsConnection.ts`) — baseline debt per `.ai/risks`; not introduced by OPS-02 |
| Unit (root)           | via `npm test` vitest                            | **PASS** 43/43                        |                                                                                                                                              |
| Unit (frontend)       | via `npm test`                                   | **PASS** 28/28                        |                                                                                                                                              |
| Merge / integration   | `npm test`                                       | **PASS** `pass=194 fail=0 abi_skip=0` | After stale-test remediation                                                                                                                 |
| Discover guard        | `npm run test:discover-guard`                    | **PASS** 256 classified               |                                                                                                                                              |
| Recovery group        | `npm run test:recovery`                          | **PASS** `pass=4 fail=0`              | Now includes REC-01                                                                                                                          |
| Build                 | `npm run build`                                  | **PASS**                              | `dist/` emitted                                                                                                                              |
| Packaging (unsigned)  | `CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack` | **PASS**                              | `release/mac-arm64/Operavia.app`; signing skipped (**environment**)                                                                          |
| Packaging (signed)    | `build:mac` / release-mac                        | **BLOCKED**                           | No Developer ID / notarization secrets on eng host                                                                                           |
| Smoke                 | `npm run test:smoke`                             | **PASS**                              | Includes OPS-02-OBS-001 version assert                                                                                                       |
| KDS outbox            | `npm run test:kds-h-outbox`                      | **PASS**                              | Includes OPS-02-KDS-001                                                                                                                      |
| H1 / H2 / P18         | `test:h1`, `test:h2`, `test:p18`                 | **PASS** 37 / 34 / 46                 |                                                                                                                                              |
| Playwright            | `npm run test:e2e`                               | **PASS** 4/4                          | Chromium                                                                                                                                     |
| Extended              | `npm run test:extended`                          | **NOT RUN** this session              | Recommended before Live GO; CI runs on main push                                                                                             |
| Manual critical paths | Matrix                                           | **NOT TESTED** (this session)         | Template prepared                                                                                                                            |

---

## Failure classification (encountered during OPS-02)

| Failure                                                     | Class                   | Resolution                         |
| ----------------------------------------------------------- | ----------------------- | ---------------------------------- |
| `cash-payment-gate` missing order Idempotency-Key           | **stale** (post-P18)    | Fixed local request helper         |
| `issue-133` network_mode 503 without Master PIN             | **stale** (post-P15)    | Set Master PIN + send `master_pin` |
| Multiple local helpers / `security-hardening` order creates | **stale** (post-P18)    | Auto-inject / explicit keys        |
| Full `npm run lint` FE React Compiler errors                | **debt / pre-existing** | Documented; not OPS-02 regression  |
| Signed packaging                                            | **environment**         | Human credential gate              |

No **product** failures found in merge after stale-test remediation. Product Idempotency-Key enforcement behaved correctly; tests were behind.

---

## Gate mapping (automated)

| Gate      | Evidence                                                                           | Status                           |
| --------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| A Build   | `npm run build` PASS; unsigned pack PASS                                           | **PASS** (signed A4 **BLOCKED**) |
| B DB      | recovery + backup suites historically green; process-kill; r14; rec-01 in recovery | **PASS** (eng)                   |
| C POS     | h1, r1 (via merge), p18                                                            | **PASS** (eng)                   |
| D Payment | merge money paths + process-kill                                                   | **PASS** (eng)                   |
| E KDS     | h2, kds-h-outbox (+ notify enqueue)                                                | **PASS** (eng)                   |
| F RBAC    | h3 / authz in merge                                                                | **PASS** (eng)                   |
| G Offline | process-kill + outbox + sticky contracts; site OFF rows unexecuted                 | **PASS WITH CONDITIONS**         |
| H Suites  | merge green; full lint red (classified)                                            | **PASS WITH CONDITIONS**         |

---

## Playwright

| Spec                                               | Status   |
| -------------------------------------------------- | -------- |
| `kds-login.spec.ts`                                | **PASS** |
| `layout-integrity.spec.ts`                         | **PASS** |
| `prepaid-payment-reconciliation.spec.ts` (2 tests) | **PASS** |

**Aggregate:** 4 passed (9.7s) · exit 0

---

## Explicit non-claims

- Live café drills **not** claimed
- Signed/notarized RC **not** verified
- Manual matrix rows remain **NOT TESTED** until executed on RC
