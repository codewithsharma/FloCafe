# P5 — Auto-86 from Stock (INV-AUTO-86) Implementation Report

**Date:** 2026-08-21  
**Feature ID:** INV-AUTO-86  
**Schema tip:** **v88** (`inv_auto_86_availability_flags`)  
**Baseline:** P1.1 `8111878` · P2 `b16f579` · P4 `cd2304f`  
**Status:** **Implemented / Hardening verified** (automated). Live pilot remains **NO-GO** (R16).

---

## 1. Feature Summary

Menu availability now derives from **manual 86** and **stock-driven auto-86**. Effective catalog flag remains `products.is_active`. Stock mutations through the existing inventory boundary recalculate auto-unavailable without flapping. Staff order APIs reject inactive products server-side (QR already did).

---

## 2. Existing Architecture

| Layer            | Reused                                                     |
| ---------------- | ---------------------------------------------------------- |
| Inventory SoT    | `main/services/inventory.ts` + `inventory_movements`       |
| Manual 86        | Phase 4.7 `POST /api/products/:id/availability`            |
| Recipes / BOM    | R5 `recipes` / `recipe_ingredients` / `recipe-consumption` |
| Catalog filter   | `GET /api/products?active=1`                               |
| QR digital order | `qr-ordering.ts` `is_active` filter + place-order reject   |

No parallel inventory or second availability subsystem was introduced.

---

## 3. Availability Model

| Flag                 | Meaning                                     |
| -------------------- | ------------------------------------------- |
| `manual_unavailable` | Intentional floor 86 (owner/manager)        |
| `auto_unavailable`   | Stock/recipe cannot support selling         |
| `is_active`          | **Effective cache** = `!(manual \|\| auto)` |

Single-location / global catalog only (multi-location remains Frozen).

---

## 4. Auto-86 Rules

1. **Tracked sellable SKU:** `auto_unavailable = 1` when `track_inventory = 1` and `stock_quantity <= 0`.
2. **Recipe-backed menu item:** `auto_unavailable = 1` when any tracked ingredient cannot cover **one portion** (`portionConsumeQty` vs on-hand).
3. **Untracked, no recipe:** never auto-86 from stock alone.
4. **Threshold:** sold-out uses **zero stock / insufficient for 1 portion** — not `low_stock_threshold` (that remains a warning badge).

---

## 5. Manual Override Semantics

| Manual | Stock | Effective            |
| ------ | ----- | -------------------- |
| Clear  | OK    | Available            |
| Clear  | Out   | Auto-86              |
| 86     | OK    | Manual 86            |
| 86     | Out   | Both flags; stays 86 |

- Stock restore **never** clears `manual_unavailable`.
- Manual restore clears manual only; **auto may keep the item inactive** (cannot bypass zero stock).

---

## 6. Inventory Integration

Central hook: `notifyStockChanged` after mutations in:

- `decrementTrackedStock` / `restoreTrackedStock`
- `applyAbsoluteStockChange` / `adjustProductStock`
- `applyRecipeStockDelta` / `applyPurchaseReceiptStock`
- `restockTrackedForRefund`

Also fans out to menu products whose active recipes consume the mutated ingredient.

---

## 7. Transaction / Concurrency Model

Availability writes occur **inside the same caller `withTxn`** as the stock UPDATE + ledger INSERT. Oversell remains blocked by `assertStockAvailable` (Policy B: negative stock not allowed on normal paths). Auto-86 does not replace stock integrity.

Anti-flap: transitions audit/write only when flags or effective `is_active` change.

---

## 8. POS Enforcement

`assertProductOrderable` on order create and add-items. Stale UI submitting an inactive product → **HTTP 400** `Product unavailable: {name}`.

---

## 9. KDS Integration

**No availability events.** KDS remains order/ticket oriented. P4 outbox unchanged. Documented non-goal for this slice.

---

## 10. Digital Ordering Integration

QR menu and place-order already filter/reject on `is_active`. Auto-86 updates that same flag → guests cannot newly order auto-86'd items.

---

## 11. Modifier Handling

**Out of scope for auto-86.** Addon `is_active` remains admin soft-delete only; no stock mapping for modifiers in this slice.

---

## 12. Database Changes

**Migration v88** `inv_auto_86_availability_flags`:

- `products.manual_unavailable INTEGER NOT NULL DEFAULT 0`
- `products.auto_unavailable INTEGER NOT NULL DEFAULT 0`
- Backfill: prior `is_active=0` → manual; tracked `stock<=0` (+ recipe ingredient zero) → auto; recompute `is_active`
- Partial index on `auto_unavailable`

Fresh `createSchema` includes the same columns.

---

## 13. API Changes

| Endpoint                              | Change                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `POST /api/products/:id/availability` | Sets/clears **manual** via `setManualAvailability`; refreshes auto; same RBAC |
| `GET /api/products`                   | Returns `manual_unavailable`, `auto_unavailable`                              |
| Order create / add-items              | Reject inactive products                                                      |

---

## 14. UI Changes

POS 86 restore strip shows an **auto** badge + hint when `auto_unavailable` is set (`eighty-six.ts` helpers + i18n en/es/pt). No inventory redesign.

---

## 15. Security / RBAC

Manual availability remains `requireRole('owner','manager')`. Auto transitions are system-driven from inventory paths (no new public API). Tenant boundary unchanged (single-store SQLite).

---

## 16. Audit Logging

`product.availability` with metadata:

`is_active`, `source` (`manual` \| `auto_stock`), `previous` / `next` flags, `stock_quantity`, `reason`.

---

## 17. Test Results

Suite: `npm run test:inv-auto-86` → **PASS** (unit + inventory hooks + recipe fan-out + POS reject/accept + manual API + FE source-scan).

---

## 18. Regression Results

| Suite                                                             | Result                                          |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| `npm run test:inv-auto-86`                                        | PASS                                            |
| `npm run test:phase-4.7`                                          | PASS (56/56)                                    |
| `npm run test:inventory-boundary`                                 | PASS (43/43)                                    |
| `npm run test:r4`                                                 | PASS (53/53)                                    |
| `npm run test:kds-h-outbox`                                       | PASS (23/23)                                    |
| `npm run test:critical` (P1 light)                                | PASS (24/24 suites)                             |
| P2 helmet / CORS / JWT / KDS WS / `test:security` / `test:phase2` | PASS                                            |
| `npm run lint:backend`                                            | PASS (warnings only)                            |
| `npm run lint` (full)                                             | FAIL — pre-existing frontend errors (unrelated) |
| `npm run build`                                                   | PASS                                            |
| `npm run build:frontend`                                          | PASS                                            |

---

## 19. Known Limitations

- Modifier / addon Auto-86 not implemented.
- Partial line cancel still does not restore stock (pre-existing asymmetry) → availability follows that policy.
- Restaurant refund restock remains retail-only (ADR-011).
- No WebSocket catalog push — POS must refresh catalog (existing pattern).
- Recipe backfill on upgrade uses ingredient `stock<=0` approximation; exact portion math runs on subsequent stock syncs.
- Live café pilot still blocked on R16 signing / OPS-02.

---

## 20. Acceptance Criteria

See P5 final response checklist (PASS / DEFERRED).

---

## 21. Final Status

**Implemented / Hardening verified** for INV-AUTO-86 automated scope.  
**Not** claimed Production-ready / live GO.
