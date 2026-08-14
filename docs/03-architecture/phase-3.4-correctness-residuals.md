# Phase 3.4 — Correctness & Soft-Gate Residuals

**Date:** 2026-08-14  
**Decision:** **PHASE 3.4 COMPLETE**  
**Schema:** v75 (unchanged — no migration)  
**Default vertical:** `restaurant` (unset `ACTIVE_VERTICAL_ID`)  
**Production Retail:** `ACTIVE_VERTICAL_ID=retail` (unchanged)

Related:

- [phase-2-closeout-and-phase-3-gate.md](phase-2-closeout-and-phase-3-gate.md) §6 Phase 3.4
- [phase-3.1-fail-closed-remount.md](phase-3.1-fail-closed-remount.md)
- [phase-3.2-capability-configuration.md](phase-3.2-capability-configuration.md)
- [phase-3.3-production-retail.md](phase-3.3-production-retail.md)
- Implementation plan: [phase-3.4-implementation-plan.md](phase-3.4-implementation-plan.md) (also under ignored `docs/superpowers/plans/` for SDD tooling)

---

## 1. Objective

Close known isolation and correctness holes from Phases 2.14 / 2.17 / 2.18 and the Phase 3 closeout **without redesigning** the vertical architecture.

Phase 3.4 is a **correctness / isolation hardening** pass, not a new platform layer.

---

## 2. Authoritative vertical model (unchanged)

```
ACTIVE_VERTICAL_ID env (optional)
        ↓
resolveActiveVerticalId  (unset → restaurant; empty/unknown → throw)
        ↓
commitActiveVerticalFromEnv  (once in startServer)
        ↓
lockedActiveVerticalId  (process-global, immutable for process lifetime)
        ↓
registerRoutes(app, { verticalId })  + isModuleEnabled(id)
```

| Fact                                                                                             | Implication                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Vertical is **process-locked** via `lockedActiveVerticalId` in `main/modules/vertical-config.ts` | One active vertical per process                     |
| No `req.verticalId`                                                                              | Handlers must not invent per-request vertical       |
| No runtime hot-swap                                                                              | Change vertical → restart + env                     |
| No order cron / worker queue that needs captured vertical                                        | Async work sees the **same** committed vertical     |
| Fail-closed remount (3.1)                                                                        | Disabled restaurant modules are not mounted as HTTP |

**Authoritative resolution** = env → commit → lock.  
**Defense-in-depth soft-gates** = `isModuleEnabled('kds'|'tables')` on restaurant side effects that still run from Core-mounted routes (`order`, `payment`, `held-orders`).

These layers are complementary. Soft-gates do **not** replace remount; remount does **not** cover every side effect on shared routes.

---

## 3. Why ALS / request-scoped vertical is rejected

The isolation brief asked for “explicit vertical context” on notifications, handlers, and async work. An audit of this repository found:

1. **No per-request vertical** — all enablement reads `getActiveVerticalId()` → committed lock.
2. **No order background jobs** that outlive a request and need a different vertical than the process.
3. KDS coalesce uses `queueMicrotask` only; cloud-sync outbox is vertical-agnostic commerce sync.
4. Introducing AsyncLocalStorage, `req.verticalId`, or request-scoped vertical middleware would be a **redesign** and would not fix the documented residuals (ungated alias, held-orders table writes, void×cancel over-restore, stock HTTP 500).

Therefore Phase 3.4 treats items 1–4 of the isolation brief as:

> **Soft-gate / fail-closed hardening against the committed process vertical.**

Missing / invalid `ACTIVE_VERTICAL_ID` already fails closed at commit time (`vertical-config.ts`). That contract stays; this phase does not re-implement it.

---

## 4. Residuals in scope (seven areas)

| #   | Residual                           | Problem                                                                                              | Fix shape                                                |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `notifyOrderUpdated` / KDS notify  | Alias and several call sites skip module enablement; broadcast only checks settings `isKdsEnabled()` | Gate **inside** `notifyKdsUpdate` / `notifyOrderUpdated` |
| 2   | Order / event handlers             | Shared routes can still emit KDS side effects when `kds` module is off                               | Same internal gate + `order-items` gate                  |
| 3   | Background / async                 | `queueMicrotask` coalesce is safe **if** notify is module-gated; no ALS                              | Document + rely on internal gate                         |
| 4   | Remaining vertical fail-open holes | e.g. `order-items` mounted under `order` with settings-only KDS gate                                 | Module soft-gate on status notify                        |
| 5   | Held-orders `tables`               | Always `UPDATE tables.status` without `isModuleEnabled('tables')`                                    | Soft-gate table UPDATEs                                  |
| 6   | Void × cancel restock              | Cancel restore loops restore `voided` + `void_adjustment` → over-restore (10→8→12)                   | Skip those statuses; expect stock **8**                  |
| 7   | Stock-reject HTTP                  | `assertStockAvailable` throws plain `Error` → orders catch → **500**                                 | Throw `InventoryServiceError(400, …)`                    |

---

## 5. Design detail

### 5.1 Notification isolation (`main/services/kds.ts`)

