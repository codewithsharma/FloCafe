import type { Order } from '@/lib/types';

/** Group active orders by table_id (string keys). Skips orders without table_id. */
export function buildOrdersByTable(orders: Order[]): Map<string, Order[]> {
  const map = new Map<string, Order[]>();
  for (const order of orders) {
    if (!order.table_id) continue;
    const tableKey = String(order.table_id);
    const existing = map.get(tableKey);
    if (existing) existing.push(order);
    else map.set(tableKey, [order]);
  }
  return map;
}
