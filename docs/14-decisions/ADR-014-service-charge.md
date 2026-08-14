# ADR-014: Configurable restaurant service charge

**Status:** Proposed  
**Date:** 2026-08-14  
**Deciders:** Product + CTO (human Accept required before any wiring)  
**Supersedes:** n/a  
**Amends:** none — does **not** change ADR-009 refunds, FIN-01 collectible definition, or Phase 2.11 tax snapshot freeze  
**Related:** [phase-4.14 discovery](../04-product/phase-4.14-service-charge-discovery.md), [ADR-013](ADR-013-retail-product-variants-sku-identity.md) (unrelated identity lock)

---

## 1. Context

Opervia’s tax facade already supports `ChargeTaxKind = 'service_charge'` and Settings can assign a tax category. Receipts print a service-charge line when `bill.service_charge > 0`. Order create still hardcodes `service_charge: 0`. Schema **v75** has `orders.service_charge_tax_category_id` but **no amount columns** on `orders` or `bills`.

Café owners want a configurable dine-in service charge that taxes correctly. Wiring without policy would touch order totals, bill generate, tax snapshots, FIN-01 collectible, refunds, split checks, accounting CSV, and day-close.

**This ADR is policy.** It does **not** authorize schema, Settings UI, POS lines, or money-path code.

**Baseline:** schema **v75** · Phase 4.13 complete (docs) · HEAD after 4.12 (`d03acb5`).

---

## 2. Problem

If engineering copies `delivery_charge` without locks:

- Retail POS could inherit café service charge (shared tax + passthrough Zod).
- Totals could omit the amount while tax preview includes it (today’s split brain).
- FIN-01 collectible would silently change when `bill.total` grows.
- Tips could be smuggled in as a “service charge.”
- A snapshot-only amount (no column) would desync `db-audit` identity and refunds.

---

## 3. Decision (Proposed — lock on Accept)

### 3.1 Applicability

**Restaurant only. Dine-in only** (`orders.type = 'dine_in'`).

Takeaway, delivery, online, and **Retail** (`ACTIVE_VERTICAL_ID=retail` / `retail-test`) must send and persist **0**. Server fail-closed: ignore or 400 a non-zero amount when tables/restaurant floor composition is off **or** order type is not dine-in.

### 3.2 Amount model

**Percent of item subtotal** (pre-discount or post-discount — **post-line-discount, pre-tax**, matching how packaging/delivery are **not** scaled by order discount today). Store the **computed REAL amount** on the order (and copy to the bill), plus the **rate** used, so reprints and refunds do not re-read live Settings.

Settings (future): owner/manager `service_charge_enabled` + `service_charge_percent`. Not a free-form POS amount in v1 (prevents cashier improvisation). A later amendment may add a capped manual override.

### 3.3 Persistence (future wiring = **v76+**)

Wiring **requires new columns** (names indicative):

- `orders.service_charge` REAL NOT NULL DEFAULT 0
- `orders.service_charge_percent` REAL NULL (rate snapshotted at create)
- `bills.service_charge` REAL NOT NULL DEFAULT 0

Reuse existing `orders.service_charge_tax_category_id`. Optionally add `bills.service_charge_tax_category_id` only if generate cannot rely on the order row.

**Rejected:** snapshot-only JSON without columns; stuffing the amount into `delivery_charge`; using tips columns.

### 3.4 Tax

Use existing `calculateConfiguredChargeTaxes` kind `'service_charge'`. Amount 0 or missing category → skip (legacy untaxed), same as packaging/delivery. Category id frozen at order create (already true for zero amount). Do not unfreeze Phase 2.11 snapshot shape except to populate the existing `service_charge` charge line.

Inclusive vs exclusive follows the assigned tax category / pack — **no new tax mode**.

### 3.5 Order / bill totals

Include service charge in order `total` the same way as delivery/packaging (`subtotal + exclusiveTax + delivery + packaging + service − discount + round_off` as applicable). Bill generate **must copy** the amount. `db-audit` identity formula **must** add service_charge in the same wiring phase.

### 3.6 FIN-01

**Unchanged definition:** collectible outstanding = `bill_total − gross_successful_tender`. A non-zero service charge raises `bill.total` and therefore collectible. Do not special-case service charge in `preparePaymentBatch`.

### 3.7 Refunds, splits, cancel-item

- Refunds remain **bill-level** (ADR-009). Service charge sits inside `bill.total`; no per-charge refund API.
- Split checks: weight-allocate `service_charge` like delivery/packaging **after** columns exist.
- Item cancel: **preserve** the original service-charge amount on the order/bill (delivery analog / BUG #24), unless a later ADR says recompute. Default: preserve.

### 3.8 Reporting / day-close / CSV

Gross/Net/Refunds formulas stay on bill `total` / `paid_amount` / completed refunds. Adding service charge into `total` automatically flows. Do **not** add a separate CSV column in the first wiring phase unless Product asks. Day-close cash is tender-based — unchanged.

### 3.9 Tips — **excluded**

No tip tender, tip-out, pooling, or staff tip reports. Do not reuse `service_charge` as a tip line.

### 3.10 POS / Settings

Future wiring phase (not this 10): Restaurant Settings toggle + percent; POS dine-in only displays the computed line from tax preview / order payload. Retail POS must not show the control.

---

## 4. Alternatives considered

| Option                                         | Summary                                                           | Rejected because                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A — Percent dine-in, persist amount (LOCK)** | Settings percent; store REAL on order+bill; tax via existing kind | **Proposed accept**                                               |
| **B — Snapshot-only, no columns**              | Pass amount into tax, never persist                               | Totals/audit/refunds desync; reprint lies                         |
| **C — Flat amount per cover**                  | `guest_count × rate`                                              | Extra product rules; can amend later                              |
| **D — Include takeaway/delivery**              | All restaurant types                                              | Café counter tickets should not inherit dine-in charge by default |
| **E — Tips as service charge**                 | One field for both                                                | Different legal/ops meaning; out of scope                         |
| **F — Wire now on v75**                        | Stuff into packaging or JSON                                      | Violates schema honesty; this ADR exists to stop that             |

---

## 5. Consequences

- **Accept** authorizes a **future implementation phase** (schema v76+ + Settings + POS + tests). It does **not** start that phase.
- Until Accept, `service_charge` remains 0. Tax preview may still compute a posted preview amount; production orders must not persist one.
- Retail stays off by default even after Accept unless a new ADR overturns 3.1.
- Phase 4.15 (wastage) is independent and may ship while this ADR is Proposed.

---

## 6. Implementation notes (future phase — do not do now)

1. Migration v76 columns + `db-audit` formula.
2. Zod create/add-items: accept percent from Settings, not arbitrary client amount (or accept amount only after server recomputes).
3. Order create total includes service; bill generate copies it.
4. Isolation tests: Retail POST with `service_charge: 20` → stored 0 or 400.
5. FIN-01 + refund + 4.4 CSV regressions.
6. Feature-list: Service charge → BUILT only after wiring, not after this ADR.

**Do not migrate in Phase 4.14.**
