# Phase 4.15 — Wastage Stock Decrease

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged** (no new `movement_type`)

`POST /api/products/:id/stock` `{ action: "wastage", quantity }` decreases on-hand like `decrease`. Ledger: `movement_type=adjustment`, `reference_type=manual`, `reason=wastage`. Insufficient stock → 400. StockAdjustmentDialog adds Wastage. No free-text reason.

Tests: `npm run test:phase-4.15` · `npm run test:stock-adjust-ui` · `npm run test:inventory-boundary`
