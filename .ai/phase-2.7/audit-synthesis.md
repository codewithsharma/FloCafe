# Phase 2.7 Audit Synthesis

## Inventory

- Stock = `products.track_inventory` / `stock_quantity` / `low_stock_threshold` only
- No ledger; do not add schema
- No `main/routes/inventory.ts` — keep HTTP under `/api/products`
- New `main/services/inventory.ts` owns mutation helpers
- Callers: orders.ts (decrement/cancel restore), products.ts (adjust), index.ts (item cancel restock)
- Refunds: intentional NO restock — preserve
- Preserve `withTxn` at order/sale sites

## Tax

- Already has `tax-engine.ts` + `tax.ts` adapters
- Strengthen boundary: consolidate duplicated discount-scale into tax.ts **preserving Math.round** (do not switch to Decimal — money must stay identical)
- Do not invent TaxEngine; do not touch dirty `tax-packs.ts`
- Prefer zero frontend changes
- Existing capabilities: `tax.compute`, `inventory.stock`

## Schema

- v74; Schema change: NO
- Broad db.ts rewrite: NO
