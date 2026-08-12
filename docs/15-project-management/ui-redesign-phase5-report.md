# UI Redesign Phase 5 Report — POS Layout

**Status:** Complete  
**Date:** 2026-08-12  
**Scope:** `/pos` layout and POS chrome only — checkout orchestration unchanged.

## Goal

Redesign the POS screen with Flo design tokens and a dedicated layout shell while preserving all business logic in `pos/page.tsx` (idempotency keys, prepaid/postpaid flows, barcode scanner, modals).

## Deliverables

| Area | Change |
| --- | --- |
| **PosWorkspace** | New layout primitive: toolbar + product workspace + 320px desktop order panel + mobile drawer slot |
| **PosTopbar** | Flo tokens, `min-h-11` touch targets |
| **ProductGrid** | Flo surfaces/borders, StatusBadge for stock, `min-h-[88px]` product cards, Playwright test IDs preserved |
| **CartPanel** | Flo tokens, numeric total hierarchy, touch-friendly controls |
| **pos/page.tsx** | Migrated to `PosWorkspace`; support ticket subject Nexora → Flo POS |
| **AppShell** | Full-bleed routes use `p-0`; POS padding owned by PosWorkspace |
| **Tests** | `tests/flo-pos.test.ts` wired via `npm run test:flo-pos` in `test:security` |

## Preserved (unchanged)

- PaymentModal, PrepaidCheckoutModal, AddonModal, TablePickerModal wiring
- `useCartStore`, `useHeldOrdersStore`, `useBarcodeScanner`
- Prepaid/postpaid idempotency storage keys and handlers
- `data-testid="pos-product-grid"` and `pos-product-card`

## Verification

```sh
npm run test:flo-pos
npm run test:flo-home
npm run test:flo-ui-shell
npm run build:frontend
npm run lint
```

## Next recommended phase

- **Phase 6:** Tables workspace (`/tables`)
- **Phase 3 (deferred):** Modal migration to Flo primitives
