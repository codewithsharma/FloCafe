# Operavia Pilot — Success Criteria

**Scope:** Measurable operational success for a **supervised café / store pilot**.  
**Not:** Feature roadmap, ADR-014, variants matrix, or Phase 4.16.

Engineering baseline: `0200cae` (H1/H2/H3 closed). Schema v75. Money path stable.

---

## Company KPI (unchanged)

**3 cafés × 30 days × zero critical operational failures** (`STRATEGY.md`).

First supervised café is café **#1** of that KPI — not mass rollout.

---

## Café #1 — go-live bar (must all hold)

| #   | Criterion                                             | Pass evidence                                                                                                                                                   |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Zero critical money-path corruption**               | No unexplained bill/payment/refund mismatches; FIN-01 collectible = total − gross tender holds                                                                  |
| 2   | **Zero unauthorized financial actions**               | Refunds / day close / destructive ops only by authorized roles + PIN where required; chef cancel uses manager PIN (H3)                                          |
| 3   | **Zero unexplained stock corruption**                 | Unpaid cancel restocks once; paid cancel does **not** restock (409); void/catch-up behaves as trained                                                           |
| 4   | **Successful backup**                                 | Local `flo-backup-….db` created with Master PIN; file identifiable                                                                                              |
| 5   | **Successful restore**                                | DR drill or café restore with Master PIN; post-restore sale works; worksheet RTO/RPO recorded                                                                   |
| 6   | **Successful receipt printing** (if printer required) | Test print + sale receipt; refund receipt if refunds used                                                                                                       |
| 7   | **Successful KDS operation** (if KDS required)        | Order reaches KDS; bump works on staff LAN (OPS-01)                                                                                                             |
| 8   | **Successful day close**                              | Shift close + Z path; expected cash understood; variance recorded                                                                                               |
| 9   | **No Restaurant/Retail leakage**                      | Café: `ACTIVE_VERTICAL_ID` unset/`restaurant`; KDS/tables available as configured. Retail pilot: `=retail`; KDS `:3002` / Server App `:3003` connection-refused |
| 10  | **Staff autonomy**                                    | Normal sale / refund / close executable **without** developer on site                                                                                           |

---

## Explicit non-goals (do not block on these)

- Service charge (ADR-014 Proposed — not wired)
- Product variants matrix
- Table merge / billed merge
- Suppliers / PO / BOM / gift cards
- Signed artifact produced **in** this engineering environment (human ops may produce elsewhere)
- Perfect ERP feature parity

---

## Vertical notes

| Vertical       | Install                     | Extra success check                                                                |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| **Restaurant** | Unset / `restaurant`        | Takeaway-first OK; simple dine-in without billed merge; 86 works for owner/manager |
| **Retail**     | `ACTIVE_VERTICAL_ID=retail` | No KDS process; takeaway-only POS; refund restock optional; exchange if used       |

---

## Failure definitions (critical)

Treat as **critical operational failure** (KPI / S1):

- Wrong money recorded or unexplained tender/refund mismatch
- Guest network can reach POS API
- Trading continues through unexpected setup / wrong-café restore without stop
- Unauthorized refund / restore / factory reset

Printer/KDS downtime alone is **not** critical if billing continues and staff follow S2 workarounds — unless the café declared printer/KDS mandatory and cannot operate safely without them.

---

## Sign-off linkage

Record pass/fail against these criteria on [`pilot-signoff.md`](./pilot-signoff.md) and the first-week incident log. Do not claim “PILOT VALIDATED” until café #1 meets the go-live bar above on a **signed** artifact with human gates closed.
