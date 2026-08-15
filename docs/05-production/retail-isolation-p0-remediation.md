# Retail Isolation P0 Remediation

**Date:** 2026-08-14  
**Branch:** `modular-verticles`  
**Schema:** v80 (unchanged)  
**Money path:** unchanged  
**Phase 4.16:** not created

Authorized from `docs/05-production/post-phase-4.15-pilot-readiness-audit.md`. This is a production-safety patch, not a feature roadmap.

---

## 1. Original P0 findings

| ID                   | Finding                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-1 / ISO-01**    | KDS companion always bound port 3002 and returned HTTP 200 on Retail. Server App on 3003 was the same ungated companion (audit P1-09; this patch gates it because the remediation required vertical composition for Server App too).                             |
| **P0-2 / RETAIL-01** | Products admin called `isModuleEnabled('addons')` without composition `verticalId`. Renderer fallback is restaurant, so Retail fetched `GET /addon-groups` (404) inside `Promise.all` with products/categories and toasted `failedToLoad` for the whole catalog. |

---

## 2. Root causes

**P0-1.** Main API remount already 404s `/api/kds` on Retail. Isolation failed at **process bind**: `startKdsServer()` / `startServerApp()` never consulted `isModuleEnabled`. `main/index.ts` and `dev-server.js` always awaited them after `startServer()`.

**P0-2.** `isModuleEnabled(id)` with no second argument uses `getActiveVerticalId()`. In the Next renderer that often falls back to compile-time `ACTIVE_VERTICAL_ID = 'restaurant'`. POS/Tables already pass `composition.verticalId`; Products/KDS/Orders did not. Addon HTTP was coupled to catalog `Promise.all`.

---

## 3. Exact changes

| File                                                                                | Change                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main/kds-server.ts`                                                                | `startKdsServer()` returns `Promise.resolve()` when `!isModuleEnabled('kds')`. Does **not** use settings `isKdsEnabled()`.                                          |
| `main/server-app.ts`                                                                | `startServerApp()` returns `Promise.resolve()` when `!isModuleEnabled('tables')` (waiter/tableside companion).                                                      |
| `frontend/.../products/page.tsx`                                                    | `usePlatformComposition`; `isModuleEnabled('addons'\|'inventory', verticalId)`; catalog `Promise.all` is products+categories only; addon-groups fetched separately. |
| `frontend/.../kds/page.tsx`                                                         | Composition `verticalId` in `isFeatureAvailable`; wait for composition; workspace (and `useKdsConnection`) mounts only when KDS is available.                       |
| `frontend/.../orders/page.tsx`                                                      | Pass `verticalId` into KDS/tables gates; wait for composition before tables fetch; open `/kds` WebSocket only when KDS is enabled for the vertical.                 |
| `tests/retail-isolation.test.ts`                                                    | Live bind characterization: Restaurant 200; Retail / retail-test refuse.                                                                                            |
| `tests/flo-products.test.ts`, `flo-orders.test.ts`, `kds-frontend-conflict.test.ts` | Source contracts for composition + isolation.                                                                                                                       |
| `package.json`                                                                      | `test:retail-isolation`; wired into `test:module-registry` (hence default `npm test`).                                                                              |

`index.ts` still calls `await startKdsServer()` so REC-01 source contracts stay valid; the skip is inside the start functions (covers Electron and `dev-server.js`).

---

## 4. Restaurant behavior

Unchanged functionally:

- `kds` and `tables` remain enabled on the restaurant vertical.
- KDS `:3002` and Server App `:3003` still bind.
- Products still loads addon groups when composition says restaurant.
- Orders still opens the KDS WebSocket when the module and `kds_enabled` flag are on.
- Settings flag `kds_enabled=false` still **binds** KDS (issue #133); only APIs 404. This patch does not change that.

---

## 5. Retail behavior

- KDS does not bind. Direct `http://127.0.0.1:3002/api/health` is connection-refused, not HTTP 200.
- Server App does not bind (tables module off).
- Products catalog loads without addon-groups. Addon tab stays off.
- Dashboard `/kds` fail-closes to EmptyState (module off).
- Orders does not fetch `/tables` or open `/kds` WebSocket.
- Main API restaurant prefixes remain 404 (pre-existing remount).

`retail-test` uses the same companion skip.

---

## 6. Direct access behavior

| Access                         | Restaurant       | Retail                 |
| ------------------------------ | ---------------- | ---------------------- |
| `:3002 /api/health`            | 200              | No listener            |
| `:3002 /kds-standalone`        | Served           | No listener            |
| `:3003 /api/health`            | 200              | No listener            |
| Main `:3001 /api/kds`          | Mounted          | 404 (remount)          |
| Main `:3001 /api/addon-groups` | Mounted          | 404 (remount)          |
| Renderer `/kds`                | KDS workspace    | EmptyState             |
| Renderer `/products`           | Catalog + addons | Catalog without addons |

Hiding nav is not sufficient; companion bind and catalog `Promise.all` were the actual leaks.

---

## 7. Tests

Characterization (RED before the patch, GREEN after):

- `npm run test:retail-isolation`
- `npm run test:flo-products`
- `npm run test:flo-orders`
- `npm run test:kds-frontend-conflict`

Regression run as part of this patch:

- `test:kds-integration`, `test:kds-contract`, `test:smoke`
- `test:fail-closed-remount`, `test:restaurant-isolation`, `production-retail.test.ts`
- `test:flo-tables`, `test:inventory-boundary`, `test:refunds`, `test:phase-4.5`, `test:financial-reporting`

---

## 8. Security / isolation verification

- Companion skip is module-based, not UI-hide.
- Skip **resolves** (does not reject) so `initialize()` cannot `app.quit()` from a Retail skip.
- Final reviewer: **PASS WITH NITS**. Residual: if `GET /platform/composition` fails, renderer `verticalId` is undefined and `isModuleEnabled` can still fall back to restaurant. Process-level KDS/Server App still stay down on Retail because the committed vertical is `retail`. Documented as remaining P1, not reopened as P0.

---

## 9. Schema status

**v75. No migration.**

---

## 10. Money-path status

Unchanged. No edits to payments, refunds, restock, exchange, inventory quantities, shifts, day close, tax, FIN-01, or reporting semantics.

---

## 11. Remaining audit findings

This patch closes **P0-1** and **P0-2** (and the Server App bind half of P1-09).

Still open from the post-4.15 audit (do not auto-start):

- Restaurant café human gates (signed artifact, OPS-01, PIN escrow, printer drill, training)
- P1-01 cancel-after-pay restock (train or code-fix)
- P1-04 FIN-02 Gross/Net vs stuck-`partial`
- P1-03 chef pending-cancel
- P1-06 / P1-07 recovery (unopenable DB; KDS bind failure quitting POS — Retail skip no longer hits the bind-failure path)
- Composition-fetch error still renderer-fail-opens restaurant (nit above)
- ADR-014 Proposed; variants matrix; billed table merge — frozen

Retail is **no longer blocked by these two P0s**. A retail store pilot still needs the remaining P1s plus ops gates; this patch does not declare Retail PILOT READY.
