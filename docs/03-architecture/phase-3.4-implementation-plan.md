# Phase 3.4 Correctness Residuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 3.4 isolation/correctness residuals (KDS notify soft-gates, held-orders tables gate, void×cancel restock, stock-reject HTTP 400) without redesigning vertical architecture.

**Architecture:** Process-locked vertical (`lockedActiveVerticalId`) stays authoritative. Soft-gates via `isModuleEnabled` provide defense-in-depth on Core-mounted routes. No AsyncLocalStorage, no `req.verticalId`, no schema change.

**Tech Stack:** Electron main / Express (`main/`), better-sqlite3, existing module registry (`main/modules/`), electron-node test harness (`tests/run-electron-node-test.cjs`).

**Spec:** [docs/03-architecture/phase-3.4-correctness-residuals.md](phase-3.4-correctness-residuals.md)

## Global Constraints

- Schema remains **v75** — no migrations
- No runtime vertical switching; no SaaS / multi-tenant redesign
- Do **not** introduce AsyncLocalStorage or `req.verticalId`
- Do **not** remount `/api/held-orders` off `order`
- Prefer smallest safe change; preserve restaurant UX when modules are ON
- Preserve API contracts except intentional stock oversell **500 → 400**
- TDD: failing test first, then minimal implementation
- Do not commit unless the user explicitly asks

---

## File map

| File                                                                 | Role                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `main/services/kds.ts`                                               | Internal `isModuleEnabled('kds')` gate on `notifyKdsUpdate` / `notifyOrderUpdated` |
| `main/routes/order-items.ts`                                         | Covered by internal gate; optional explicit gate for clarity                       |
| `main/routes/held-orders.ts`                                         | Soft-gate `tables.status` UPDATEs                                                  |
| `main/routes/orders.ts`                                              | Filter voided / void_adjustment from cancel restore loops                          |
| `main/services/inventory.ts`                                         | `assertStockAvailable` → `InventoryServiceError(400, …)`                           |
| `tests/restaurant-isolation.test.ts`                                 | Assert `kds.ts` module gate; held-orders / alias coverage                          |
| `tests/order-void-cancel-stock.test.ts`                              | Expect stock **8** after void×cancel                                               |
| `tests/inventory-boundary.test.ts`                                   | Oversell `=== 400`                                                                 |
| `tests/synthetic-retail-sale.test.ts`                                | Oversell `=== 400`                                                                 |
| `tests/production-retail.test.ts`                                    | Oversell `=== 400`                                                                 |
| `tests/held-orders.test.ts`                                          | Tables gate behavior when tables disabled                                          |
| `.ai/context.md`, `.ai/tasks.md`, `.ai/decisions.md`, `.ai/risks.md` | Mark 3.4 complete only after green validation                                      |

---

### Task 1: Gate KDS notify inside `kds.ts` (TDD)

**Files:**

- Modify: `main/services/kds.ts` (`notifyKdsUpdate`, `notifyOrderUpdated`)
- Modify: `tests/restaurant-isolation.test.ts`
- Test: `npm run test:restaurant-isolation`

**Interfaces:**

- Consumes: `isModuleEnabled('kds')` from `../modules` (or `../modules/registry`)
- Produces: `notifyKdsUpdate(): void` and `notifyOrderUpdated(): void` are no-ops when `kds` module is disabled for the committed vertical; existing `isKdsEnabled()` settings guard inside `broadcastOrderUpdate` unchanged

- [ ] **Step 1: Write the failing source-contract assertions**

In `tests/restaurant-isolation.test.ts`, add a section that reads `main/services/kds.ts` and asserts:

```javascript
const kdsSrc = fs.readFileSync(path.join(__dirname, '../main/services/kds.ts'), 'utf8');
assert(
  /isModuleEnabled\(\s*['"]kds['"]\s*\)/.test(kdsSrc),
  "kds.ts soft-gates notify with isModuleEnabled('kds')",
);
assert(
  /export function notifyKdsUpdate\(/.test(kdsSrc) &&
    /export function notifyOrderUpdated\(/.test(kdsSrc),
  'notifyKdsUpdate and notifyOrderUpdated remain exported',
);
```

Also assert `held-orders.ts` will be gated in Task 2 (or add held-orders assertion in Task 2 only — prefer Task 2).

Keep existing `orders.ts` call-site gate checks (defense-in-depth still valid).

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:restaurant-isolation
```

Expected: FAIL — `kds.ts soft-gates notify with isModuleEnabled('kds')` (or equivalent).

- [ ] **Step 3: Minimal implementation in `kds.ts`**

Near top of `main/services/kds.ts`, ensure import:

```typescript
import { isModuleEnabled } from '../modules';
```

(or from the path already used by peer files — match existing import style).

Change:

```typescript
export function notifyKdsUpdate(): void {
  if (!isModuleEnabled('kds')) return;
  if (broadcastQueued) return;
  broadcastQueued = true;
  queueMicrotask(() => {
    broadcastQueued = false;
    broadcastOrderUpdate();
  });
}

