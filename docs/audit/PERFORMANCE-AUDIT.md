# Performance Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5

**Context:** single-node, local-first Electron POS; one restaurant's data volumes; better-sqlite3 synchronous-by-design (**correct** for this architecture). Severities are judged in that context, **not** web-scale.
**Labels:** **Measured** (verified in code) · **Strongly-inferred** (standard cost model, not benchmarked here) · **Potential** (needs profiling on real data).

> Verdict: **sound for a single-store POS.** The read paths that were historically N+1 (order list/detail, KDS feed, product list, recent-orders) have already been fixed to batched `IN(...)` queries, and index coverage on hot columns is strong. The remaining actionable issues are concentrated in **(a) three unconditional full-table scans on every cold start**, **(b) a full-state KDS re-broadcast with per-client re-auth on every kitchen event**, **(c) an unbatched per-table floor-view query**, and **(d) missing memoization on the two hottest interactive frontend pages**. Nothing rises to "critical" at single-store scale.

---

## 1. Priority summary

| #       | Finding                                                                                              | Severity          | Category         | Confidence                    |
| ------- | ---------------------------------------------------------------------------------------------------- | ----------------- | ---------------- | ----------------------------- |
| 4.1     | Three full-table scans every cold start (integrity_check, repairSequences, autoRepairPaymentDetails) | **Medium**        | Startup          | Measured / Strongly-inferred  |
| 5.1     | KDS full-state re-broadcast + per-client JWT re-auth on every event                                  | **Medium**        | WebSocket        | Measured / Strongly-inferred  |
| 6.1     | Orders page: full refetch per WS msg + 10s poll + 30s tick re-renders unmemoized cards               | **Medium**        | Frontend         | Measured / Strongly-inferred  |
| 6.2     | ProductGrid per-render filter + O(products×cart) + whole-cart subscription                           | **Medium**        | Frontend         | Strongly-inferred             |
| 7.1     | `npm ci` on every dev launch                                                                         | Medium (dev only) | Build            | Measured                      |
| 1.1     | Floor view N+1 (`activeOrderForTable` per table)                                                     | Medium-Low        | N+1              | Measured                      |
| 4.2     | macOS printer detection `execFileSync` ×3 per printer                                                | Low-Medium        | Blocking         | Measured / Strongly-inferred  |
| 6.3     | settings/page.tsx one 6.3k-line component (lazy tabs mitigate)                                       | Medium (polish)   | Frontend         | Measured / Strongly-inferred  |
| 5.2     | O(items×orders) `.find()` in KDS snapshot builder                                                    | Low               | Algorithmic      | Measured                      |
| 1.2/1.3 | categories children / payment-methods / day-close per-row loops                                      | Low               | N+1              | Measured                      |
| 2.1     | `/reports/insights` JS timezone bucketing over all window rows                                       | Low               | JS aggregation   | Strongly-inferred / Potential |
| 3.1/3.2 | Missing `order_items.status` / composite `orders(created_at,id)`                                     | Low               | Indexes          | Strongly-inferred             |
| 8.1/9.1 | PIN map no eviction / bills CSV export unbounded within range                                        | Low/Info          | Memory / Payload | Measured / Strongly-inferred  |

## 2. What's already correct (verified — do not "fix")

