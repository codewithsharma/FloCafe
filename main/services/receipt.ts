/**
 * Unified Print Receipt Service
 *
 * Logs print actions to the print_logs table.
 * Sale receipt/reprint also update bills.printed_at.
 * Refund proof logs do NOT update bills.printed_at (sale print state unchanged).
 */

import { getDatabase, withTxn, now } from '../db';

export type PrintType = 'receipt' | 'reprint' | 'refund';

export async function printReceipt(
  billId: number,
  userId: string,
  printType: PrintType,
): Promise<{ success: boolean; printLogId?: number }> {
  const db = getDatabase();

  const result = withTxn(() => {
    const bill = db.prepare('SELECT id FROM bills WHERE id = ?').get(billId) as
      { id: number } | undefined;
    if (!bill) {
      throw new Error('Bill not found');
    }

    const insertResult = db
      .prepare(
        'INSERT INTO print_logs (bill_id, user_id, print_type, printed_at) VALUES (?, ?, ?, ?)',
      )
      .run(billId, userId, printType, now());

    // Refund proof is not a sale receipt — leave bills.printed_at alone.
    if (printType !== 'refund') {
      db.prepare('UPDATE bills SET printed_at = ?, updated_at = ? WHERE id = ?').run(
        now(),
        now(),
        billId,
      );
    }

    return insertResult;
  });

  return { success: true, printLogId: result.lastInsertRowid as number };
}
