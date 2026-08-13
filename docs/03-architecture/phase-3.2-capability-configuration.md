# Phase 3.2 — Deploy/Start Vertical & Capability Configuration

**Date:** 2026-08-13  
**Decision:** **PHASE 3.2 COMPLETE**  
**Schema:** v75 (unchanged)  
**Compile-time default:** `ACTIVE_VERTICAL_ID` constant = `restaurant`  
**Deploy/start override:** environment variable `ACTIVE_VERTICAL_ID`

Related: [phase-3.1-fail-closed-remount.md](phase-3.1-fail-closed-remount.md), [phase-2-closeout-and-phase-3-gate.md](phase-2-closeout-and-phase-3-gate.md)

---

## 1. Objective

Move from compile-time-only vertical selection to **explicit deploy/start configuration** that feeds Phase 3.1 fail-closed remount:

```
Deploy / Start
      ↓
ACTIVE_VERTICAL_ID env (optional)
      ↓
resolveActiveVerticalId / commitActiveVerticalFromEnv
      ↓
assertFailClosedComposition
      ↓
registerRoutes({ verticalId })
      ↓
listen
```

This is **not** runtime switching. Change composition by changing env and **restarting** the process.

## 2. Configuration mechanism

| Item            | Value                                                                 |
| --------------- | --------------------------------------------------------------------- |
| **Source**      | Process environment                                                   |
| **Name**        | `ACTIVE_VERTICAL_ID`                                                  |
| **Code**        | `main/modules/vertical-config.ts`                                     |
| **Commit site** | `main/server.ts` → `startServer()` before `registerRoutes` / `listen` |

No new config framework. No DB-backed vertical. No admin UI.

## 3. Default behavior

| Env               | Result                                              |
| ----------------- | --------------------------------------------------- |
| **Unset**         | `restaurant`                                        |
| `restaurant`      | Restaurant composition                              |
| `retail-test`     | Safe synthetic Retail composition (validation only) |
| `""` / whitespace | **Fail-closed** (`CompositionValidationError`)      |
| Unknown id        | **Fail-closed**                                     |

Unset ≠ empty. Empty is malformed and does **not** fall back to restaurant.

## 4. Valid verticals (startup selectable)

| Id            | Kind                              | Notes                                                   |
| ------------- | --------------------------------- | ------------------------------------------------------- |
| `restaurant`  | Production (`VERTICALS`)          | Default; café pilots                                    |
| `retail-test` | Synthetic (`SYNTHETIC_VERTICALS`) | Composition validation only — **not** Production Retail |

Production Opervia Retail remains **Phase 3.3**.

## 5. Startup resolution

Authoritative helpers:

- `resolveActiveVerticalId(env?)` — pure; throws on invalid
- `commitActiveVerticalFromEnv(env?)` — resolve + lock for process lifetime
- `getCommittedActiveVerticalId()` / `getActiveVerticalId()` — locked or resolve-without-lock
- `resetActiveVerticalResolutionForTests()` — test isolation

`registerRoutes` defaults to committed id when `options.verticalId` omitted.

## 6. Composition validation & remount

Reuses Phase 3.1:

- `assertFailClosedComposition`
- `getRouteMountPlan` / `shouldMountModule`
- No second validator

Invalid env → throw before gated mounts → Promise rejects in `startServer` → **no listen**.

## 7. Restaurant / Retail behavior

**Restaurant:** modules include tables/kitchen/kds/menu/addons → those routes mount.

**retail-test:** Core commerce mounts; restaurant prefixes absent → HTTP 404.

## 8. Health / readiness

`/api/health` is registered before routes, but `listen` only runs after successful `commit` + `registerRoutes`. Invalid composition never serves traffic.

## 9. Diagnostics

`formatStartupCompositionDiagnostics` / `logStartupCompositionIfAppropriate` log active vertical + enabled module ids (no secrets). Non-production only for console.

## 10. Runtime switching — explicitly excluded

No `switchVertical`, hot-swap, `POST /admin/vertical`, or DB `active_vertical`. Restart required.

## 11. Frontend

No Phase 3.2 frontend redesign. Backend remount remains authoritative. Deep-link skew under `retail-test` env is acceptable for validation; Production Retail UX is 3.3.

## 12. Operational instructions

```bash
# Restaurant (default — may omit env)
ACTIVE_VERTICAL_ID=restaurant
# restart app

# Safe Retail composition validation (NOT production Retail)
ACTIVE_VERTICAL_ID=retail-test
# restart app → restaurant routes absent

# Invalid — process fails at startup
ACTIVE_VERTICAL_ID=unknown
```

## 13. Tests

- `tests/capability-config.test.ts`
- `npm run test:capability-config` (also via `test:module-registry`)

Matrix: unset default, explicit restaurant, retail-test remount, unknown/empty fail-closed, diagnostics, no listen on invalid, no switch helpers.

## 14. Deferred

| Item                                          | Phase                      |
| --------------------------------------------- | -------------------------- |
| Production Retail vertical in `VERTICALS`     | 3.3                        |
| Frontend vertical alignment for retail ACTIVE | 3.3                        |
| Settings/UI vertical selector                 | not planned (restart-only) |
| Soft-gate residuals                           | 3.4                        |

---

**Verdict:** Deploy/start vertical configuration is live via `ACTIVE_VERTICAL_ID` env. Phase 3.3 not started.
