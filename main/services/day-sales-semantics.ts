/**
 * Shared Gross / Refunds / Net day-window sales truth (reports + ops finance).
 * Do not invent alternate formulas — keep in sync with historical report behavior.
 */
import { getDatabase } from '../db';

export type DaySalesSemantics = {
  grossSales: number;
  refunds: number;
  netSales: number;
};

/** Day-window sales truth: Gross / Refunds / Net. paid_amount alone is Net Sales. */
export function queryDaySalesSemantics(
  db: ReturnType<typeof getDatabase>,
  start: string,
  end: string,
): DaySalesSemantics {
  const settled = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(COALESCE(total_cents, CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER))) / 100.0, 0) AS grossSales,
      COALESCE(SUM(COALESCE(paid_amount_cents, CAST(ROUND(COALESCE(paid_amount, 0) * 100) AS INTEGER))) / 100.0, 0) AS netSales
    FROM bills
    WHERE created_at >= ? AND created_at < ?
      AND (
        payment_status IN ('paid', 'partially_refunded', 'refunded')
        OR (
          payment_status = 'partial'
          AND ROUND(total * 100) <= COALESCE((
            SELECT SUM(
              CASE
                WHEN typeof(json_extract(je.value, '$.amount')) IN ('integer', 'real')
                  THEN ROUND(json_extract(je.value, '$.amount') * 100)
                ELSE 0
              END
            )
            FROM json_each(CASE
              WHEN json_valid(payment_details) AND json_type(payment_details) = 'array'
                THEN payment_details
              WHEN json_valid(payment_details)
                THEN json_array(payment_details)
              ELSE '[]'
            END) je
            WHERE json_type(je.value) = 'object'
          ), 0)
        )
      )
  `,
    )
    .get(start, end) as { grossSales: number; netSales: number };

  const refundsRow = db
    .prepare(
      `
    SELECT COALESCE(SUM(amount_cents), 0) AS refundsCents
    FROM refunds
    WHERE status = 'completed'
      AND created_at >= ? AND created_at < ?
  `,
    )
    .get(start, end) as { refundsCents: number };

  const refunds = Number(refundsRow.refundsCents || 0) / 100;
  return {
    grossSales: Number(settled.grossSales || 0),
    refunds,
    netSales: Number(settled.netSales || 0),
  };
}
