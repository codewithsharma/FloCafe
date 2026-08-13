/**
 * POS orchestration ownership map (Phase 2.16).
 *
 * POS is a composer of Order / Payment / Tax / Inventory — not a domain owner.
 * Keep this file tiny: markers + invariant only. No tax/money/stock math here.
 */

/** Concerns the POS UI layer may orchestrate (HTTP sequencing, module gates, UX). */
export const POS_OWNED: readonly string[] = [
  'checkout HTTP sequence orchestration (order → bill → pay)',
  'module capability gates (tables, addons, kds/kot printing)',
  'cart / held-order / modal UX state',
  'idempotency-key attempt storage for retry-safe POS checkout',
];

/**
 * Domains POS must NOT reimplement on the client.
 * Delegate to backend Order / Payment / Tax / Inventory services.
 */
export const POS_DOES_NOT_OWN: readonly string[] = [
  'tax engine / calculation — use Tax (server)',
  'inventory / stock mutations — use Inventory (server)',
  'payment tender internals (FIN-01, allocate, wallet debit) — use Payment',
];

export function assertPosOrchestrationInvariants(): void {
  const mustDelegate = ['tax', 'inventory', 'payment tender'];
  for (const needle of mustDelegate) {
    const hit = POS_DOES_NOT_OWN.some((s) => s.toLowerCase().includes(needle));
    if (!hit) {
      throw new Error(`POS orchestration invariant: POS_DOES_NOT_OWN must mention "${needle}"`);
    }
  }
  if (POS_OWNED.length === 0) {
    throw new Error('POS orchestration invariant: POS_OWNED must be non-empty');
  }
}