export function notifyOrderUpdated(): void {
  notifyKdsUpdate();
}
```

Do **not** remove `isKdsEnabled()` from `broadcastOrderUpdate`.

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:restaurant-isolation
```

Expected: PASS.

- [ ] **Step 5: Commit only if user asked**

Skip unless explicitly requested.

---

### Task 2: Held-orders `tables` soft-gate (TDD)

**Files:**

- Modify: `main/routes/held-orders.ts` (POST `/` ~L160; DELETE `/:tableId` ~L180)
- Modify: `tests/held-orders.test.ts` and/or `tests/restaurant-isolation.test.ts`
- Test: `npm run test:held-orders` and `npm run test:restaurant-isolation`

**Interfaces:**

- Consumes: `isModuleEnabled('tables')` from `../modules`
- Produces: `tables.status` UPDATEs only when tables module enabled; held_orders row CRUD unchanged

- [ ] **Step 1: Write failing tests**

Source contract in `restaurant-isolation.test.ts` (or held-orders suite):

```javascript
const heldSrc = fs.readFileSync(path.join(__dirname, '../main/routes/held-orders.ts'), 'utf8');
assert(
  /isModuleEnabled\(\s*['"]tables['"]\s*\)/.test(heldSrc),
  "held-orders.ts soft-gates tables with isModuleEnabled('tables')",
);
```

Behavioral (preferred in `held-orders.test.ts` if helpers allow module override): when tables module is disabled for the composition under test, POST hold must not require / must not change `tables.status` if a table row exists; when restaurant vertical (tables ON), hold still sets status to held. Match existing test patterns in `order-restaurant-isolation.test.ts` for module-off simulation if available; otherwise source contract + restaurant path green is minimum for this task, with behavioral module-off covered if the harness already supports `registerRoutes(app, { verticalId: 'retail' })` / retail-test.

- [ ] **Step 2: Run tests — expect FAIL on source contract**

```bash
npm run test:restaurant-isolation
```

- [ ] **Step 3: Minimal implementation**

In `main/routes/held-orders.ts`:

```typescript
import { isModuleEnabled } from '../modules';
```

Wrap both table UPDATEs:

```typescript
if (isModuleEnabled('tables')) {
  db.prepare('UPDATE tables SET status = ?, updated_at = ? WHERE id = ?').run(
    TABLE_STATUS_HELD,
    now(),
    tableId,
  );
}
```

and:

```typescript
if (isModuleEnabled('tables')) {
  db.prepare('UPDATE tables SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(
    TABLE_STATUS_AVAILABLE,
    now(),
    tableId,
    TABLE_STATUS_HELD,
  );
}
```

Do not change mount registration in `main/routes/index.ts`.

- [ ] **Step 4: Re-run**

```bash
npm run test:held-orders
npm run test:restaurant-isolation
```

Expected: PASS. Restaurant hold/clear with tables ON unchanged.

- [ ] **Step 5: Commit only if user asked**

---

### Task 3: Void × cancel restock correctness (TDD)

**Files:**

- Modify: `tests/order-void-cancel-stock.test.ts` (flip pin 12 → 8; rewrite header)
- Modify: `main/routes/orders.ts` (~L1228–1236 and ~L2200–2208)
- Optionally: clear deferred note in `main/services/order.ts`
- Test: `npm run test:order-boundary`

**Interfaces:**

- Consumes: `restoreTrackedStock` unchanged
- Produces: cancel restore skips `voided` and `void_adjustment` lines

- [ ] **Step 1: Update the pinned test to the correct expectation (RED)**

Rewrite header to Phase 3.4 correctness (remove “do NOT fix”).

Change final assertion:

```javascript
assertEqual(
  stock.stock_quantity,
  8,
  'after void×cancel: stock stays 8 (voided/void_adjustment not restored)',
);
```

Update log strings accordingly.

- [ ] **Step 2: Run — expect FAIL**

```bash
node tests/run-electron-node-test.cjs tests/order-void-cancel-stock.test.ts
```

Expected: FAIL — actual 12 vs expected 8.

- [ ] **Step 3: Minimal filter in both restore loops**

```typescript
for (const item of items) {
  if (item.status === 'voided' || item.status === 'void_adjustment') continue;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
  restoreTrackedStock(db, product, item.quantity, nowStr, {
    referenceType: 'order',
    referenceId: req.params.id as string,
    reason: 'order_cancelled',
  });
}
```

Apply the same skip in the last-item collapse loop (`allItems`).

Do not change the void path (already correctly does not restock).

- [ ] **Step 4: Run full order-boundary suite**

```bash
npm run test:order-boundary
```

Expected: PASS (`order-boundary.test.ts` non-void cancel still restores to opening; void×cancel expects 8).

- [ ] **Step 5: Commit only if user asked**

---

### Task 4: Stock-reject → HTTP 400 (TDD)

