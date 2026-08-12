# Problem Statement

## CURRENT STATE — Problems FloCafe addresses today

**VERIFIED** from `README.md` and product positioning:

1. **Cloud POS lock-in and per-seat fees** — FloCafe runs on the operator's hardware with no hosted account required for core POS.
2. **Internet dependency** — Local SQLite + offline-first design keeps the counter operational during outages.
3. **Small venue complexity** — Combines counter, dine-in, takeaway, delivery order types with tables, KDS, and thermal printing in one app.
4. **Tax compliance fragmentation** — Country tax rules ship as signed versioned packs (`docs/tax-packs.md`), not hard-coded per release.

## CURRENT STATE — Limitations operators still face

**VERIFIED** from codebase analysis:

| Limitation | Evidence |
|------------|----------|
| Single location only | No `locations` or `terminals` tables in `main/db.ts` |
| No shift/cash drawer management | No shift tables or routes; grep finds no shift workflow |
| Basic inventory | `products.track_inventory`, `stock_quantity` only — no recipes, suppliers, POs |
| No dedicated refund workflow | Voids/cancellations exist; no payment reversal/refund entity |
| LAN traffic unencrypted | `docs/security-audit-2.7.0.md` SEC-01 |
| No multi-device sync beyond KDS/Server App | Three servers share one DB on one machine |
| Cloud is coordination, not source of truth | `main/services/cloud-sync.ts` outbox pattern |

## TARGET STATE — RestaurantOS problem scope

RestaurantOS should solve, in priority order:

1. **Operational reliability** — production-grade error handling, observability, and recovery for 12+ hour service days.
2. **Inventory intelligence** — move from product stock counts to ingredient-level control (PLANNED).
3. **Multi-location readiness** — franchise/chain operators need centralized config with local execution (PLANNED).
4. **Integration surface** — accounting, delivery aggregators, payment terminals (PLANNED).
5. **Audit and compliance** — stronger audit trails for financial and staff actions (PARTIAL today via `print_logs`, `tax_config_audit`).

## OUT OF SCOPE (for now)

- Replacing SQLite with PostgreSQL for single-terminal installs
- Mandatory cloud subscription
- AI-dependent core workflows