- **Hot read paths are batched.** `GET /orders` and `/orders/:id` use `batchHydrateOrders` → ~6 `IN(...)` queries (comment records the measured "~300+ queries per poll → ~6", `list.ts:185-186`). KDS feed batches items + one `attachEffectiveAddons` IN-query per broadcast. `/reports/recentOrders` and `/products` batch relations; `/products` excludes image blobs and computes `has_image` in SQL.
- **Reports aggregate in SQL** (`GROUP BY`/`SUM`/`COUNT`) and use **half-open UTC date ranges** (`created_at >= ? AND created_at < ?`) so they hit `idx_orders_created`/`idx_bills_created_at` instead of wrapping the column. Payment breakdown expands JSON via `json_each` in SQL, not in JS.
- **Index coverage on hot columns is very good** (orders status/created_at/user_id/customer_id/table_id/type/shift_id; order_items order_id/product_id; bills order_id/created_at/(payment_status,paid_at)/customer_id; loyalty_ledger composites; audit_logs created_at/entity/actor/action).
- **Pagination is the norm** — `/orders` cursor pagination (default 50, cap 500, #208 fixed the old unbounded default); customers paginated; reports server-capped (≤100). `/products`, `/tables`, `/staff` return full sets **by design** on inherently small/needed data.
- **WebSocket basics are right** — single KDS WS, broadcasts coalesced in a microtask, 30 s heartbeat `unref()`'d, slow-client backpressure cutoff (`bufferedAmount > 1 MB`), client Map capped at 100.
- **Real printing is async** (`printViaCups`/Windows raw path use `execFileAsync`); no memory leaks or unbounded in-memory growth found (KDS map capped, print queue DB-backed, audit logs DB-backed + paginated, timers cleared on stop).

## 3. Findings (detail)

### 3.1 Three unconditional full-table scans on every cold start (Medium)

- **Location:** `db.ts:651-653` (entry `index.ts:724`): `runStartupIntegrityCheck()` → `PRAGMA integrity_check` (reads **every page** of the DB) + `foreign_key_check`; `repairSequences()` → `SELECT order_number FROM orders WHERE order_number IS NOT NULL` (`:862-864`) and the same for all bills (`:901`), regex-parsing every row **with no date bound**; `autoRepairPaymentDetails()` → `SELECT ... FROM bills WHERE payment_details IS NOT NULL` (`:929-933`) + `JSON.parse` per bill every boot (writes only if malformed).
- **Why it matters:** all three grow with lifetime data. On an established store's multi-hundred-MB DB, `integrity_check` alone can add seconds to **every** cold start; `repairSequences`/`autoRepairPaymentDetails` are legacy one-time repairs (v10 sequence bug; a specific payment_details corruption) that re-scan full history forever though they only ever need today's max / malformed rows.
- **Recommendation:** gate `repairSequences`/`autoRepairPaymentDetails` behind a one-time completion flag (settings row / schema version) or bound them to a recent window; consider running full `integrity_check` on a schedule / after unclean shutdown while keeping cheap `quick_check`+`foreign_key_check` per boot. **Note:** `integrity_check` is a deliberate fail-closed safety trade-off (latches `corrupt_database`) — confirm cadence change with product owners.
- **Confidence:** Measured (repairs) / Strongly-inferred (integrity_check cost).

### 3.2 KDS full-state re-broadcast + per-client re-auth on every kitchen event (Medium)

- **Location:** `services/kds.ts:785-811` (`broadcastOrderUpdate`) → per client: `isKdsClientAuthorized` (`:104-154`: `jwt.verify` + `getUserAuthStatus` + `users` query + `getUserKdsStationIds` + `getKdsStationCategoryIds` + `hasUserKdsStationAssignments`) then `sendActiveOrders` (re-runs active-orders + items + addons + counts and serializes the **entire board** as `initial_data` — full state, not a delta) + a per-client `getExpiredVoidMarker()` COUNT.
- **Why it matters:** bounded by (few screens) × (active orders during a rush) — hence Medium not High — but every single item bump does, per screen, a JWT verify + ~4 auth queries + a full board re-query + full JSON serialize on the one synchronous event loop.
- **Recommendation:** (a) cache/throttle per-client re-auth (re-verify every N seconds via the existing heartbeat, not on every broadcast); (b) longer term send per-order/item **deltas** instead of full snapshots on incremental changes.
- **Confidence:** Measured (call structure) / Strongly-inferred (impact scaling).

### 3.3 O(items × orders) `.find()` in the KDS snapshot builder (Low)

- **Location:** `services/kds.ts:655-676` — inside `allVisibleItems.flatMap(...).filter(...)`, each item calls `(orders as any[]).find(o => o.id === i.order_id)` up to three times. **Recommendation:** build an `ordersById` Map once. Compounds with 3.2. **Confidence:** Measured.

### 3.4 Floor/tables view N+1 (Medium-Low)

- **Location:** `routes/tables.ts:92` → `rows.map(t => tableShape(t, activeOrderForTable(db, t.id)))`; `services/tables.ts:31-53` runs `SELECT * FROM orders WHERE table_id=? AND <active> ... LIMIT 1` per table + a second `customers` query when the order has a customer.
- **Why it matters:** the floor view is frequently refreshed; 20–80 tables = 20–160 synchronous executions per load, each blocking the event loop. Individually indexed and fast, but it's the one list endpoint still N+1 while `/orders` was explicitly de-N+1'd.
- **Recommendation:** batch like `batchHydrateOrders` — one `WHERE table_id IN (...) AND <active>` grouped by table_id + one customers IN-query. **Confidence:** Measured.

### 3.5 macOS printer detection uses synchronous `execFileSync` ×3 per printer (Low-Medium)

- **Location:** `printers/thermal.ts:181-192` loops printers calling `getMacOSPrinterDetails` (`lpoptions`, `:239`), `isMacOSDefaultPrinter` (`lpstat -d`, `:310`), `getMacOSPrinterStatus` (`lpstat -p`, `:222`) — 3 blocking subprocess spawns per printer, sequentially, on the single event loop.
- **Why it matters:** only on the printer-detection/settings path (not per order) and typically 1–3 printers, so bounded — but avoidable head-of-line blocking (up to ~1 s stall of all concurrent API/WS).
- **Recommendation:** use the async `execFileAsync` already used elsewhere in the same file and parallelize per-printer probes. **Confidence:** Measured / Strongly-inferred.

### 3.6 Frontend: orders page refetch/poll/tick + unmemoized cards (Medium)

- **Location:** `frontend/src/app/(dashboard)/orders/page.tsx:263-272` (WS `onmessage` → full `fetchOrders()`), `:243` (`setInterval(fetchOrders, 10000)` always on), `:207-210` (`setInterval(setNow, 30000)`), list map `:1147`; `OrderCard` (583 lines) **not** memoized; `filteredOrders` recomputed every render (no `useMemo`); ~11 inline arrow-props per card.
- **Why it matters:** bounded at 50 orders (server cap) so tolerable, but a 583-line card × up to 50 × frequent triggers (every kitchen broadcast, every 10 s, every 30 s clock tick) is the biggest render cost on the page.
- **Recommendation:** `memo` `OrderCard`, `useMemo` `filteredOrders`, `useCallback` handlers; apply WS payloads to state directly (server already sends `orders`) instead of refetching; move relative-time into a memoized `<TimeAgo>`; relax the poll to ~30 s or gate it to WS-disconnected. **Confidence:** Measured / Strongly-inferred.

### 3.7 Frontend: ProductGrid per-render filter + O(products×cart) + whole-cart subscription (Medium)

- **Location:** `frontend/src/components/pos/ProductGrid.tsx:168` (not memoized), `:180` (`useCartStore()` subscribes to the entire cart), `:185` (`products.filter(...)` every render), `:279-282` (per product `cart.items.filter(...).reduce(...)`).
- **Why it matters:** POS taps are the most latency-sensitive interaction; subscribing to the whole cart means every add/qty change re-renders the grid, re-filters, and recomputes in-cart quantity for **every** product via nested filter+reduce.
- **Recommendation:** `useMemo` the filtered list; precompute a `Map<productId, qty>` from the cart once; select only needed cart slices; `memo` the product card. Virtualize only if catalogs exceed a few hundred items. **Confidence:** Strongly-inferred / Potential (virtualization threshold depends on real catalog size).

### 3.8 Frontend: settings/page.tsx one ~6.3k-line component (Medium, polish — mitigated)

- **Location:** `settings/page.tsx:313-6654`; 18 `<TabsContent>` panels; Radix Tabs **without** `forceMount`, so inactive tabs are **unmounted** (not all live at once) — this limits blast radius. 111 `useState` + 8 `useEffect`, 0 memoization; no polling/WS.
- **Why it matters:** residual cost is that every field edit re-renders the whole active-tab subtree with no memoization. **Recommendation:** extract each `TabsContent` into its own `memo`'d component (also the top maintainability item — see CODE-QUALITY-AUDIT). Not urgent for a single operator. **Confidence:** Measured / Strongly-inferred.

### 3.9 `npm ci` on every `npm run dev` (Medium, dev experience only)

- **Location:** `package.json:19` (`"build:frontend": "cd frontend && npm ci && ..."`) invoked by `:12` (`"dev"`). `npm ci` deletes `node_modules` and reinstalls from lockfile every dev launch — tens of seconds to minutes per iteration for a byte-identical tree. Runtime-neutral. **Recommendation:** use `npm install` (idempotent) for dev; keep `npm ci` in release/`build:*` scripts for reproducibility. **Confidence:** Measured.

### 3.10 Lower-severity items

- **`/reports/insights`** loads all order timestamps in the window into JS for IANA-timezone bucketing (SQLite has no IANA tz) — deliberate and correct; bounded by the window (default 30 d, max 365). Acceptable; only a **Potential** concern at the 365-day extreme on an established store. (`reports.ts:923-929,174-202,849`.)
- **Category list** fetches children per top-level category (`categories.ts:34-37`) — textbook N+1 but on a bounded 10–30 set; negligible. Same for payment-methods usage and day-close per-shift loops (tiny sets).
- **Missing indexes** `order_items.status` and composite `orders(created_at,id)` — both Low; existing indexes already serve the real query shapes; not worth a migration alone.
- **PIN rate-limit map** (`orders-shared.ts:131`) has no periodic eviction — effectively bounded (distinct users/terminals), not a practical leak.
- **Bills CSV export** is date-ranged but builds one string in memory — acceptable for user-initiated export; stream if very large exports appear.
- **Disk (not memory):** `audit_logs` grows unboundedly over time — indexed, not a perf defect today, but worth an eventual retention/rotation policy.

## 4. Verdict

The architecture is performance-appropriate for its target: synchronous SQLite is the right call, hot read paths are already batched, and indexes cover the hot columns. The highest-value work — none an emergency at one restaurant's scale — is: trim the per-cold-start full scans (3.1), make the KDS broadcast cheaper per event (3.2/3.3), fix the floor-view N+1 (3.4), and add memoization to the orders page and ProductGrid (3.6/3.7). All performance claims above are labeled by confidence; items marked _Potential_ require profiling on real store data to confirm.
