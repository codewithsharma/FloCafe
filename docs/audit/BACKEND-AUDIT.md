# Backend Audit — OPERAVIA (FloCafe)

**Date:** 2026-08-21 · **Version:** 3.0.5 · Scope: `main/` — Express API, services, middleware, validation, WebSocket

> Verdict: **the backend is the strongest part of the system.** The money path is engineered like a ledger — transactional, idempotent, immutable-snapshot-based, and actor-authoritative. The weaknesses are consistency-level (logging bypass, `asyncHandler` under-adoption, order write-logic living in routes rather than services) and a few cross-server asymmetries, not correctness defects on the critical path.

---

## 1. API surface & composition

- **~50 route modules** under `main/routes/`, mounted by `registerRoutes` (`routes/index.ts:86`) through the **fail-closed vertical/module composition** system: `assertFailClosedComposition` runs first, then `mount(prefix, router, moduleId)` skips any router whose module isn't enabled for `ACTIVE_VERTICAL_ID`. Disabled surfaces return 404, not 500 — a clean boundary.
- Express **5.2**, Node **≥22.12**. The renderer is served from the same process over `http://localhost` (see ARCHITECTURE-AUDIT).
- **Three listeners** (`server.ts` 3001, `kds-server.ts` 3002, `server-app.ts` 3003) — see §6.

## 2. The money path (Confirmed strength)

`create order → add items → discount → generate bill → split → settle payment → refund → day-close`. Evidence from `main/routes/orders/*`, `main/routes/bills.ts`, `main/services/{tax,refund,shift,day-close,inventory,recipe}.ts`:

- **Transactional integrity:** every multi-write path is wrapped in `withTxn()`. Stock decrement + append-only `inventory_movements` ledger + money writes + idempotency records commit together.
- **Idempotency is pervasive and enforced:** `order_idempotency`, `payment_idempotency` (+ `payment_transaction_refs`), `refund_idempotency`, `purchase_receive_idempotency`. Payment endpoints **require** an `Idempotency-Key` header; key reuse with a different request body returns **409** (guarded by a stored request-hash comparison). Verified by `issue-214-payment-integrity` (per-user key replay) and `integration-refunds` (overlapping refunds via `Promise.all` → over-refund blocked).
- **Immutable financial evidence:** a frozen `EngineTaxSnapshot` is stored on order_items/orders/bills; `day_closes.summary_json` is frozen; the inventory ledger is append-only. Historical receipts do not change when catalog/tax config later changes.
- **Actor integrity:** the order actor is always `authUser.userId`, never client-supplied (`orders/create.ts:113` — closes a documented spoofing bug). Client-supplied item discount amounts are ignored server-side (`create.ts:253`).
- **Money representation:** integer cents + `decimal.js` (precision 40, ROUND_HALF_UP), dual-column (`_cents`) — consistent across the path. Detailed in DATABASE-AUDIT.

This is bank-grade discipline for a single-store POS and is well-tested on the backend (see TESTING-AUDIT §2).

## 3. Domain services

`main/services/*` (~49) hold the reusable business logic and are the correct unit of reuse:

- **Tax engine** (`services/tax-engine.ts` + `main/tax/`): signed, versioned CountryPacks (Ed25519 + sha256), a 24-check validation battery, compound/inclusive tax, largest-remainder rounding, and a frozen snapshot. 95%+ line coverage in the 4-file c8 scope. A CI invariant job always runs the "no category → no tax" test.
- **Refund/void/cancel** (`services/refund.ts`): over-refund prevention (tested under concurrency), inventory implications on void/cancel.
- **Shift / day-close** (`services/shift.ts`, `day-close.ts`): cash-only Z-report, reconciliation (the 1,620-line `shift-reconciliation` test).
- **Inventory / recipe costing** (`services/inventory.ts`, `recipe*.ts`): dual stock representation, append-only movement ledger, recipe consumption on sale.

**Known domain risks** (from the domain-services review; carried into RISK-REGISTER): card refunds have no gateway reversal (out of scope — Frozen), cashback isn't clawed back on refund, split-check rounding can diverge, catalog cost can be overwritten per receipt, refund idempotency shares a namespace, PIN rate-limiting is in-memory per-process, and two discount code paths coexist. These are worth tracking but several are consistent with the declared Frozen-scope (no payment gateway).

## 4. Middleware & validation

- **Security middleware** (`main/middleware/security.ts`): helmet, CORS, rate limiting (login limiter with `bypassPrivateIp:false`), `requireRole`/`requireAuth` RBAC, token revocation (in-memory + persisted `revoked_tokens`). Detailed in SECURITY-AUDIT.
- **Observability** (`main/middleware/http-observability.ts`): the **only** importer of the pino logger; provides pino-http request logging.
- **Validation** (`main/middleware/validate.ts` + 19 `main/validation/` schemas): clean zod boundary, well-reused where adopted (orders schema imported by 7 sub-routes). **~26 routes use it; ~24 hand-roll `typeof` guards** — inputs are validated at boundaries, but in two inconsistent styles (see CODE-QUALITY-AUDIT §5).

## 5. Backend findings

### 5.1 Order write-logic lives in routes, not a service (Confirmed / architectural)

- **Issue:** the most valuable business logic — order creation, discount application, bill generation, settlement — lives in `main/routes/orders/*` and `main/routes/bills.ts` rather than in `main/services/order.ts` (which is thinner).
- **Severity:** Medium. **Why it matters:** the critical path sits in the HTTP layer, making it harder to unit-test in isolation (it's exercised via integration tests) and concentrating change-risk in route files. **Recommendation:** progressively extract an order-write service behind the existing routes (aligns with R4.1's intent for `orders.ts`). **Confidence:** High.

