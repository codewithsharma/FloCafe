/**
 * Order domain boundary (Phase 2.14 CURRENT).
 *
 * Owns: order lifecycle orchestration (create/status/item cancel-restore HTTP
 * surface), order row persistence, historical money/tax *storage* on order
 * rows, and calling Inventory/Tax facades at sale/cancel time.
 *
 * Does NOT own: stock quantity mutations (Inventory), tax calculation engine
 * (Tax), payment tender / bills (Payment), or KDS push semantics (KDS).
 *
 * Callers keep withTxn for multi-statement order+stock+ledger work.
 * No schema migration (v75). No package extraction. No money-math changes.
 *
 * Deferred:
 * - Pure recalculateOrderMoneyFields extraction (duplicated rollup in
 *   cancel/restore/add-items remains in routes until a safe no-behavior-change
 *   extract is characterized).
 * - Full facade extraction of create / addItems.
 *
 * Phase 3.4: void×cancel restock skips voided / void_adjustment lines
 * (see order-void-cancel-stock.test.ts — expect stock 8).
 */

/** Concerns Order is responsible for coordinating / persisting. */
export const ORDER_OWNED_CONCERNS: readonly string[] = [
  'order lifecycle (create, status transitions, item cancel/restore)',
  'order and order_items row persistence',
  'historical money and tax snapshot storage on order rows',
  'orchestrating Inventory stock decrement/restore at sale/cancel boundaries',
  'orchestrating Tax facade for line/document tax at order money-path time',
];

/**
 * Concerns Order must NOT implement. Use the named owner instead.
 * Tests assert these strings so the boundary stays explicit.
 */
export const ORDER_DOES_NOT_OWN: readonly string[] = [
  'stock mutations — use Inventory (decrementTrackedStock / restoreTrackedStock / adjustProductStock)',
  'tax engine / calculation — use Tax facade (calculateTax / scale / combine helpers)',
  'payment tender / bill settlement — use Payment / bills routes',
  'KDS display push semantics — use KDS (notifyKdsUpdate is a side-effect call site only)',
];

export function assertOrderBoundaryInvariants(): void {
  const mustDelegate = ['stock', 'tax', 'payment', 'kds'];
  for (const needle of mustDelegate) {
    const hit = ORDER_DOES_NOT_OWN.some((s) => s.toLowerCase().includes(needle));
    if (!hit) {
      throw new Error(`Order boundary invariant: ORDER_DOES_NOT_OWN must mention "${needle}"`);
    }
  }
  if (ORDER_OWNED_CONCERNS.length === 0) {
    throw new Error('Order boundary invariant: ORDER_OWNED_CONCERNS must be non-empty');
  }
  // Inventory remains stock owner; Tax remains calc owner — Order only orchestrates.
  const inventoryDelegated = ORDER_DOES_NOT_OWN.some((s) => /inventory|stock/i.test(s));
  const taxDelegated = ORDER_DOES_NOT_OWN.some((s) => /tax/i.test(s));
  if (!inventoryDelegated || !taxDelegated) {
    throw new Error('Order boundary invariant: Inventory and Tax must remain owners');
  }
}

/**
 * Marker for routes that later call into Order: ownership docs live here.
 * recalculateOrderMoneyFields intentionally NOT extracted yet — rollup logic
 * is duplicated across cancel/restore/add-items and depends on Tax helpers +
 * live order rows; extracting without characterization risks money drift.
 */
export const ORDER_MONEY_ROLLUP_EXTRACTION = 'deferred' as const;
