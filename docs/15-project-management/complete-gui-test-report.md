# Complete GUI Testing Report — Nexora POS

**Date:** 2026-08-13  
**Method:** Packaged `Nexora.app` Electron window controlled via CDP (clicks, typing, screenshots)  
**Userdata:** `$HOME/nexora-full-app-test` only  
**Developer profile:** untouched  
**Artifact:** TRAINING / QA (adhoc)

## Summary counts

From `$HOME/nexora-full-app-test/evidence/gui-complete/results.json` (includes retries):

| Status | Count (approx final) |
|--------|----------------------|
| PASS | 94+ |
| NOT VERIFIED | ~20 |
| FAIL | reduced after retries; remaining include historical pre-retry fails + documented bugs |
| NOT APPLICABLE | 2 (Tables, WhatsApp on this QSR café) |

Canonical matrix: `$HOME/nexora-full-app-test/evidence/gui-complete/GUI-FEATURE-MATRIX.md`  
Screenshots: `$HOME/nexora-full-app-test/evidence/gui-complete/**/*.png` (~80+)

## Modules exercised in GUI

| Module | GUI result |
|--------|------------|
| Auth login / invalid login / keep me logged in / logout | **PASS** |
| Recover Access page | **PASS** (back-link flaky when session still active) |
| Home + Open reports / Open operations | **PASS** |
| POS order types, categories, search, add to cart, qty, place order, cash confirm, card method | **PASS** |
| Open Shift / Close Shift | **PASS** |
| Orders tabs + search | **PASS** |
| Kitchen / KDS views | **PASS** |
| Customers add | **PASS** |
| Inventory (after tags data fix) tabs, add product, add category, CSV | **PASS** |
| Team add staff | **PASS** (retry) |
| Reports | **PASS** (retry) |
| Operations + day already closed | **PASS** (retry) |
| Settings: all major tabs (Store, Printers, Payments, Tax, POS Workflow, Shifts, KDS, Tableside, WhatsApp, Loyalty, Discounts, Mobile, Backup, OrderFlow, Account, Privacy, Updates, About) | **PASS** |
| Support page + send button present | **PASS** (request not sent) |
| Tables | **NOT APPLICABLE** (QSR express) |
| WhatsApp nav | **NOT APPLICABLE** |
| Printer hardware success | **NOT VERIFIED** (GUI failure path seen) |
| Deep refund UI on order card | **NOT VERIFIED** |
| Master PIN Create Backup full dialog submit | **NOT VERIFIED** / partial |

## Bugs found by GUI

### P1 — QA-INV-TAGS-01 Inventory page crash

- **Symptom:** Inventory shows “This page couldn’t load”
- **Error:** `TypeError: e.tags.map is not a function`
- **Cause:** `product.tags` sometimes a string (including double-encoded `"[]"`); UI assumed array
- **Fixes in repo (this session):**
  - `frontend/.../ProductsTable.tsx` — `Array.isArray` guard
  - `frontend/.../products/page.tsx` — normalize tags on edit
  - `main/routes/products.ts` — `parseTags` recurses so double-encoded JSON cannot return a string
- **Test DB:** normalized bad tags in isolated userdata only
- **Note:** Packaged TRAINING app still needs rebuild to include frontend/API fixes; data fix unblocked GUI retest

### P2 — QA-FIN01-STATUS-01 (prior)

payment_status/balance vs FIN-01 collectible (API QA)

### P3 — Print failure UI with no printer

Expected operational message after successful pay

## Honesty limits

A literal click of every nested dialog in Tax Advanced / Google Drive OAuth / real printer / WhatsApp QR is not claimed as PASS. Those are **NOT VERIFIED** or **NOT APPLICABLE**. Everything marked PASS was actually driven in the Electron UI with screenshot evidence.

## Next steps

1. Rebuild/repackage TRAINING app to ship INV-TAGS fixes; re-run Inventory GUI on clean data  
2. Complete Master PIN backup + recovery file-picker GUI  
3. Order detail → Refund GUI path  
4. Do not promote to READY FOR PILOT until P1 fix is in the pilot artifact
