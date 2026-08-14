# Phase 4.12 — Retail POS Fulfillment-Type Honesty

**Date:** 2026-08-14  
**Status:** COMPLETE  
**Schema:** v75 — **unchanged**

Retail POS (tables module off) shows **takeaway only**. Restaurant still has dine-in / takeaway / delivery. In-session leftover `delivery` is coerced to takeaway. Backend still accepts `type: delivery` (historical + Restaurant). No delivery tax changes.

Tests: `npm run test:phase-4.12` · `npm run test:phase-4.1`
