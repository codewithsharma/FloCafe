/**
 * Shared bill / payment-line shapes for money-sensitive paths (R4.1).
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
  total: number;
  paid_amount?: number | null;
  balance?: number | null;
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
