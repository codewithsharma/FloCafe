/**
 * R4.1 — order row JSON / addon snapshot helpers (extracted; behavior unchanged).
 */
import type Database from 'better-sqlite3';

export function insertOrderItemAddons(
  dbInstance: Database.Database,
  orderItemId: number | bigint,
  addons: { id?: string; name?: string; price?: number; quantity?: number }[] | null | undefined,
  createdAt: string,
): void {
  if (!addons || !Array.isArray(addons) || addons.length === 0) return;
  const addonExists = dbInstance.prepare('SELECT 1 FROM addons WHERE id = ?');
  const insertAddon = dbInstance.prepare(`
    INSERT INTO order_item_addons (order_item_id, addon_id, addon_name, price, quantity, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const addon of addons) {
    if (!addon || !addon.name) continue;
    // addon_id has an FK to addons(id) — if the catalog addon was since
    // deleted (or the id never matched one, e.g. ad-hoc/legacy data), fall
    // back to NULL rather than let the FK violation abort order creation.
    // addon_name/price are the snapshot of record either way.
    const linkedAddonId = addon.id && addonExists.get(addon.id) ? addon.id : null;
    const qty = Math.max(1, Math.floor(Number(addon.quantity) || 1));
    insertAddon.run(orderItemId, linkedAddonId, addon.name, addon.price || 0, qty, createdAt);
  }
}

/** Parse JSON string fields on order_item rows returned from SQLite.
 *  Stored as JSON.stringify(value) — may be "null", "[...]", "{...}" etc.
 *  Returns actual JS value (array / object / null) so the frontend can map/iterate.
 *  addons is not handled here — see attachEffectiveAddons, which resolves it
 *  from the normalized order_item_addons table instead. */
export function parseItemJson(item: any): any {
  const tryParse = (val: any) => {
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };
  return {
    ...item,
    variant_selection: tryParse(item.variant_selection),
    modifier_selection: tryParse(item.modifier_selection),
    tax_breakdown: tryParse(item.tax_breakdown),
    tax_snapshot: tryParse(item.tax_snapshot),
  };
}

/**
 * Resolves selected addons for a batch of order_items rows from the
 * normalized order_item_addons table — the sole source of truth (see issue
 * #125; order_items.addons was dropped in migration v28). Returns new
 * objects with `addons` set to an array (empty if the item has none); does
 * not mutate the input.
 */
export function attachEffectiveAddons<T extends { id: number }>(
  dbInstance: Database.Database,
  items: T[],
): (T & { addons: { id: string | null; name: string; price: number; quantity: number }[] })[] {
  if (items.length === 0)
    return items as (T & {
      addons: { id: string | null; name: string; price: number; quantity: number }[];
    })[];

  const ids = items.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = dbInstance
    .prepare(`SELECT * FROM order_item_addons WHERE order_item_id IN (${placeholders}) ORDER BY id`)
    .all(...ids) as {
    order_item_id: number;
    addon_id: string | null;
    addon_name: string;
    price: number;
    quantity: number;
  }[];

  const byItem = new Map<
    number,
    { id: string | null; name: string; price: number; quantity: number }[]
  >();
  for (const row of rows) {
    const list = byItem.get(row.order_item_id) || [];
    list.push({ id: row.addon_id, name: row.addon_name, price: row.price, quantity: row.quantity });
    byItem.set(row.order_item_id, list);
  }

  return items.map((item) => ({ ...item, addons: byItem.get(item.id) || [] }));
}

/** Parse JSON text columns on bill/order rows returned from SQLite. */
export function parseRowJson(row: any): any {
  if (!row) return row;
  const tryParse = (val: any) => {
    if (typeof val !== 'string') return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  // tax_breakdown is stored as an array of per-item breakdowns (array of arrays).
  // Aggregate into a flat array of { title, rate, amount } for the frontend.
  let taxBreakdown = tryParse(row.tax_breakdown);
  if (Array.isArray(taxBreakdown) && taxBreakdown.length > 0 && Array.isArray(taxBreakdown[0])) {
    const merged: Record<string, { title: string; rate: number; amount: number }> = {};
    for (const itemBreakdown of taxBreakdown) {
      if (!Array.isArray(itemBreakdown)) continue;
      for (const line of itemBreakdown) {
        const key = `${line.title}_${line.rate}`;
        if (!merged[key]) {
          merged[key] = { title: line.title, rate: line.rate, amount: 0 };
        }
        merged[key].amount += line.amount;
      }
    }
    taxBreakdown = Object.values(merged).map((line) => ({
      ...line,
      amount: Math.round(line.amount * 100) / 100,
    }));
  }

  return {
    ...row,
    tax_breakdown: taxBreakdown,
    tax_snapshot: tryParse(row.tax_snapshot),
    payment_details: tryParse(row.payment_details),
  };
}
