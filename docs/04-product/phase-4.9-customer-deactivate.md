# Phase 4.9 — Customer Deactivate Lifecycle

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — unchanged

`POST /api/customers/:id/deactivate` (owner/manager) sets `is_active = 0`. 400 Already inactive, 404 missing, cashier 403. No loyalty/wallet writes. POS search unchanged (active-only). Reactivate still works.

Tests: `npm run test:phase-4.9` · `npm run test:inactive-customer`
