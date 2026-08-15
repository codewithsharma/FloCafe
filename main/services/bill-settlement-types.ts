/**
 * Shared bill / payment-line shapes for money-sensitive paths (R4.1 / P0.3 Phase 2).
 * Deliberately structural — mirrors SQLite bill columns used by tender/refund.
 */

export interface BillSettlementRow {
  id: number | string;
  order_id: number | string;
  bill_number?: string | null;
  customer_id?: string | number | null;
  shift_id?: number | string | null;
  split_group_id?: string | number | null;
  subtotal?: number | null;
  subtotal_cents?: number | null;
  tax_amount?: number | null;
  tax_amount_cents?: number | null;
  discount_amount?: number | null;
  discount_amount_cents?: number | null;
  total: number;
  total_cents?: number | null;
  paid_amount?: number | null;
  paid_amount_cents?: number | null;
  balance?: number | null;
  balance_cents?: number | null;
  payment_status?: string | null;
  payment_details?: string | null;
  [key: string]: unknown;
}

/** One line stored in bills.payment_details JSON. */
export interface StoredPaymentLine {
  method?: string;
  transaction_id?: string;
  notes?: string | null;
  amount?: number | string | null;
  requested_amount?: number | string | null;
  tendered_amount?: number | string | null;
  amount_omitted?: boolean;
  [key: string]: unknown;
}