```
notifyKdsUpdate / notifyOrderUpdated
        ↓
if (!isModuleEnabled('kds')) return;   // NEW — process vertical
        ↓
queueMicrotask → broadcastOrderUpdate
        ↓
if (!isKdsEnabled()) …                 // EXISTING — settings flag
```

- Do **not** rely on call-site-only gating (call-site gates in `orders.ts` / paid bill paths may remain as defense-in-depth).
- `notifyOrderUpdated` remains a thin alias; both entry points must be safe no-ops when `kds` is disabled for the committed vertical.
- Preserve restaurant behavior when `kds` is enabled (default restaurant vertical).

### 5.2 `order-items.ts`

`PATCH` item status calls bare `notifyKdsUpdate()` and mounts under module **`order`** (retail keeps the route). Remount alone is insufficient.

- Wrap notify (or rely on internal gate after 5.1; still assert module awareness in tests / optionally keep explicit `if (isModuleEnabled('kds'))`).
- Prefer internal gate as the source of truth so this path is covered automatically.

### 5.3 Held-orders `tables` gate (`main/routes/held-orders.ts`)

- Wrap `UPDATE tables SET status = …` on hold (POST) and clear (DELETE) with `isModuleEnabled('tables')`.
- Keep `/api/held-orders` mounted under **`order`** — no remount redesign.
- Restaurant + tables ON → identical UX (table status still updates).

### 5.4 Void × cancel (`main/routes/orders.ts`)

Two restore loops must skip `item.status === 'voided' || item.status === 'void_adjustment'` before `restoreTrackedStock`:

1. `PATCH /:id/status` → `case 'cancelled'`
2. Last-item cancel collapse (`reason: 'all_items_cancelled'`)

Pinned expectation (was characterization of the bug):

> After sale 10→8, void (stock stays 8), then full cancel → stock remains **8**, not **12**.

### 5.5 Stock reject → 400 (`main/services/inventory.ts`)

- Change `assertStockAvailable` to throw `new InventoryServiceError(400, \`Insufficient stock for ${product.name}\`)`.
- Fix the stale comment that claims plain `Error` maps to 400 (today `statusCode || 500` → 500).
- Order create / add-items catch already uses `error.statusCode || 500` — no route redesign required.

---

## 6. Explicit non-goals

Do **not**:

- Introduce AsyncLocalStorage / `req.verticalId` / per-request vertical
- Introduce runtime vertical switching or SaaS / multi-tenancy
- Change schema / `PRAGMA user_version` (stays **v75**)
- Rename verticals or change production default (`restaurant`)
- Redesign vertical architecture, remount matrix, or queue/outbox
- POS page mega-extract, full i18n unification, OTel exporter
- Phase 3.5 work (Inventory UI, legacy tax columns, packages, recipes/BOM, …)

If a fix requires architectural redesign → **STOP and report**; do not redesign under Phase 3.4.

---

## 7. Tests (acceptance)

| Area               | Coverage                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notify / isolation | Source/contract: `kds.ts` gates with `isModuleEnabled('kds')`; restaurant-isolation updated for alias safety; module-off → no KDS broadcast side effect |
| Vertical config    | Existing fail-closed tests for missing/invalid `ACTIVE_VERTICAL_ID` remain green                                                                        |
| Retail             | `production-retail` / `synthetic-retail-sale` remain intact                                                                                             |
| Held-orders        | Table status unchanged when `tables` disabled; restaurant+tables ON unchanged                                                                           |
| Void × cancel      | `order-void-cancel-stock.test.ts` expects stock **8** (flip from pinned 12)                                                                             |
| Stock HTTP         | Oversell asserts `status === 400` (not merely `>= 400`)                                                                                                 |

---

## 8. Validation commands (post-implementation)

```bash
npm run test:restaurant-isolation
npm run test:order-boundary
npm run test:held-orders
npm run test:inventory-boundary
npm run test:synthetic-retail
npm run test:production-retail
npm run lint
npm run build
```

Broader: `npm test` when crossing several subsystems or before release.

---

## 9. Doc conflicts / clarifications

| Source                                           | Statement                                          | Resolution for 3.4                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closeout §3.4                                    | Lists four items + optional restart/userdata proof | Scope **B** expands to seven areas (isolation brief + three closeout soft-gate/stock residuals). Optional restart/userdata proof remains **optional / out of required acceptance** unless separately tasked |
| Isolation brief (items 1–4)                      | Sounds like ALS / captured vertical                | Interpreted as soft-gate hardening against **committed** vertical (this document)                                                                                                                           |
| `inventory.ts` comment on `assertStockAvailable` | Claims Error → 400                                 | **Incorrect today**; fixed as part of residual 7                                                                                                                                                            |
| `order-void-cancel-stock.test.ts` header         | “do NOT fix” / pin stock=12                        | Superseded by this phase — update test to correctness expectation                                                                                                                                           |
| `phase-3.3` §10                                  | Lists soft-gate residuals as deferred              | Point here; mark complete only after implementation + tests                                                                                                                                                 |

---

## 10. Verdict

**PHASE 3.4 COMPLETE (2026-08-14).** Soft-gate / correctness residuals closed without ALS or schema change. Implementation plan executed (Tasks 1–5). Next: Phase 3.5 optional depth, or pilot P0/P1.
