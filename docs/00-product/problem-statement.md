# Problem Statement

## CURRENT STATE — Problems Operavia Restaurant addresses today

**VERIFIED** from `README.md`, `STRATEGY.md`, and product positioning:

1. **Cloud POS lock-in and per-seat fees** — Operavia runs on the operator's hardware with no hosted account required for core POS.
2. **Internet dependency** — Local SQLite + offline-first design keeps the counter operational during outages.
3. **Small venue complexity** — Combines counter, dine-in, takeaway, delivery order types with tables, KDS, and thermal printing in one app.
4. **Tax compliance fragmentation** — Country tax rules ship as signed versioned packs (`docs/tax-packs.md`), not hard-coded per release.

## CURRENT STATE — Limitations operators still face

**VERIFIED** from codebase analysis (2026-08-14, schema v79):

| Limitation                                 | Evidence                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Single location only                       | No multi-location schema; ADR-006 frozen until pilots                                        |
| Cash drawer hardware kick missing          | P1.1 — no ESC/POS drawer command in printer stack                                            |
| Inventory depth limited                    | Stock + v75 `inventory_movements` API + `/products/movements` UI; no recipes, suppliers, POs |
| Refund receipt print deferred              | Money refunds built (`refund.ts`); print path deferred                                       |
| LAN traffic unencrypted when exposed       | `network_mode` kds_lan/lan; OPS-01 no guest Wi‑Fi; TLS deferred                              |
| No multi-device sync beyond LAN clients    | Companions hit host API; one SQLite writer host                                              |
| Cloud is coordination, not source of truth | `main/services/cloud-sync.ts` outbox pattern (non-blocking)                                  |

**No longer accurate (do not repeat):** “no shift workflow,” “no refund entity” — both are built (M4–M6).

## TARGET STATE — Platform problem scope

After pilot KPI, Operavia should additionally address, in priority order:

1. **Operational reliability** — production-grade error handling, observability, and recovery for 12+ hour service days.
2. **Deeper inventory / procurement** — ledger UI, recipes/BOM, suppliers (Phase 3.5+).
3. **Multi-location** — only after ADR-006.
4. **Additional verticals** — Retail composition exists; retail UX depth and other verticals remain incomplete/planned.

See [`vision.md`](vision.md) · [`verticals.md`](verticals.md) · [`STRATEGY.md`](../../STRATEGY.md).
