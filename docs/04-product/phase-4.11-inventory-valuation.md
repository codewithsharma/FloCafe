# Phase 4.11 — Inventory On-Hand Valuation Report

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**  
**Inventory writes:** none

---

## Summary

Owner/manager **catalog cost × on-hand qty** for inventory-tracked products. Not WAC, FIFO, or accounting COGS. Recipes/BOM are not exploded.

`GET /api/reports/inventory-valuation` (owner/manager). UI: `/products/valuation`. Inactive tracked SKUs included; untracked and deleted excluded. Zero catalog cost is flagged.

---

## Tests

`npm run test:phase-4.11`