### 5.2 `asyncHandler` adopted in 1 of 51 route files (Confirmed / consistency)

- **Issue:** a purpose-built `asyncHandler` wrapper exists but only `whatsapp.ts` uses it; every other route hand-rolls try/catch (settings.ts 62, tax-packs.ts 44). Error-response key drifts (`error` vs `message`). **Severity:** Medium. **Recommendation:** adopt `asyncHandler` + one error shape; route domain errors through `main/errors.ts`. **Confidence:** High.

### 5.3 Logger bypass (Confirmed / consistency + latent redaction gap)

- **Issue:** 483 `console.*` in `main/` (261 in routes) bypass the redaction-configured pino logger. **Severity:** Medium (log quality + latent risk of logging sensitive fields since `console.*` skips redaction). **Recommendation:** codemod to `logger`, lint-ban `console` in routes/services. **Confidence:** High. (Full detail in CODE-QUALITY-AUDIT §3.)

### 5.4 SQL in both routes and services; no repository tier (Potential)

- **Issue:** `db.prepare()` appears inline in CRUD routes (`printers.ts` 39, `tax-packs.ts` 33, `addon-groups.ts`/`kitchen-stations.ts` with no service) as well as in services. **Severity:** Low–Medium. **Recommendation:** a light repository convention for CRUD domains; not urgent. **Confidence:** High.

### 5.5 Missing Express `Request` augmentation → 41 `as any` + duplicated actor helpers (Confirmed / consistency)

- **Issue:** `(req as any).user` is set in middleware without a typed augmentation, forcing ~41 casts and 10 copy-pasted actor helpers (`actorId`/`actorUserId`/`actorFrom`). **Severity:** Medium (low-risk, high-leverage fix). **Recommendation:** add `declare global { namespace Express { interface Request { user?: AuthUser } } }` and a single shared actor helper. **Confidence:** High.

## 6. Cross-server design (Confirmed / Medium)

- **Duplicated bootstrap:** static-serving, Windows path rewrite (`rewriteNextExportPath`), and the EADDRINUSE 10-port scan are copy-pasted across all three servers, with subtly different SPA fallbacks.
- **Security-middleware asymmetry:** only `server.ts` applies helmet/logging/compression/recovery-protection; `kds-server.ts` and `server-app.ts` rely on their own inline `requireAuth` (mitigated: neither starts in recovery mode; both enforce JWT).
- **Server App** (`server-app.ts`) is a thin auth-gated reverse proxy to `127.0.0.1:3001` (`forwardToMainApi`) for waiter tablets.
- **Recommendation:** extract shared `serveStaticExport()` / `listenWithPortScan()` / security-header factory into `main/lib`. **Confidence:** High. (Cross-referenced in ARCHITECTURE-AUDIT §7.2–7.3.)

## 7. WebSocket (Confirmed strength, server-side)

`setupKdsWebSocket` (`services/kds.ts`), shared by `server.ts` and `kds-server.ts` via `noServer:true` + manual upgrade handler on path `/kds`:

- JWT-authenticated, **5 s auth timeout**, caps (100 total / 25 unauthenticated).
- **30 s heartbeat re-authorizes every client** (`fresh:true` — re-verifies JWT + role chef/owner/manager + token freshness) and disconnects on role/permission change.
- **1 MB slow-client cutoff** (`bufferedAmount`).
- Broadcasts coalesced via `queueMicrotask` (`notifyKdsUpdate`), gated by `isModuleEnabled('kds')`.
- Status changes use **compare-and-swap** (`kitchen-status.ts` — `expectedStatus` mismatch → `STATUS_CONFLICT` 409), fully audit-logged.
- `sendActiveOrders` uses a single batched CTE query — **no N+1**.

The only realtime weakness is on the **client**: `orders/page.tsx` hand-rolls a second `/kds` socket + a 10 s poll instead of reusing `useKdsConnection` (see FRONTEND-AUDIT).

## 8. Peripherals & integrations (backend-side)

- **Printing** (`printers/thermal.ts`): ESC/POS, four transports (network 9100, CUPS `lp -o raw`, Windows RAW via embedded C#, WebUSB), a **durable print-job outbox** with bounded retry (`services/print-queue.ts`), and 502-with-print_job_id on failure. KOT printing is **manual** (no auto-print on order create) — a product expectation to verify. Non-ASCII lines outside a currency whitelist are silently dropped (correct for generic hardware, but non-Latin names vanish from receipts).
- **WhatsApp** (Baileys, `services/whatsapp.ts`): outbound receipts/notifications only (not ordering), with extensive anti-ban rate limiting. Baileys is a pre-release, unofficial client — a ToS/ban and dependency risk (see DEPENDENCY-AUDIT / RISK-REGISTER).
- **QR ordering** (`services/qr-ordering.ts`): pay-at-counter, per-table rotating tokens, synthetic guest user, public unauthenticated routes with zod token validation.
- **Cloud sync** (`services/cloud-sync.ts`): outbound-only, HMAC-signed, read-only remote-command whitelist, durable outbox. **Google Drive** backup: OAuth loopback, tokens encrypted via `safeStorage` (never in SQLite), reuses `createBackup()` so redaction isn't bypassed.

## 9. Verdict

**Backend: strong.** The critical path is correct, transactional, idempotent, and well-tested; the domain-service layer is clean where it's used. The actionable debt is consistency-level (logger, `asyncHandler`, Request augmentation, actor helper) and structural-consistency (order logic in routes, cross-server duplication) — all addressable incrementally without touching the money-path correctness that is the system's core strength.