**Files:**

- Modify: `tests/inventory-boundary.test.ts` (~L84)
- Modify: `tests/synthetic-retail-sale.test.ts` (oversell assert)
- Modify: `tests/production-retail.test.ts` (oversell assert)
- Modify: `main/services/inventory.ts` (`assertStockAvailable`)
- Test: `npm run test:inventory-boundary`, `npm run test:synthetic-retail`

**Interfaces:**

- Consumes: existing `InventoryServiceError`
- Produces: `assertStockAvailable` throws `InventoryServiceError` with `statusCode === 400` and message `Insufficient stock for ${product.name}`

- [ ] **Step 1: Tighten assertions to `=== 400` (RED)**

Replace `assert(failRes.status >= 400, …)` with:

```javascript
assertEqual(failRes.status, 400, 'insufficient stock returns HTTP 400');
```

in:

- `tests/inventory-boundary.test.ts`
- `tests/synthetic-retail-sale.test.ts` (oversell case)
- `tests/production-retail.test.ts` (oversell case)

- [ ] **Step 2: Run — expect FAIL (likely 500)**

```bash
npm run test:inventory-boundary
```

Expected: FAIL — status 500 vs 400.

- [ ] **Step 3: Minimal implementation**

```typescript
/**
 * Reject oversell for tracked products.
 * Throws InventoryServiceError(400) so order-route catch (`statusCode || 500`) returns HTTP 400.
 */
export function assertStockAvailable(product: StockTrackedProduct, quantity: number): void {
  if (isTracking(product) && Number(product.stock_quantity ?? 0) < quantity) {
    throw new InventoryServiceError(400, `Insufficient stock for ${product.name}`);
  }
}
```

Remove/replace the stale comment claiming plain `Error` → 400.

- [ ] **Step 4: Re-run**

```bash
npm run test:inventory-boundary
npm run test:synthetic-retail
```

Expected: PASS.

- [ ] **Step 5: Commit only if user asked**

---

### Task 5: Docs + `.ai` memory + final validation

**Files:**

- Modify: `docs/03-architecture/phase-3.4-correctness-residuals.md` — Decision → **PHASE 3.4 COMPLETE** after green
- Modify: `docs/03-architecture/phase-3.3-production-retail.md` §10 — mark residuals closed / link 3.4
- Modify: `docs/03-architecture/phase-2-closeout-and-phase-3-gate.md` §3.4 — link implemented doc
- Modify: `docs/modules/README.md` — add Phase 3.4 done entry
- Modify: `.ai/context.md`, `.ai/tasks.md`, `.ai/decisions.md`, `.ai/patterns.md`, `.ai/risks.md`

- [ ] **Step 1: Run focused validation matrix**

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

Expected: all PASS / exit 0.

- [ ] **Step 2: Update architecture + `.ai` to COMPLETE**

Only after Step 1 is green. Record ADR-style entry in `.ai/decisions.md`. Clear Phase 3.4 residual bullets from `.ai/risks.md` (or mark closed). Next step → Phase 3.5 optional or pilot P0.

- [ ] **Step 3: Optional broader suite**

```bash
npm test
```

When requested or before release.

- [ ] **Step 4: Commit only if user asked**

---

## Acceptance criteria (Definition of Done)

| Criterion                                                            | Evidence                                           |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| `notifyKdsUpdate` / `notifyOrderUpdated` no-op when `kds` module off | `kds.ts` + restaurant-isolation                    |
| `order-items` status notify safe under retail / kds off              | Internal gate covers path                          |
| Held-orders does not write `tables.status` when tables off           | held-orders + isolation source contract            |
| Void × cancel leaves stock at 8                                      | `order-void-cancel-stock.test.ts`                  |
| Oversell returns HTTP 400                                            | inventory-boundary + retail suites                 |
| No ALS / schema / remount redesign                                   | Diff review                                        |
| Restaurant default behavior preserved                                | isolation + held-orders + order-boundary green     |
| Retail sale path intact                                              | `test:synthetic-retail` / `test:production-retail` |

---

## Spec coverage checklist (self-review)

| Spec requirement                                   | Task                               |
| -------------------------------------------------- | ---------------------------------- |
| Gate notify inside `kds.ts`; keep settings guard   | Task 1                             |
| order-items covered (internal gate)                | Task 1                             |
| Document no ALS; process lock unchanged            | Spec doc + Task 5                  |
| Held-orders tables gate; keep order mount          | Task 2                             |
| Void×cancel skip voided / void_adjustment; stock 8 | Task 3                             |
| `InventoryServiceError(400)` + assert `=== 400`    | Task 4                             |
| Non-goals honored                                  | Global Constraints + Task 5 review |
| Validation commands                                | Task 5                             |

**Ambiguity resolved in spec:** optional restart/userdata proof from closeout is **not** required for Phase 3.4 DoD unless separately tasked.

**Plan ready for implementation:** Yes — after user reviews this plan and the architecture doc.
