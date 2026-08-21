/**
 * Schema migration registry (extracted from main/db.ts — foundation deepen).
 * Ups close over a host-bound db Proxy so buildIdealSchemaDb swaps stay live.
 * Do not edit historical migration entries.
 */
import type Database from 'better-sqlite3';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { BUNDLED_COUNTRY_PACKS, bundledPackVersionId } from '../tax-packs/bundled';
import { now } from './time';
import { insertOrderItemAddons } from './order-row';
import { parsePhoneE164 } from '../lib/phone';

export type MigrationHost = {
  getDb: () => Database.Database;
  getColumns: (dbInstance: Database.Database, tableName: string) => string[];
  insertSettingIfMissing: (key: string, value: string) => void;
  getSettingValue: (key: string) => string | null;
  createSchema: () => void;
  createCloudSyncSchema: () => void;
  createTaxPackSchema: () => void;
  createWhatsAppSchema: () => void;
  seedInstallDefaults: () => void;
  seedCloudSyncDefaults: () => void;
  seedWhatsAppDefaults: () => void;
  loadInstallDefaults: () => void;
  sha256Hex: (value: string) => string;
  initializeJWTSecret?: () => void;
  migrateLegacyJWTSecret?: () => void;
};

let host: MigrationHost | null = null;

export function setMigrationHost(next: MigrationHost): void {
  host = next;
}

function requireHost(): MigrationHost {
  if (!host) throw new Error('Migration host not bound');
  return host;
}

/** Live DB handle used by historical migration ups (same call sites as before). */
const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, _receiver) {
    const real = requireHost().getDb() as any;
    const value = real[prop as keyof typeof real];
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
}) as Database.Database;

function getColumns(dbInstance: Database.Database, tableName: string): string[] {
  return requireHost().getColumns(dbInstance, tableName);
}
function insertSettingIfMissing(key: string, value: string): void {
  requireHost().insertSettingIfMissing(key, value);
}
function getSettingValue(key: string): string | null {
  return requireHost().getSettingValue(key);
}
function createSchema(): void {
  requireHost().createSchema();
}
function createCloudSyncSchema(): void {
  requireHost().createCloudSyncSchema();
}
function createTaxPackSchema(): void {
  requireHost().createTaxPackSchema();
}
function createWhatsAppSchema(): void {
  requireHost().createWhatsAppSchema();
}
function seedInstallDefaults(): void {
  requireHost().seedInstallDefaults();
}
function seedCloudSyncDefaults(): void {
  requireHost().seedCloudSyncDefaults();
}
function seedWhatsAppDefaults(): void {
  requireHost().seedWhatsAppDefaults();
}
function loadInstallDefaults(): void {
  requireHost().loadInstallDefaults();
}
function sha256Hex(value: string): string {
  return requireHost().sha256Hex(value);
}
function initializeJWTSecret(): void {
  requireHost().initializeJWTSecret?.();
}
function migrateLegacyJWTSecret(): void {
  requireHost().migrateLegacyJWTSecret?.();
}

// ─── Migration registry ───────────────────────────────────────────────────────
// Each entry runs exactly once, in order, wrapped in a transaction.
// To add a schema change: append a new entry. Never edit existing entries.

export const MIGRATIONS: { version: number; name: string; up: () => void }[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: () => {
      createSchema();
      seedInstallDefaults();
    },
  },
  {
    version: 2,
    name: 'hash_plaintext_pins',
    up: () => {
      // Migrate from plaintext PINs to hashed PINs.
      // New installs going forward store only pin_hash.
      const userColumns = getColumns(db, 'users');
      if (!userColumns.includes('pin_hash')) {
        db.exec(`ALTER TABLE users ADD COLUMN pin_hash TEXT`);
      }

      if (!userColumns.includes('pin')) return;

      const usersWithPin = db.prepare('SELECT id, pin FROM users WHERE pin IS NOT NULL').all() as {
        id: string;
        pin: string;
      }[];
      for (const user of usersWithPin) {
        const pin = String(user.pin || '');
        if (!pin) continue;
        // Already a bcrypt hash?
        if (pin.startsWith('$2')) continue;
        db.prepare('UPDATE users SET pin_hash = ?, pin = NULL WHERE id = ?').run(
          bcrypt.hashSync(pin, 10),
          user.id,
        );
      }
    },
  },
  {
    version: 3,
    name: 'cloud_identity_and_outbox',
    up: () => {
      createCloudSyncSchema();
      seedCloudSyncDefaults();
    },
  },
  {
    version: 4,
    name: 'add_notes_limits_settings',
    up: () => {
      insertSettingIfMissing('max_order_notes_length', '200');
      insertSettingIfMissing('max_item_notes_length', '100');
    },
  },
  {
    version: 5,
    name: 'add_print_logs_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS print_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bill_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          printed_at TEXT DEFAULT CURRENT_TIMESTAMP,
          print_type TEXT DEFAULT 'receipt',
          FOREIGN KEY (bill_id) REFERENCES bills(id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `);
    },
  },
  {
    version: 6,
    name: 'add_loyalty_settings',
    up: () => {
      insertSettingIfMissing('loyalty_enabled', 'true');
      insertSettingIfMissing('loyalty_points_per_currency', '1');
      insertSettingIfMissing('loyalty_redemption_rate', '100');
      insertSettingIfMissing('loyalty_max_balance_enabled', '0');
      insertSettingIfMissing('loyalty_max_balance_points', '10000');
      insertSettingIfMissing('loyalty_expiry_enabled', '0');
      insertSettingIfMissing('loyalty_expiry_months', '6');
      insertSettingIfMissing('loyalty_min_redemption', '100');
      insertSettingIfMissing('loyalty_max_redemption_percentage', '50');
    },
  },
  {
    version: 7,
    name: 'add_discount_settings',
    up: () => {
      insertSettingIfMissing('discount_mode', 'percentage');
      insertSettingIfMissing('discount_requires_approval', '0');
      insertSettingIfMissing('discount_max_percentage', '25');
      insertSettingIfMissing('discount_max_amount', '0');
    },
  },
  {
    version: 8,
    name: 'add_loyalty_index',
    up: () => {
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_ledger(customer_id, type)',
      );
    },
  },
  {
    version: 9,
    name: 'add_sequences_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sequences (
          name TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          current_value INTEGER NOT NULL DEFAULT 0
        )
      `);
    },
  },
  {
    version: 10,
    name: 'fix_sequences_composite_key',
    up: () => {
      // v9 used `name TEXT PRIMARY KEY` but the code needs (name, date) as a
      // composite key. Drop and recreate with the correct schema.
      db.exec(`DROP TABLE IF EXISTS sequences`);
      db.exec(`
        CREATE TABLE sequences (
          name TEXT NOT NULL,
          date TEXT NOT NULL,
          current_value INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (name, date)
        )
      `);
    },
  },
  {
    version: 11,
    name: 'first_run_setup_uses_welcome_form',
    up: () => {
      // Intentionally no-op. Fresh installs must remain uninitialized so the
      // local welcome form can create the first owner account.
    },
  },
  {
    version: 12,
    name: 'fix_table_integer_ids',
    up: () => {
      // Non-destructive migration: convert integer table IDs to strings.
      // Some tables were created before POST /tables was fixed (Task 1),
      // so they got SQLite rowid integers instead of 'tbl-...' strings.
      db.exec(`UPDATE tables SET id = 'tbl-' || id WHERE typeof(id) = 'integer'`);
    },
  },
  {
    version: 13,
    name: 'fix_null_table_ids',
    up: () => {
      // Fix tables with NULL ids caused by old INSERT without id column.
      // SQLite stored NULL instead of generating an id.
      //
      // Generate string IDs using rowid for existing tables with NULL ids
      db.exec(`UPDATE tables SET id = 'tbl-' || rowid WHERE id IS NULL`);

      // Also catch any integer ids that slipped through v12
      db.exec(`UPDATE tables SET id = 'tbl-' || id WHERE typeof(id) = 'integer'`);
    },
  },
  {
    version: 14,
    name: 'simplify_loyalty_settings',
    up: () => {
      // Loyalty program is now a single on/off switch — earning rate comes from
      // each product's own cb_percent, and redemption uses a fixed in-code rate.
      // Drop the now-unused tuning settings; keep only loyalty_enabled.
      db.exec(`
        DELETE FROM settings WHERE key IN (
          'loyalty_points_per_currency',
          'loyalty_redemption_rate',
          'loyalty_max_balance_enabled',
          'loyalty_max_balance_points',
          'loyalty_expiry_enabled',
          'loyalty_expiry_months',
          'loyalty_min_redemption',
          'loyalty_max_redemption_percentage',
          'loyalty_expiry_days'
        )
      `);
      const customerCols = db.prepare(`PRAGMA table_info(customers)`).all() as { name: string }[];
      if (customerCols.some((c) => c.name === 'loyalty_points')) {
        db.exec(`ALTER TABLE customers DROP COLUMN loyalty_points`);
      }
    },
  },
  {
    version: 15,
    name: 'add_instagram_handle_setting',
    up: () => {
      insertSettingIfMissing('instagram_handle', '');
    },
  },
  {
    version: 16,
    name: 'add_terms_accepted_at_to_users',
    up: () => {
      const userColumns = getColumns(db, 'users');
      if (!userColumns.includes('terms_accepted_at')) {
        db.exec(`ALTER TABLE users ADD COLUMN terms_accepted_at TEXT`);
      }
    },
  },
  {
    version: 17,
    name: 'add_held_orders_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS held_orders (
          id TEXT PRIMARY KEY,
          table_id TEXT NOT NULL,
          items TEXT NOT NULL,
          customer_id TEXT,
          guest_count INTEGER DEFAULT 1,
          order_notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    },
  },
  {
    version: 18,
    name: 'fix_null_category_ids',
    up: () => {
      // Same bug as v13's fix_null_table_ids: POST /categories inserted without
      // the id column, and categories.id (TEXT PRIMARY KEY, not a rowid alias)
      // silently accepted NULL. Backfill so these rows become deletable and
      // stop colliding with the "All" filter (which also compares against null).
      db.exec(`UPDATE categories SET id = 'cat-' || rowid WHERE id IS NULL`);
    },
  },
  {
    version: 19,
    name: 'backfill_product_cb_percent_and_tags',
    up: () => {
      // cb_percent/tags were added to createSchema() (CREATE TABLE IF NOT EXISTS)
      // back when v1-v7 -> v8 was still a destructive dropAllTables()+recreate
      // migration. Once migrations became incremental (non-destructive), no
      // ALTER TABLE ever backfilled these columns onto pre-v8 installs that
      // updated straight through — so POST /products 500s with "table products
      // has no column named cb_percent" on any DB that never got the columns.
      const productColumns = getColumns(db, 'products');
      if (!productColumns.includes('cb_percent')) {
        db.exec(`ALTER TABLE products ADD COLUMN cb_percent REAL DEFAULT 0`);
      }
      if (!productColumns.includes('tags')) {
        db.exec(`ALTER TABLE products ADD COLUMN tags TEXT`);
      }
    },
  },
  {
    version: 20,
    name: 'add_tables_is_active',
    up: () => {
      // Tables were hard-deleted, orphaning orders.table_id/held_orders.table_id
      // on any historical order still pointing at them. Add is_active so tables
      // can be deactivated (like products/categories/staff) instead of destroyed.
      const tableColumns = getColumns(db, 'tables');
      if (!tableColumns.includes('is_active')) {
        db.exec(`ALTER TABLE tables ADD COLUMN is_active INTEGER DEFAULT 1`);
      }
    },
  },
  {
    version: 21,
    name: 'clear_legacy_loyalty_expiry',
    up: () => {
      // v14 turned off expiry for new loyalty points, but left expires_at on
      // pre-existing ledger rows untouched. Since wallet balance nets all-time
      // debits against only unexpired credits, a legacy credit hitting its old
      // expiry date silently drops out of the credit sum while the debits that
      // already spent it stay — collapsing the customer's balance. Clearing
      // expires_at retroactively aligns legacy rows with the non-expiry policy.
      db.exec(`UPDATE loyalty_ledger SET expires_at = NULL WHERE expires_at IS NOT NULL`);
    },
  },
  {
    version: 22,
    name: 'add_customers_phone_digits',
    up: () => {
      if (!getColumns(db, 'customers').includes('phone_digits')) {
        db.exec(`
          ALTER TABLE customers ADD COLUMN phone_digits TEXT
            GENERATED ALWAYS AS (
              CASE WHEN phone IS NULL THEN NULL
                   ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')
              END
            ) VIRTUAL
        `);
      }
    },
  },
  {
    version: 23,
    name: 'normalize_customer_phones',
    up: () => {
      // country_code only exists in createSchema()'s CREATE TABLE, which is
      // a no-op (IF NOT EXISTS) for any install whose customers table
      // predates that column being added — this migration is the first
      // thing to actually read/write it, and was crashing with "no such
      // column: country_code" on every such upgrade (reported on a fresh
      // Windows install of v1.9.7). Guard it here instead of assuming it's
      // there.
      if (!getColumns(db, 'customers').includes('country_code')) {
        db.exec(`ALTER TABLE customers ADD COLUMN country_code TEXT DEFAULT '+91'`);
      }

      const tenantCountryRow = db
        .prepare("SELECT value FROM settings WHERE key = 'country'")
        .get() as any;
      const tenantCountry = tenantCountryRow?.value || 'IN';

      const { parsePhoneE164 } = require('../lib/phone');

      const customers = db
        .prepare(
          "SELECT id, phone, country_code FROM customers WHERE phone IS NOT NULL AND phone != ''",
        )
        .all() as any[];

      let normalized = 0,
        unparseable = 0;

      for (const c of customers) {
        const parsed = parsePhoneE164(c.phone, tenantCountry);
        if (parsed) {
          db.prepare('UPDATE customers SET phone = ?, country_code = ? WHERE id = ?').run(
            parsed.e164,
            parsed.countryCode,
            c.id,
          );
          normalized++;
        } else {
          console.log(`[MIGRATION v23] unparseable: ${c.id} ${c.phone}`);
          unparseable++;
        }
      }
      console.log(`[MIGRATION v23] normalized: ${normalized}, unparseable: ${unparseable}`);

      const dupes = db
        .prepare(
          `
        SELECT phone_digits, GROUP_CONCAT(id) as ids, COUNT(*) as cnt
        FROM customers
        WHERE phone_digits IS NOT NULL AND phone_digits != ''
        GROUP BY phone_digits
        HAVING cnt > 1
      `,
        )
        .all() as any[];

      let merged = 0;

      for (const group of dupes) {
        const ids = group.ids.split(',').sort();
        const allRows = db
          .prepare(
            `SELECT * FROM customers WHERE id IN (${ids.map(() => '?').join(',')})
           ORDER BY created_at ASC, id ASC`,
          )
          .all(...ids) as any[];

        const winner = allRows[0];
        const losers = allRows.slice(1);

        const coalesceFields = ['email', 'address', 'notes', 'country_code'];
        for (const loser of losers) {
          for (const field of coalesceFields) {
            if (!winner[field] && loser[field]) {
              winner[field] = loser[field];
            }
          }
        }

        db.prepare(
          `
          UPDATE customers SET email = ?, address = ?, notes = ?, country_code = ?, updated_at = ?
          WHERE id = ?
        `,
        ).run(winner.email, winner.address, winner.notes, winner.country_code, now(), winner.id);

        const fkTables = ['orders', 'bills', 'held_orders', 'loyalty_ledger'];
        for (const table of fkTables) {
          db.prepare(
            `UPDATE ${table} SET customer_id = ? WHERE customer_id IN (${losers.map(() => '?').join(',')})`,
          ).run(winner.id, ...losers.map((l: any) => l.id));
        }

        const loserIds = losers.map((l: any) => l.id);
        db.prepare(`DELETE FROM customers WHERE id IN (${loserIds.map(() => '?').join(',')})`).run(
          ...loserIds,
        );

        console.log(
          `[MIGRATION v23] merged ${loserIds.join(',')} → ${winner.id} (phone: ${winner.phone})`,
        );
        merged += losers.length;
      }
      console.log(`[MIGRATION v23] merged ${merged} duplicate customer(s)`);

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_digits_unique
        ON customers(phone_digits)
        WHERE phone_digits IS NOT NULL AND phone_digits != ''
      `);

      const total = db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as { cnt: number };
      const nonE164 = db
        .prepare(
          "SELECT COUNT(*) as cnt FROM customers WHERE phone IS NOT NULL AND phone != '' AND phone NOT LIKE '+%'",
        )
        .get() as { cnt: number };
      console.log(
        `[MIGRATION v23] verification: ${total.cnt} customers, ${nonE164.cnt} still non-E.164`,
      );
      if (nonE164.cnt > 0) {
        console.warn(
          `[MIGRATION v23] WARNING: ${nonE164.cnt} customers have unparseable phones (preserved as raw)`,
        );
      }
    },
  },
  {
    version: 24,
    name: 'normalize_customer_phones_retry',
    up: () => {
      const tenantCountryRow = db
        .prepare("SELECT value FROM settings WHERE key = 'country'")
        .get() as any;
      const tenantCountry = tenantCountryRow?.value || 'IN';

      const { parsePhoneE164 } = require('../lib/phone');

      const customers = db
        .prepare(
          "SELECT id, phone, country_code FROM customers WHERE phone IS NOT NULL AND phone != ''",
        )
        .all() as any[];

      let normalized = 0,
        unparseable = 0;

      for (const c of customers) {
        const parsed = parsePhoneE164(c.phone, tenantCountry);
        if (parsed && parsed.e164 !== c.phone) {
          db.prepare('UPDATE customers SET phone = ?, country_code = ? WHERE id = ?').run(
            parsed.e164,
            parsed.countryCode,
            c.id,
          );
          normalized++;
        } else if (!parsed) {
          unparseable++;
        }
      }
      console.log(`[MIGRATION v24] normalized: ${normalized}, unparseable: ${unparseable}`);
    },
  },
  {
    version: 25,
    name: 'add_order_item_addons_table',
    up: () => {
      // Selected addons are snapshotted as JSON on order_items.addons. That
      // works for print/receipt display but makes addon reporting ("addons
      // sold by day/product/station") require JSON parsing instead of
      // indexed SQL, and ambiguous parsed-vs-raw-JSON typing already caused
      // a KOT print failure (see 02a511e). Add a normalized snapshot table
      // and backfill it from existing rows. order_items.addons stays the
      // read-path source of truth for now — this migration only adds the
      // table and starts populating it; see issue #125.
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_item_addons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_item_id INTEGER NOT NULL,
          addon_id TEXT,
          addon_name TEXT NOT NULL,
          price NUMERIC NOT NULL DEFAULT 0,
          quantity INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
          FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_order_item_addons_order_item_id ON order_item_addons(order_item_id);
        CREATE INDEX IF NOT EXISTS idx_order_item_addons_addon_id ON order_item_addons(addon_id);
      `);

      const rows = db
        .prepare(
          `SELECT id, addons, created_at FROM order_items WHERE addons IS NOT NULL AND addons != '' AND addons != 'null'`,
        )
        .all() as { id: number; addons: string; created_at: string }[];

      let backfilled = 0,
        skipped = 0;
      for (const row of rows) {
        let parsed: any;
        try {
          parsed = JSON.parse(row.addons);
        } catch {
          skipped++;
          continue;
        }
        if (!Array.isArray(parsed) || parsed.length === 0) continue;
        insertOrderItemAddons(db, row.id, parsed, row.created_at || now());
        backfilled++;
      }
      console.log(
        `[MIGRATION v25] backfilled addons for ${backfilled} order items (${skipped} unparseable, skipped)`,
      );
    },
  },
  {
    version: 26,
    name: 'add_kds_default_view',
    up: () => {
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('kds_default_view', 'tabs', ?)`,
      ).run(now());
    },
  },
  {
    version: 27,
    name: 'add_station_printer_link_and_user_stations',
    up: () => {
      // Links a kitchen station to a printer row instead of duplicating
      // ip/port/name inline, and lets a staff login (or shared counter
      // login) be assigned to one or more stations. See issue #134.
      const stationColumns = getColumns(db, 'kitchen_stations');
      if (!stationColumns.includes('printer_id')) {
        db.exec(
          `ALTER TABLE kitchen_stations ADD COLUMN printer_id TEXT REFERENCES printers(id) ON DELETE SET NULL`,
        );
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS station_users (
          user_id TEXT NOT NULL,
          station_id TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, station_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (station_id) REFERENCES kitchen_stations(id) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    version: 28,
    name: 'seed_telemetry_settings',
    up: () => {
      // Installs that ran first-run setup before telemetry was added (v1.9.4)
      // never had these rows written — loadInstallDefaults() only runs on a
      // fresh DB. INSERT OR IGNORE is safe: fresh installs already have them.
      // All default to off so existing installs stay opted-out.
      const t = now();
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('anonymous_data_consent', 'false', ?)`,
      ).run(t);
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('telemetry_enabled', 'false', ?)`,
      ).run(t);
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('telemetry_scope', 'usage_stats,country,app_version,platform,session_duration,feature_usage,error_diagnostics', ?)`,
      ).run(t);
    },
  },
  {
    version: 29,
    name: 'whatsapp_messaging',
    up: () => {
      createWhatsAppSchema();
      seedWhatsAppDefaults();
    },
  },
  {
    version: 30,
    name: 'drop_order_items_addons_json_column',
    up: () => {
      // order_item_addons (v25) has been the sole write target for selected
      // addons for a while now, and every read path was moved onto it in the
      // same release this migration ships in — order_items.addons is no
      // longer written or read anywhere in the app. This is the cleanup: one
      // more backfill sweep (belt-and-braces — v25 already ran, but this
      // catches anything created between then and the dual-write existing,
      // or any hand-edited row), then drop the column outright rather than
      // leave a dead, unused JSON copy sitting in the schema. See issue #125.
      const columns = getColumns(db, 'order_items');
      if (!columns.includes('addons')) return; // already dropped (idempotent re-run)

      const rows = db
        .prepare(
          `
        SELECT id, addons, created_at FROM order_items
        WHERE addons IS NOT NULL AND addons != '' AND addons != 'null'
          AND NOT EXISTS (SELECT 1 FROM order_item_addons WHERE order_item_id = order_items.id)
      `,
        )
        .all() as { id: number; addons: string; created_at: string }[];

      let backfilled = 0;
      const unrecoverable: number[] = [];
      for (const row of rows) {
        let parsed: any;
        try {
          parsed = JSON.parse(row.addons);
        } catch {
          unrecoverable.push(row.id);
          continue;
        }
        if (!Array.isArray(parsed) || parsed.length === 0) continue;
        insertOrderItemAddons(db, row.id, parsed, row.created_at || now());
        backfilled++;
      }
      console.log(
        `[MIGRATION v30] backfilled ${backfilled} order_item(s) still missing a normalized addons snapshot`,
      );

      if (unrecoverable.length > 0) {
        console.warn(
          `[MIGRATION v30] ${unrecoverable.length} order_item row(s) have unparseable legacy addons JSON (ids: ${unrecoverable.join(', ')}) and could not be migrated. Leaving the addons column in place so this data isn't lost — please review these rows manually.`,
        );
        return;
      }

      const remaining = (
        db
          .prepare(
            `
        SELECT COUNT(*) as count FROM order_items
        WHERE addons IS NOT NULL AND addons != '' AND addons != 'null'
          AND NOT EXISTS (SELECT 1 FROM order_item_addons WHERE order_item_id = order_items.id)
      `,
          )
          .get() as { count: number }
      ).count;

      if (remaining > 0) {
        console.warn(
          `[MIGRATION v30] ${remaining} order_item row(s) still lack a normalized addons snapshot after backfill — skipping the column drop this run.`,
        );
        return;
      }

      db.exec('ALTER TABLE order_items DROP COLUMN addons');
      console.log(
        '[MIGRATION v30] Dropped order_items.addons — order_item_addons is now the only place selected addons live.',
      );
    },
  },
  {
    version: 31,
    name: 'add_customers_tag_counts_column',
    up: () => {
      // tag_counts, like country_code (fixed in v23's guard above), only
      // ever existed in createSchema()'s CREATE TABLE — no migration added
      // it for installs whose customers table predates it. Unlike
      // country_code this isn't just a startup-migration crash: it's read
      // and written on every order for a returning customer
      // (routes/orders.ts), so any affected install would crash there
      // instead, mid-use rather than at launch.
      if (!getColumns(db, 'customers').includes('tag_counts')) {
        db.exec(`ALTER TABLE customers ADD COLUMN tag_counts TEXT DEFAULT NULL`);
      }
    },
  },
  {
    version: 32,
    name: 'add_kds_and_kot_printing_toggles',
    up: () => {
      // Independent on/off switches for the Kitchen Display System and for
      // KOT ticket printing (issue #133) — not every business runs both.
      // Default 'true' on both to match the pre-toggle always-on behavior
      // existing installs already have.
      insertSettingIfMissing('kds_enabled', 'true');
      insertSettingIfMissing('kot_printing_enabled', 'true');
    },
  },
  {
    version: 33,
    name: 'add_addon_groups_allow_multiple_quantities',
    up: () => {
      if (!getColumns(db, 'addon_groups').includes('allow_multiple_quantities')) {
        db.exec(`ALTER TABLE addon_groups ADD COLUMN allow_multiple_quantities INTEGER DEFAULT 0`);
      }
    },
  },
  {
    version: 34,
    name: 'add_order_items_voided_at',
    up: () => {
      // Issue #150: voiding an in-progress (preparing/ready) item marks it
      // status='voided' instead of hard-cancelling it, so the kitchen display
      // can show it struck-through for a grace period before it drops off the
      // board. voided_at is that timestamp anchor.
      if (!getColumns(db, 'order_items').includes('voided_at')) {
        db.exec(`ALTER TABLE order_items ADD COLUMN voided_at TEXT DEFAULT NULL`);
      }
    },
  },
  {
    version: 35,
    name: 'add_tax_pack_configuration_tables',
    up: () => {
      createTaxPackSchema();
    },
  },
  {
    version: 36,
    name: 'add_product_and_addon_tax_categories',
    up: () => {
      const productColumns = getColumns(db, 'products');
      if (!productColumns.includes('tax_category_id')) {
        db.exec(`ALTER TABLE products ADD COLUMN tax_category_id TEXT DEFAULT NULL`);
      }
      if (!productColumns.includes('tax_behavior')) {
        db.exec(`ALTER TABLE products ADD COLUMN tax_behavior TEXT DEFAULT 'country_default'`);
      }

      const addonColumns = getColumns(db, 'addons');
      if (!addonColumns.includes('tax_category_id')) {
        db.exec(`ALTER TABLE addons ADD COLUMN tax_category_id TEXT DEFAULT NULL`);
      }
      if (!addonColumns.includes('tax_behavior')) {
        db.exec(`ALTER TABLE addons ADD COLUMN tax_behavior TEXT DEFAULT 'country_default'`);
      }
      if (!addonColumns.includes('inherit_parent_tax_category')) {
        db.exec(`ALTER TABLE addons ADD COLUMN inherit_parent_tax_category INTEGER DEFAULT 1`);
      }
    },
  },
  {
    version: 37,
    name: 'add_transaction_tax_snapshots_and_charge_categories',
    up: () => {
      const orderColumns = getColumns(db, 'orders');
      if (!orderColumns.includes('tax_snapshot')) {
        db.exec(`ALTER TABLE orders ADD COLUMN tax_snapshot TEXT DEFAULT NULL`);
      }
      if (!orderColumns.includes('packaging_tax_category_id')) {
        db.exec(`ALTER TABLE orders ADD COLUMN packaging_tax_category_id TEXT DEFAULT NULL`);
      }
      if (!orderColumns.includes('delivery_tax_category_id')) {
        db.exec(`ALTER TABLE orders ADD COLUMN delivery_tax_category_id TEXT DEFAULT NULL`);
      }
      if (!orderColumns.includes('service_charge_tax_category_id')) {
        db.exec(`ALTER TABLE orders ADD COLUMN service_charge_tax_category_id TEXT DEFAULT NULL`);
      }

      if (!getColumns(db, 'order_items').includes('tax_snapshot')) {
        db.exec(`ALTER TABLE order_items ADD COLUMN tax_snapshot TEXT DEFAULT NULL`);
      }
      if (!getColumns(db, 'bills').includes('tax_snapshot')) {
        db.exec(`ALTER TABLE bills ADD COLUMN tax_snapshot TEXT DEFAULT NULL`);
      }
    },
  },
  {
    version: 38,
    name: 'register_bundled_tax_pack_versions',
    up: () => {
      createTaxPackSchema();
      const insertPack = db.prepare(`
        INSERT INTO country_packs (
          id, publisher, country, jurisdiction, active_version_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          publisher = excluded.publisher,
          country = excluded.country,
          jurisdiction = excluded.jurisdiction,
          active_version_id = COALESCE(country_packs.active_version_id, excluded.active_version_id),
          updated_at = excluded.updated_at
      `);
      const insertVersion = db.prepare(`
        INSERT OR IGNORE INTO country_pack_versions (
          id, pack_id, version, schema_version, manifest_json, pack_json, digest, signature,
          effective_from, effective_to, min_flo_version, published_at, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'active', ?)
      `);
      const insertCategory = db.prepare(`
        INSERT OR IGNORE INTO tax_categories (
          id, pack_version_id, category_id, label, default_behavior, definition_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertRule = db.prepare(`
        INSERT OR IGNORE INTO tax_rules (
          id, pack_version_id, rule_id, label, calculation_type, rate, amount,
          applies_per, base_rule_ids, definition_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const pack of BUNDLED_COUNTRY_PACKS) {
        const versionId = bundledPackVersionId(pack);
        const packJson = JSON.stringify(pack);
        const installedAt = now();
        const alreadyInstalled = db
          .prepare('SELECT 1 FROM country_pack_versions WHERE id = ?')
          .get(versionId);

        insertPack.run(
          pack.id,
          pack.publisher,
          pack.country,
          pack.jurisdiction,
          versionId,
          installedAt,
          installedAt,
        );
        insertVersion.run(
          versionId,
          pack.id,
          pack.version,
          pack.schemaVersion,
          JSON.stringify({
            id: pack.id,
            publisher: pack.publisher,
            country: pack.country,
            jurisdiction: pack.jurisdiction,
            version: pack.version,
            publishedAt: pack.publishedAt,
          }),
          packJson,
          sha256Hex(packJson),
          pack.effectiveFrom,
          pack.effectiveTo || null,
          pack.minFloVersion,
          pack.publishedAt,
          installedAt,
        );

        for (const category of pack.categories) {
          insertCategory.run(
            `${versionId}:category:${category.id}`,
            versionId,
            category.id,
            category.label,
            category.defaultBehavior || null,
            JSON.stringify(category),
            installedAt,
          );
        }
        for (const rule of pack.rules) {
          insertRule.run(
            `${versionId}:rule:${rule.id}`,
            versionId,
            rule.id,
            rule.label,
            rule.type,
            rule.rate || null,
            rule.amount || null,
            rule.appliesPer || null,
            JSON.stringify(rule.baseRuleIds || []),
            JSON.stringify(rule),
            installedAt,
          );
        }

        if (!alreadyInstalled) {
          db.prepare(
            `
            INSERT INTO tax_config_audit (
              action, pack_id, pack_version_id, details_json, created_at
            ) VALUES ('install_bundled_pack', ?, ?, ?, ?)
          `,
          ).run(
            pack.id,
            versionId,
            JSON.stringify({ source: 'application_bundle', version: pack.version }),
            installedAt,
          );
        }
      }
    },
  },
  {
    version: 39,
    name: 'add_users_tokens_valid_after',
    up: () => {
      // Backs the JWT-revocation-on-credential-change fix (#173): requireAuth
      // rejects any token whose `iat` predates this `tokens_valid_after`, so changing a
      // password/PIN can invalidate every outstanding session for that user
      // without maintaining a per-token blocklist across devices.
      if (!getColumns(db, 'users').includes('tokens_valid_after')) {
        db.exec(`ALTER TABLE users ADD COLUMN tokens_valid_after TEXT DEFAULT NULL`);
      }
    },
  },
  {
    version: 40,
    name: 'v2_cloud_defaults_and_tax_toggle',
    up: () => {
      // Seed-written timestamps use SQLite's format without T. An ISO
      // timestamp means the merchant explicitly changed the setting.
      db.prepare(
        `
        UPDATE settings
           SET value = '1', updated_at = ?
         WHERE key = 'cloud_sync_enabled'
           AND value = '0'
           AND updated_at NOT LIKE '%T%'
      `,
      ).run(now());
      db.prepare(`DELETE FROM settings WHERE key = 'cloud_pending_store_id'`).run();
      insertSettingIfMissing('taxes_enabled', 'false');
    },
  },
  {
    version: 41,
    name: 'support_ticket_outbox',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS support_ticket_outbox (
          client_ticket_id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'sending', 'delivered', 'failed')),
          support_code TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          delivered_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_support_ticket_outbox_retry
          ON support_ticket_outbox(status, next_attempt_at, created_at);
      `);
    },
  },
  {
    version: 42,
    name: 'add_global_cashback_percent',
    up: () => {
      insertSettingIfMissing('global_cashback_percent', '0');
      // Existing cb_percent values are deliberately left alone. Under the
      // tri-state, 0 means "earns nothing" and NULL means "inherit the global
      // rate" — and the old schema default was 0, so rewriting 0 to NULL here
      // would silently opt every product a merchant had excluded back into
      // earning the moment they set a global rate. Products created from here
      // on default to NULL; existing ones adopt the global rate only through
      // the explicit bulk action on the products screen.
    },
  },
  {
    version: 43,
    name: 'telemetry_default_on_for_new_installs',
    up: () => {
      // INSERT OR IGNORE, deliberately: an existing merchant's choice must
      // survive, including an earlier opt-out. Only installs that predate the
      // setting entirely pick up the new default here — every build released
      // so far shipped telemetry on, so this changes nothing for the current
      // fleet and simply keeps a fresh row consistent with seedInstallDefaults.
      const t = now();
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('telemetry_enabled', 'true', ?)`,
      ).run(t);
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('anonymous_data_consent', 'true', ?)`,
      ).run(t);
      db.prepare(
        `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('telemetry_scope', 'usage_stats,country,app_version,platform,session_duration,feature_usage,error_diagnostics', ?)`,
      ).run(t);
    },
  },
  {
    version: 44,
    name: 'store_diagnostics_outbox',
    up: () => {
      // This setting is migrated to the product default in v47. Keep the
      // original schema migration safe for databases upgrading through v44.
      insertSettingIfMissing('diagnostics_consent', 'true');
      db.exec(`
        CREATE TABLE IF NOT EXISTS store_diagnostics_outbox (
          event_id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'sending', 'delivered', 'failed')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          delivered_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_store_diagnostics_outbox_retry
          ON store_diagnostics_outbox(status, next_attempt_at, created_at);
      `);
    },
  },
  {
    // Performance fixes for ~100k+ orders (issue #208) plus timestamp
    // normalization, in one migration because v40 never shipped outside this
    // PR (upstream's v40-v44 landed first; this is v45). Indexes are all
    // `IF NOT EXISTS` so reruns are safe. Range queries
    // (`created_at >= ? AND created_at < ?`) and the composite used by the
    // orders list pagination both depend on the indexes.
    //
    // The normalization: `now()` used to write ISO-8601 (`...T10:00:00.123Z`)
    // while rows inserted via CURRENT_TIMESTAMP defaults carry SQLite's
    // `YYYY-MM-DD HH:MM:SS` form. Mixed formats break string range compares
    // at day boundaries, intra-day ORDER BY, `expires_at > datetime('now')`
    // expiry checks, and JS `new Date(ts)` parsing (the space form is read as
    // machine-local time). Normalize every legacy ISO row to the space form
    // once, so all rows in a column share one sortable, UTC-wall format.
    // Only rows containing 'T' are touched; each column is verified to exist
    // before the UPDATE so odd legacy installs cannot crash the migration.
    version: 45,
    name: 'add_performance_indexes_and_normalize_timestamps',
    up: () => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
        CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
        CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type);
        CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at);
        CREATE INDEX IF NOT EXISTS idx_bills_paid_status_paid_at ON bills(payment_status, paid_at);
        CREATE INDEX IF NOT EXISTS idx_bills_customer_id ON bills(customer_id);
        CREATE INDEX IF NOT EXISTS idx_print_logs_bill_id ON print_logs(bill_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_bill_id_type ON loyalty_ledger(bill_id, type);
        CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
        CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at);
        -- idx_bills_paid_at: payment-method breakdown scans paid_at ranges
        -- (including NULL for still-open bills); a plain single-column index
        -- lets the OR optimization use both branches.
        CREATE INDEX IF NOT EXISTS idx_bills_paid_at ON bills(paid_at);
      `);
      const normalize: [string, string][] = [
        ['orders', 'created_at'],
        ['orders', 'updated_at'],
        ['orders', 'cooking_started_at'],
        ['orders', 'ready_at'],
        ['orders', 'served_at'],
        ['orders', 'completed_at'],
        ['orders', 'cancelled_at'],
        ['order_items', 'created_at'],
        ['order_items', 'updated_at'],
        ['order_items', 'voided_at'],
        ['bills', 'created_at'],
        ['bills', 'updated_at'],
        ['bills', 'paid_at'],
        ['bills', 'printed_at'],
        ['customers', 'created_at'],
        ['customers', 'updated_at'],
        ['users', 'created_at'],
        ['users', 'updated_at'],
        ['users', 'terms_accepted_at'],
        ['users', 'tokens_valid_after'],
        ['loyalty_ledger', 'created_at'],
        ['loyalty_ledger', 'updated_at'],
        ['loyalty_ledger', 'expires_at'],
        ['products', 'created_at'],
        ['products', 'updated_at'],
        ['addons', 'created_at'],
        ['addons', 'updated_at'],
        ['addon_groups', 'created_at'],
        ['addon_groups', 'updated_at'],
        ['tables', 'created_at'],
        ['tables', 'updated_at'],
        ['settings', 'updated_at'],
        ['print_logs', 'printed_at'],
        ['order_item_addons', 'created_at'],
        ['whatsapp_messages', 'queued_at'],
        ['whatsapp_messages', 'seen_at'],
        ['whatsapp_messages', 'typing_at'],
        ['whatsapp_messages', 'sent_at'],
        ['whatsapp_messages', 'delivered_at'],
        ['whatsapp_messages', 'read_at'],
        ['whatsapp_messages', 'failed_at'],
        ['whatsapp_blocklist', 'blocked_at'],
        ['held_orders', 'created_at'],
        ['held_orders', 'updated_at'],
        ['kds_pairing_tokens', 'expires_at'],
        ['kds_pairing_tokens', 'created_at'],
        // Outbox tables (created by migrations v3/v41, before this one): rows
        // that failed pre-upgrade carry ISO next_attempt_at, which would sort
        // after space-form `now()` and defer retries by up to a day.
        ['cloud_sync_outbox', 'created_at'],
        ['cloud_sync_outbox', 'updated_at'],
        ['cloud_sync_outbox', 'next_attempt_at'],
        ['support_ticket_outbox', 'created_at'],
        ['support_ticket_outbox', 'updated_at'],
        ['support_ticket_outbox', 'next_attempt_at'],
        ['support_ticket_outbox', 'delivered_at'],
      ];
      for (const [table, column] of normalize) {
        if (!getColumns(db, table).includes(column)) continue;
        // '2026-08-01T10:00:00.123Z' -> '2026-08-01 10:00:00' (second precision,
        // matching now()/CURRENT_TIMESTAMP). Milliseconds are never relied on.
        db.prepare(
          `UPDATE ${table} SET ${column} = substr(REPLACE(${column}, 'T', ' '), 1, 19) WHERE ${column} LIKE '%T%'`,
        ).run();
      }
    },
  },
  {
    version: 46,
    name: 'normalize_cloud_enabled_flags_to_01',
    up: () => {
      // cloud_sync_enabled/cloud_orders_enabled/cloud_reports_enabled/
      // cloud_command_polling_enabled are meant to mirror FloAdmin's own
      // `stores` table and are read as a strict '1' check everywhere in
      // cloud-sync.ts — but both the setup wizard (auth.ts) and the Settings
      // → Cloud route wrote 'true'/'false' instead, so any store that ever
      // completed setup or saved that settings page silently never matched
      // the '1' check: cloud sync, order/report sync, command polling, and
      // RevFlo pairing's auto-registration all quietly stopped working.
      const flags = [
        'cloud_sync_enabled',
        'cloud_orders_enabled',
        'cloud_reports_enabled',
        'cloud_command_polling_enabled',
      ];
      const toOne = db.prepare(`UPDATE settings SET value = '1' WHERE key = ? AND value = 'true'`);
      const toZero = db.prepare(
        `UPDATE settings SET value = '0' WHERE key = ? AND value = 'false'`,
      );
      for (const key of flags) {
        toOne.run(key);
        toZero.run(key);
      }
    },
  },
  {
    version: 47,
    name: 'store_diagnostics_enabled_by_default',
    up: () => {
      // New installs already receive the v44/v47 default. Preserve an existing
      // false value because it may represent an owner's explicit opt-out.
      insertSettingIfMissing('diagnostics_consent', 'true');
    },
  },
  {
    version: 48,
    name: 'deactivate_reusable_demo_credentials',
    up: () => {
      // Only the bundled demo identities with the original public password are
      // affected. A merchant who changed one of these passwords keeps the user
      // active and retains their account.
      const changedAt = now();
      const demoUsers = db
        .prepare(
          `SELECT id, password FROM users WHERE id IN ('user-demo-manager', 'user-demo-cashier', 'user-demo-chef')`,
        )
        .all() as { id: string; password: string }[];
      const deactivate = db.prepare(
        'UPDATE users SET is_active = 0, tokens_valid_after = ?, updated_at = ? WHERE id = ?',
      );
      for (const user of demoUsers) {
        try {
          if (bcrypt.compareSync('demo12345', user.password))
            deactivate.run(changedAt, changedAt, user.id);
        } catch {
          // A corrupt legacy hash must not abort the migration or prevent the
          // rest of the database from opening.
          console.warn(`[DB] Could not inspect demo credential for ${user.id}`);
        }
      }
    },
  },
  {
    version: 49,
    name: 'add_payment_idempotency_records',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_idempotency (
          idempotency_key TEXT PRIMARY KEY,
          bill_id TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payment_idempotency_bill ON payment_idempotency(bill_id);
        CREATE TABLE IF NOT EXISTS payment_transaction_refs (
          method TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (method, transaction_id)
        );
        CREATE INDEX IF NOT EXISTS idx_payment_transaction_refs_bill ON payment_transaction_refs(bill_id);
        CREATE TABLE IF NOT EXISTS payment_transaction_ref_conflicts (
          method TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          detected_at TEXT NOT NULL
        );
      `);
      const rows = db
        .prepare('SELECT id, payment_details FROM bills WHERE payment_details IS NOT NULL')
        .all() as { id: string; payment_details: string }[];
      const insert = db.prepare(
        'INSERT OR IGNORE INTO payment_transaction_refs (method, transaction_id, bill_id, created_at) VALUES (?, ?, ?, ?)',
      );
      const conflictInsert = db.prepare(
        'INSERT INTO payment_transaction_ref_conflicts (method, transaction_id, bill_id, created_at, detected_at) VALUES (?, ?, ?, ?, ?)',
      );
      const seenRefs = new Map<string, { billId: string; createdAt: string }>();
      const detectedAt = now();
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.payment_details);
          const payments = Array.isArray(parsed) ? parsed : [parsed];
          for (const payment of payments) {
            if (
              payment &&
              typeof payment.method === 'string' &&
              typeof payment.transaction_id === 'string' &&
              payment.transaction_id.trim() !== ''
            ) {
              const createdAt = payment.timestamp || detectedAt;
              const key = `${payment.method}\u0000${payment.transaction_id}`;
              const previous = seenRefs.get(key);
              if (previous && previous.billId !== row.id)
                conflictInsert.run(
                  payment.method,
                  payment.transaction_id,
                  row.id,
                  previous.createdAt,
                  detectedAt,
                );
              else seenRefs.set(key, { billId: row.id, createdAt });
              insert.run(payment.method, payment.transaction_id, row.id, createdAt);
            }
          }
        } catch {
          // Invalid legacy payment JSON is handled at settlement time; it must
          // not prevent idempotency tables from being created.
        }
      }
    },
  },
  {
    version: 50,
    name: 'add_order_idempotency_records',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_idempotency (
          idempotency_key TEXT PRIMARY KEY,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 51,
    name: 'enforce_global_payment_transaction_refs',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_transaction_ref_conflicts (
          method TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          detected_at TEXT NOT NULL
        );
      `);
      const duplicateRows = db
        .prepare(
          `
        SELECT method, transaction_id, bill_id, created_at
        FROM payment_transaction_refs
        WHERE transaction_id IN (
          SELECT transaction_id FROM payment_transaction_refs
          GROUP BY transaction_id HAVING COUNT(*) > 1
        )
      `,
        )
        .all() as { method: string; transaction_id: string; bill_id: string; created_at: string }[];
      const recordConflict = db.prepare(`
        INSERT INTO payment_transaction_ref_conflicts (method, transaction_id, bill_id, created_at, detected_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const detectedAt = now();
      for (const row of duplicateRows)
        recordConflict.run(row.method, row.transaction_id, row.bill_id, row.created_at, detectedAt);
      db.exec(`
        CREATE TABLE payment_transaction_refs_global (
          transaction_id TEXT PRIMARY KEY,
          method TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      db.exec(`
        INSERT OR IGNORE INTO payment_transaction_refs_global (transaction_id, method, bill_id, created_at)
        SELECT transaction_id, method, bill_id, created_at
        FROM payment_transaction_refs
        ORDER BY created_at, bill_id;
        DROP TABLE payment_transaction_refs;
        ALTER TABLE payment_transaction_refs_global RENAME TO payment_transaction_refs;
        CREATE INDEX idx_payment_transaction_refs_bill ON payment_transaction_refs(bill_id);
      `);
    },
  },
  {
    version: 52,
    name: 'restore_method_scoped_transaction_refs',
    up: () => {
      // v51 temporarily collapsed references by transaction_id. Rebuild from
      // the authoritative payment snapshots as well as the collapsed table so
      // duplicate same-method references are audited rather than discarded.
      const recordConflict = db.prepare(`
        INSERT INTO payment_transaction_ref_conflicts (method, transaction_id, bill_id, created_at, detected_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const detectedAt = now();
      db.exec(`
        CREATE TABLE payment_transaction_refs_method (
          method TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (method, transaction_id)
        );
      `);
      const insertRef = db.prepare(`
        INSERT OR IGNORE INTO payment_transaction_refs_method
          (method, transaction_id, bill_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const findRef = db.prepare(
        'SELECT bill_id, created_at FROM payment_transaction_refs_method WHERE method = ? AND transaction_id = ?',
      );
      const addRef = (method: string, transactionId: string, billId: string, createdAt: string) => {
        const existing = findRef.get(method, transactionId) as
          { bill_id: string; created_at: string } | undefined;
        if (existing && String(existing.bill_id) !== String(billId)) {
          recordConflict.run(method, transactionId, billId, createdAt, detectedAt);
          return;
        }
        insertRef.run(method, transactionId, billId, createdAt);
      };
      const existingRefs = db
        .prepare('SELECT method, transaction_id, bill_id, created_at FROM payment_transaction_refs')
        .all() as { method: string; transaction_id: string; bill_id: string; created_at: string }[];
      for (const ref of existingRefs)
        addRef(ref.method, ref.transaction_id, ref.bill_id, ref.created_at);
      const rows = db
        .prepare(
          'SELECT id, payment_details FROM bills WHERE payment_details IS NOT NULL ORDER BY id',
        )
        .all() as { id: string; payment_details: string }[];
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.payment_details);
          const payments = Array.isArray(parsed) ? parsed : [parsed];
          for (const payment of payments) {
            if (
              !payment ||
              typeof payment.method !== 'string' ||
              typeof payment.transaction_id !== 'string' ||
              payment.transaction_id.trim() === ''
            )
              continue;
            addRef(
              payment.method,
              payment.transaction_id,
              String(row.id),
              payment.timestamp || detectedAt,
            );
          }
        } catch {
          // Invalid legacy JSON remains recoverable by the settlement path.
        }
      }
      db.exec(`
        DROP TABLE payment_transaction_refs;
        ALTER TABLE payment_transaction_refs_method RENAME TO payment_transaction_refs;
        CREATE INDEX idx_payment_transaction_refs_bill ON payment_transaction_refs(bill_id);
      `);
    },
  },
  {
    version: 53,
    name: 'scope_idempotency_records_to_user',
    up: () => {
      db.exec(`
        CREATE TABLE payment_idempotency_scoped (
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, idempotency_key)
        );
        CREATE TABLE order_idempotency_scoped (
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, idempotency_key)
        );
      `);
      const paymentRows = db
        .prepare(
          `
        SELECT p.idempotency_key, p.bill_id, p.request_hash, p.response_json, p.created_at,
               'legacy' AS user_id
        FROM payment_idempotency p
      `,
        )
        .all() as {
        idempotency_key: string;
        bill_id: string;
        request_hash: string;
        response_json: string;
        created_at: string;
        user_id: string;
      }[];
      const insertPayment = db.prepare(`
        INSERT INTO payment_idempotency_scoped
          (user_id, idempotency_key, bill_id, request_hash, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const row of paymentRows)
        insertPayment.run(
          row.user_id || 'legacy',
          row.idempotency_key,
          row.bill_id,
          row.request_hash,
          row.response_json,
          row.created_at,
        );

      const orderRows = db
        .prepare(
          'SELECT idempotency_key, request_hash, response_json, created_at FROM order_idempotency',
        )
        .all() as {
        idempotency_key: string;
        request_hash: string;
        response_json: string;
        created_at: string;
      }[];
      const insertOrder = db.prepare(`
        INSERT INTO order_idempotency_scoped
          (user_id, idempotency_key, request_hash, response_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const row of orderRows) {
        let userId = 'legacy';
        try {
          const response = JSON.parse(row.response_json);
          if (response?.order?.user_id != null) userId = String(response.order.user_id);
        } catch {
          // Keep the compatibility owner for malformed historical responses.
        }
        insertOrder.run(
          userId,
          row.idempotency_key,
          row.request_hash,
          row.response_json,
          row.created_at,
        );
      }
      db.exec(`
        DROP TABLE payment_idempotency;
        ALTER TABLE payment_idempotency_scoped RENAME TO payment_idempotency;
        CREATE INDEX idx_payment_idempotency_bill ON payment_idempotency(bill_id);
        DROP TABLE order_idempotency;
        ALTER TABLE order_idempotency_scoped RENAME TO order_idempotency;
      `);
    },
  },
  {
    version: 54,
    name: 'repair_retry_ownership_and_payment_reference_history',
    up: () => {
      // Repair databases that were opened by an intermediate v53 build before
      // ownership backfilling was added. Keep the compatibility owner only
      // when the historical record has no recoverable owner.
      const paymentRows = db
        .prepare(
          `
        SELECT p.idempotency_key,
               CAST(o.user_id AS TEXT) AS user_id
        FROM payment_idempotency p
        JOIN bills b ON b.id = p.bill_id
        JOIN orders o ON o.id = b.order_id
        WHERE p.user_id = 'legacy' AND o.user_id IS NOT NULL
      `,
        )
        .all() as { idempotency_key: string; user_id: string }[];
      const updatePayment = db.prepare(`
        UPDATE payment_idempotency SET user_id = ?
        WHERE user_id = 'legacy' AND idempotency_key = ?
          AND NOT EXISTS (
            SELECT 1 FROM payment_idempotency existing
            WHERE existing.idempotency_key = payment_idempotency.idempotency_key
              AND existing.user_id != 'legacy'
          )
      `);
      for (const row of paymentRows) updatePayment.run(row.user_id, row.idempotency_key);

      const orderRows = db
        .prepare(
          `
        SELECT idempotency_key, response_json
        FROM order_idempotency
        WHERE user_id = 'legacy'
      `,
        )
        .all() as { idempotency_key: string; response_json: string }[];
      const updateOrder = db.prepare(`
        UPDATE order_idempotency SET user_id = ?
        WHERE user_id = 'legacy' AND idempotency_key = ?
          AND NOT EXISTS (
            SELECT 1 FROM order_idempotency existing
            WHERE existing.idempotency_key = order_idempotency.idempotency_key
              AND existing.user_id != 'legacy'
          )
      `);
      for (const row of orderRows) {
        try {
          const response = JSON.parse(row.response_json);
          if (response?.order?.user_id != null)
            updateOrder.run(String(response.order.user_id), row.idempotency_key);
        } catch {
          // Leave malformed historical responses under the compatibility owner.
        }
      }

      // Reconstruct references from every bill snapshot. This repairs v51/v52
      // databases where a global transaction-id table collapsed cross-method
      // rows before method-scoped uniqueness was restored.
      const existingRefs = db
        .prepare('SELECT method, transaction_id, bill_id, created_at FROM payment_transaction_refs')
        .all() as { method: string; transaction_id: string; bill_id: string; created_at: string }[];
      const rows = db
        .prepare(
          'SELECT id, payment_details FROM bills WHERE payment_details IS NOT NULL ORDER BY id',
        )
        .all() as { id: string; payment_details: string }[];
      db.exec(`
        CREATE TABLE payment_transaction_refs_repaired (
          method TEXT NOT NULL,
          transaction_id TEXT NOT NULL,
          bill_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (method, transaction_id)
        );
      `);
      const insertRef = db.prepare(`
        INSERT OR IGNORE INTO payment_transaction_refs_repaired
          (method, transaction_id, bill_id, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const findRef = db.prepare(
        'SELECT bill_id FROM payment_transaction_refs_repaired WHERE method = ? AND transaction_id = ?',
      );
      const recordConflict = db.prepare(`
        INSERT INTO payment_transaction_ref_conflicts
          (method, transaction_id, bill_id, created_at, detected_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const detectedAt = now();
      const addRef = (method: string, transactionId: string, billId: string, createdAt: string) => {
        const existing = findRef.get(method, transactionId) as { bill_id: string } | undefined;
        if (existing && String(existing.bill_id) !== String(billId)) {
          recordConflict.run(method, transactionId, billId, createdAt, detectedAt);
          return;
        }
        insertRef.run(method, transactionId, billId, createdAt);
      };
      for (const ref of existingRefs)
        addRef(ref.method, ref.transaction_id, ref.bill_id, ref.created_at);
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.payment_details);
          const payments = Array.isArray(parsed) ? parsed : [parsed];
          for (const payment of payments) {
            if (
              !payment ||
              typeof payment.method !== 'string' ||
              typeof payment.transaction_id !== 'string' ||
              payment.transaction_id.trim() === ''
            )
              continue;
            addRef(
              payment.method,
              payment.transaction_id,
              String(row.id),
              payment.timestamp || detectedAt,
            );
          }
        } catch {
          // Invalid legacy JSON remains recoverable by the settlement path.
        }
      }
      db.exec(`
        DROP TABLE payment_transaction_refs;
        ALTER TABLE payment_transaction_refs_repaired RENAME TO payment_transaction_refs;
        CREATE INDEX idx_payment_transaction_refs_bill ON payment_transaction_refs(bill_id);
      `);
    },
  },
  {
    version: 55,
    name: 'durable_token_revocations',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS revoked_tokens (
          token_hash TEXT PRIMARY KEY,
          expires_at INTEGER NOT NULL,
          revoked_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
          ON revoked_tokens(expires_at);
      `);
    },
  },
  {
    version: 56,
    name: 'persist_station_assignment_scope',
    up: () => {
      if (!getColumns(db, 'users').includes('station_assignments_configured')) {
        db.exec(
          `ALTER TABLE users ADD COLUMN station_assignments_configured INTEGER NOT NULL DEFAULT 0`,
        );
      }
      db.exec(
        `UPDATE users SET station_assignments_configured = 1 WHERE EXISTS (SELECT 1 FROM station_users WHERE station_users.user_id = users.id)`,
      );
    },
  },
  {
    version: 57,
    name: 'rename_gstin_to_generic_tax_registration_number',
    up: () => {
      // "gstin"/"bill_show_gstn" were India-specific names for what is really
      // a generic tax-registration-number field usable by any country's tax
      // pack. Copy each business's existing value forward under the new key;
      // the old row is left in place (harmless) so nothing is lost if a
      // future build still reads it.
      const copyIfPresent = (oldKey: string, newKey: string) => {
        const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(oldKey) as
          { value: string } | undefined;
        if (existing) {
          db.prepare(
            'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          ).run(newKey, existing.value);
        }
      };
      copyIfPresent('gstin', 'tax_registration_number');
      copyIfPresent('bill_show_gstn', 'bill_show_tax_id');
    },
  },
  {
    version: 58,
    name: 'configurable_manual_payment_methods',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_payment_methods_active_sort ON payment_methods(is_active, sort_order, id);
        CREATE TABLE IF NOT EXISTS payment_method_merges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_name TEXT NOT NULL,
          target_name TEXT NOT NULL,
          affected_payments INTEGER NOT NULL DEFAULT 0,
          merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // UPI is not a default on new installations. Preserve it only for an
      // upgrading store that has actually recorded UPI payments before.
      const legacyUpi = db
        .prepare(
          `
        SELECT 1 FROM bills b, json_each(CASE
          WHEN json_valid(b.payment_details) AND json_type(b.payment_details) = 'array' THEN b.payment_details
          WHEN json_valid(b.payment_details) THEN json_array(b.payment_details)
          ELSE '[]' END) je
        WHERE lower(json_extract(je.value, '$.method')) = 'upi' LIMIT 1
      `,
        )
        .get();
      if (legacyUpi) {
        db.prepare(
          `INSERT OR IGNORE INTO payment_methods (name, is_active, sort_order, created_at, updated_at) VALUES ('UPI', 1, 10, ?, ?)`,
        ).run(now(), now());
        const upiId = Number(
          (
            db
              .prepare(`SELECT id FROM payment_methods WHERE name = 'UPI' COLLATE NOCASE`)
              .get() as { id: number }
          ).id,
        );
        const rows = db
          .prepare('SELECT id, payment_details FROM bills WHERE payment_details IS NOT NULL')
          .all() as any[];
        const update = db.prepare('UPDATE bills SET payment_details = ? WHERE id = ?');
        for (const row of rows) {
          let parsed: any;
          try {
            parsed = JSON.parse(row.payment_details);
          } catch {
            continue;
          }
          const lines = Array.isArray(parsed) ? parsed : [parsed];
          let changed = false;
          for (const line of lines) {
            if (line && String(line.method || '').toLowerCase() === 'upi') {
              line.method = 'UPI';
              line.payment_method_id = upiId;
              changed = true;
            }
          }
          if (changed) update.run(JSON.stringify(Array.isArray(parsed) ? lines : lines[0]), row.id);
        }
      }
    },
  },
  {
    version: 59,
    name: 'split_checks_by_item_quantity',
    up: () => {
      if (!getColumns(db, 'bills').includes('split_group_id'))
        db.exec('ALTER TABLE bills ADD COLUMN split_group_id TEXT');
      if (!getColumns(db, 'bills').includes('split_label'))
        db.exec('ALTER TABLE bills ADD COLUMN split_label TEXT');
      db.exec(`
        CREATE TABLE IF NOT EXISTS bill_items (
          bill_id INTEGER NOT NULL,
          order_item_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          PRIMARY KEY (bill_id, order_item_id),
          FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
          FOREIGN KEY (order_item_id) REFERENCES order_items(id)
        );
        CREATE INDEX IF NOT EXISTS idx_bill_items_order_item ON bill_items(order_item_id);
        CREATE INDEX IF NOT EXISTS idx_bills_split_group ON bills(split_group_id);
      `);
    },
  },
  {
    version: 60,
    name: 'seed_split_checks_disabled_setting',
    up: () => {
      // Existing stores were already initialized before split checks existed,
      // so the first-run setup default never runs for them. Keep the feature
      // opt-in by inserting the default only when no merchant choice exists.
      db.prepare(
        `
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES ('split_checks_enabled', 'false', ?)
      `,
      ).run(now());
    },
  },
  {
    version: 61,
    name: 'seed_server_app_enabled_setting',
    up: () => {
      // Match the Server App runtime default for upgraded stores while still
      // preserving any owner choice if the setting was already created.
      db.prepare(
        `
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES ('server_app_enabled', 'true', ?)
      `,
      ).run(now());
    },
  },
  {
    version: 62,
    name: 'normalize_cloud_last_error',
    up: () => {
      // Older builds persisted upstream error text here. It can contain
      // reflected credentials, so replace all legacy values before exposing
      // settings or exporting the database.
      db.prepare(
        `
        UPDATE settings
        SET value = 'Cloud service request failed', updated_at = ?
        WHERE key = 'cloud_last_error' AND value <> ''
      `,
      ).run(now());
    },
  },
  {
    version: 63,
    name: 'seed_printer_trim_decimals_setting',
    up: () => {
      // Keep receipt amount formatting unchanged for upgraded stores unless
      // the merchant explicitly enables trimmed decimals in printer settings.
      db.prepare(
        `
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES ('printer_trim_decimals', 'false', ?)
      `,
      ).run(now());
    },
  },
  {
    version: 64,
    name: 'drop_unused_printer_usb_device_path',
    up: () => {
      if (getColumns(db, 'printers').includes('usb_device_path')) {
        db.exec('ALTER TABLE printers DROP COLUMN usb_device_path');
      }
    },
  },
  {
    version: 65,
    name: 'seed_bill_content_visibility_settings',
    up: () => {
      const insert = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `);
      const defaults = [
        ['bill_show_name', 'true'],
        ['bill_show_address', 'true'],
        ['bill_show_phone', 'true'],
        ['bill_show_tax_id', 'false'],
        ['bill_show_tax_breakdown', 'true'],
        ['bill_show_customer_name', 'true'],
        ['bill_show_customer_phone', 'true'],
        ['bill_show_table_number', 'true'],
      ];
      for (const [key, value] of defaults) insert.run(key, value, now());
    },
  },
  {
    version: 66,
    name: 'seed_bill_template_settings',
    up: () => {
      const insert = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
      `);
      insert.run('bill_template', 'classic', now());
      insert.run('bill_footer_message', '', now());
    },
  },
  {
    version: 67,
    name: 'm2_explicit_privacy_consent_defaults',
    up: () => {
      // M2: New/pending installs must not transmit before explicit consent.
      // Operational installs (owner exists + onboarding complete) keep all stored
      // preferences — including legacy default-on 'true' (grandfathering).
      const userCount = (
        db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }
      ).count;
      const onboardingCompleted = getSettingValue('onboarding_completed') === 'true';
      if (userCount > 0 && onboardingCompleted) {
        return;
      }
      const t = now();
      const resetDefaultOn = (key: string) => {
        const existing = getSettingValue(key);
        if (existing === 'false') {
          return;
        }
        db.prepare(
          `
          INSERT INTO settings (key, value, updated_at) VALUES (?, 'pending', ?)
          ON CONFLICT(key) DO UPDATE SET value = 'pending', updated_at = excluded.updated_at
        `,
        ).run(key, t);
      };
      resetDefaultOn('telemetry_enabled');
      resetDefaultOn('diagnostics_consent');
      resetDefaultOn('anonymous_data_consent');
    },
  },
  {
    version: 68,
    name: 'm3_audit_logs_table',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id TEXT,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          result TEXT NOT NULL DEFAULT 'success',
          reason TEXT,
          metadata_json TEXT,
          terminal_id TEXT,
          request_id TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (actor_user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      `);
    },
  },
  {
    version: 69,
    name: 'm4_shift_foundation',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS shifts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          terminal_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
          opened_by_user_id TEXT NOT NULL,
          closed_by_user_id TEXT,
          opening_float_cents INTEGER NOT NULL DEFAULT 0 CHECK (opening_float_cents >= 0),
          opening_note TEXT,
          closing_note TEXT,
          counted_cash_cents INTEGER CHECK (counted_cash_cents IS NULL OR counted_cash_cents >= 0),
          opened_at TEXT NOT NULL,
          closed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (opened_by_user_id) REFERENCES users(id),
          FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open_per_terminal
          ON shifts(terminal_id) WHERE status = 'open';

        CREATE INDEX IF NOT EXISTS idx_shifts_terminal_id ON shifts(terminal_id);
        CREATE INDEX IF NOT EXISTS idx_shifts_opened_by ON shifts(opened_by_user_id);
        CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
        CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at);
        CREATE INDEX IF NOT EXISTS idx_shifts_closed_at ON shifts(closed_at);
        CREATE INDEX IF NOT EXISTS idx_shifts_terminal_closed ON shifts(terminal_id, closed_at);
      `);

      if (!getColumns(db, 'orders').includes('shift_id')) {
        db.exec('ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)');
      }
      if (!getColumns(db, 'bills').includes('shift_id')) {
        db.exec('ALTER TABLE bills ADD COLUMN shift_id INTEGER REFERENCES shifts(id)');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_orders_shift_id ON orders(shift_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_bills_shift_id ON bills(shift_id)');

      insertSettingIfMissing('shifts_enabled', 'false');
      insertSettingIfMissing('require_open_shift_for_cash', 'false');
      insertSettingIfMissing('shift_stale_hours', '24');
      insertSettingIfMissing('terminal_id', '');
    },
  },
  {
    version: 70,
    name: 'm5_cash_reconciliation_columns',
    up: () => {
      if (!getColumns(db, 'shifts').includes('expected_cash_cents')) {
        db.exec('ALTER TABLE shifts ADD COLUMN expected_cash_cents INTEGER');
      }
      if (!getColumns(db, 'shifts').includes('variance_cents')) {
        db.exec('ALTER TABLE shifts ADD COLUMN variance_cents INTEGER');
      }
    },
  },
  {
    version: 71,
    name: 'm5_day_closes',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS day_closes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          business_date TEXT NOT NULL,
          closed_by_user_id TEXT NOT NULL,
          summary_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(business_date),
          FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_day_closes_created_at ON day_closes(created_at);
      `);
    },
  },
  {
    version: 72,
    name: 'm6_refunds',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS refunds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bill_id INTEGER NOT NULL REFERENCES bills(id),
          order_id INTEGER REFERENCES orders(id),
          amount REAL NOT NULL,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          method TEXT NOT NULL,
          original_method TEXT NOT NULL,
          payment_method_id INTEGER,
          reason TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('completed')),
          shift_id INTEGER REFERENCES shifts(id),
          approved_by TEXT NOT NULL REFERENCES users(id),
          created_by TEXT NOT NULL REFERENCES users(id),
          idempotency_key TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_refunds_bill_id ON refunds(bill_id);
        CREATE INDEX IF NOT EXISTS idx_refunds_shift_id ON refunds(shift_id);
        CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);

        CREATE TABLE IF NOT EXISTS refund_idempotency (
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          bill_id INTEGER NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, idempotency_key)
        );
      `);
    },
  },
  {
    version: 73,
    name: 'p0_1_network_mode',
    up: () => {
      // Default localhost: Electron standalone works; LAN clients require an
      // explicit operator choice (kds_lan | lan). Invalid values are coerced
      // to localhost at read time — never silently bind 0.0.0.0.
      insertSettingIfMissing('network_mode', 'localhost');
    },
  },
  {
    version: 74,
    name: 'p0_2_jwt_secret_storage_marker',
    up: () => {
      // Marker only — actual secret migration to safeStorage runs at startup
      // via initializeJWTSecret() / migrateLegacyJWTSecret(). Do not seed
      // plaintext jwt_secret here.
      insertSettingIfMissing('jwt_secret_storage', 'legacy');
    },
  },
  {
    version: 75,
    name: 'p2_8_inventory_movements_ledger',
    up: () => {
      // Append-only inventory movement history. products.stock_quantity remains
      // the runtime current-state cache. No backfill — ledger starts empty at
      // migration time (pre-migration history is not reconstructable).
      db.exec(`
        CREATE TABLE IF NOT EXISTS inventory_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id TEXT NOT NULL,
          quantity_delta REAL NOT NULL,
          movement_type TEXT NOT NULL
            CHECK (movement_type IN ('sale', 'cancel_restore', 'adjustment')),
          reference_type TEXT,
          reference_id TEXT,
          reason TEXT,
          stock_after REAL NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created
          ON inventory_movements(product_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference
          ON inventory_movements(reference_type, reference_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
          ON inventory_movements(created_at);
      `);
    },
  },
  {
    version: 76,
    name: 'r2_table_assigned_waiter',
    up: () => {
      // R2 floor ops: optional waiter assignment on a table. Soft reference to
      // users.id (role waiter/cashier/manager/owner enforced in service layer).
      // Fresh installs may already have the column from createSchema — skip ALTER.
      const tableColumns = getColumns(db, 'tables');
      if (!tableColumns.includes('assigned_waiter_id')) {
        db.exec(`ALTER TABLE tables ADD COLUMN assigned_waiter_id TEXT`);
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tables_assigned_waiter
          ON tables(assigned_waiter_id);
      `);
    },
  },
  {
    version: 77,
    name: 'r3_kitchen_item_timestamps_and_priority',
    up: () => {
      // R3 Kitchen OS deepen: item-level kitchen timestamps + order priority.
      // Fresh installs may already have columns from createSchema — skip ALTER.
      const orderItemColumns = getColumns(db, 'order_items');
      if (!orderItemColumns.includes('preparing_started_at')) {
        db.exec(`ALTER TABLE order_items ADD COLUMN preparing_started_at TEXT`);
      }
      if (!orderItemColumns.includes('ready_at')) {
        db.exec(`ALTER TABLE order_items ADD COLUMN ready_at TEXT`);
      }
      if (!orderItemColumns.includes('served_at')) {
        db.exec(`ALTER TABLE order_items ADD COLUMN served_at TEXT`);
      }
      const orderColumns = getColumns(db, 'orders');
      if (!orderColumns.includes('kitchen_priority')) {
        db.exec(`ALTER TABLE orders ADD COLUMN kitchen_priority INTEGER DEFAULT 0`);
      }
    },
  },
  {
    version: 78,
    name: 'r4_inventory_os_units_idempotency_counts',
    up: () => {
      // R4 Inventory OS deepen: product unit, stock-adjust idempotency, stock counts.
      // Do NOT change inventory_movements CHECK types. Fresh installs may already
      // have inventory_unit from createSchema — skip ALTER.
      const productColumns = getColumns(db, 'products');
      if (!productColumns.includes('inventory_unit')) {
        db.exec(`ALTER TABLE products ADD COLUMN inventory_unit TEXT DEFAULT 'pcs'`);
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS stock_adjust_idempotency (
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          product_id TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, idempotency_key)
        );
        CREATE TABLE IF NOT EXISTS inventory_counts (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'draft',
          notes TEXT,
          created_by TEXT,
          created_at TEXT,
          updated_at TEXT,
          applied_at TEXT
        );
        CREATE TABLE IF NOT EXISTS inventory_count_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          count_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          system_qty REAL NOT NULL,
          counted_qty REAL NOT NULL,
          variance REAL NOT NULL,
          applied_movement_id INTEGER,
          UNIQUE(count_id, product_id),
          FOREIGN KEY (count_id) REFERENCES inventory_counts(id)
        );
        CREATE INDEX IF NOT EXISTS idx_inventory_count_lines_count
          ON inventory_count_lines(count_id);
        CREATE INDEX IF NOT EXISTS idx_stock_adjust_idempotency_product
          ON stock_adjust_idempotency(product_id);
      `);
    },
  },
  {
    version: 79,
    name: 'r5_bom_recipes_food_cost',
    up: () => {
      // R5 BOM / Recipes / Food Cost. Inventory movements CHECK unchanged —
      // recipe consume/restore use movement_type=adjustment + reason.
      db.exec(`
        CREATE TABLE IF NOT EXISTS recipes (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          name TEXT NOT NULL,
          yield_qty REAL NOT NULL DEFAULT 1,
          yield_unit TEXT NOT NULL DEFAULT 'pcs',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_by TEXT,
          updated_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_one_active_per_product
          ON recipes(product_id) WHERE is_active = 1;
        CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);

        CREATE TABLE IF NOT EXISTS recipe_ingredients (
          id TEXT PRIMARY KEY,
          recipe_id TEXT NOT NULL,
          ingredient_product_id TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          prep_loss_bps INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          UNIQUE(recipe_id, ingredient_product_id),
          FOREIGN KEY (recipe_id) REFERENCES recipes(id)
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe
          ON recipe_ingredients(recipe_id);

        CREATE TABLE IF NOT EXISTS recipe_consumptions (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          order_item_id INTEGER NOT NULL UNIQUE,
          recipe_id TEXT NOT NULL,
          recipe_name TEXT NOT NULL,
          menu_product_id TEXT NOT NULL,
          portions REAL NOT NULL,
          yield_qty REAL NOT NULL,
          status TEXT NOT NULL DEFAULT 'consumed',
          actor_user_id TEXT,
          created_at TEXT NOT NULL,
          reversed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_consumptions_order
          ON recipe_consumptions(order_id);

        CREATE TABLE IF NOT EXISTS recipe_consumption_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          consumption_id TEXT NOT NULL,
          ingredient_product_id TEXT NOT NULL,
          ingredient_name TEXT,
          quantity_delta REAL NOT NULL,
          unit TEXT NOT NULL,
          unit_cost_cents INTEGER,
          line_cost_cents INTEGER,
          inventory_movement_id INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (consumption_id) REFERENCES recipe_consumptions(id)
        );
        CREATE INDEX IF NOT EXISTS idx_recipe_consumption_lines_consumption
          ON recipe_consumption_lines(consumption_id);
      `);
    },
  },
  {
    version: 80,
    name: 'r6_purchasing_supplier_os',
    up: () => {
      // R6 Purchasing & Supplier OS. Inventory movements CHECK unchanged —
      // receiving uses movement_type=adjustment + reason=purchase_receipt.
      // New money fields use INTEGER cents; products.cost remains REAL (P0.3).
      db.exec(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          contact_name TEXT,
          phone TEXT,
          email TEXT,
          address TEXT,
          tax_id TEXT,
          notes TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

        CREATE TABLE IF NOT EXISTS supplier_products (
          id TEXT PRIMARY KEY,
          supplier_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          supplier_sku TEXT,
          purchase_unit TEXT NOT NULL,
          last_purchase_cost_cents INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(supplier_id, product_id),
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier
          ON supplier_products(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_supplier_products_product
          ON supplier_products(product_id);

        CREATE TABLE IF NOT EXISTS purchase_orders (
          id TEXT PRIMARY KEY,
          supplier_id TEXT NOT NULL,
          po_number TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL
            CHECK (status IN ('draft','ordered','partially_received','received','cancelled')),
          order_date TEXT,
          expected_date TEXT,
          notes TEXT,
          subtotal_cents INTEGER NOT NULL DEFAULT 0,
          tax_cents INTEGER NOT NULL DEFAULT 0,
          total_cents INTEGER NOT NULL DEFAULT 0,
          created_by TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
          ON purchase_orders(supplier_id);
        CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
          ON purchase_orders(status);

        CREATE TABLE IF NOT EXISTS purchase_order_lines (
          id TEXT PRIMARY KEY,
          purchase_order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          purchase_unit TEXT NOT NULL,
          ordered_qty REAL NOT NULL,
          unit_cost_cents INTEGER NOT NULL DEFAULT 0,
          tax_cents INTEGER NOT NULL DEFAULT 0,
          line_total_cents INTEGER NOT NULL DEFAULT 0,
          received_qty REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po
          ON purchase_order_lines(purchase_order_id);

        CREATE TABLE IF NOT EXISTS purchase_receipts (
          id TEXT PRIMARY KEY,
          purchase_order_id TEXT NOT NULL,
          received_at TEXT NOT NULL,
          received_by TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
        );
        CREATE INDEX IF NOT EXISTS idx_purchase_receipts_po
          ON purchase_receipts(purchase_order_id);

        CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
          id TEXT PRIMARY KEY,
          receipt_id TEXT NOT NULL,
          po_line_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity REAL NOT NULL,
          purchase_unit TEXT NOT NULL,
          unit_cost_cents INTEGER NOT NULL DEFAULT 0,
          inventory_qty REAL NOT NULL,
          movement_id INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id),
          FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines(id)
        );
        CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_receipt
          ON purchase_receipt_lines(receipt_id);

        CREATE TABLE IF NOT EXISTS purchase_receive_idempotency (
          user_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          purchase_order_id TEXT NOT NULL,
          request_hash TEXT NOT NULL,
          response_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, idempotency_key)
        );
      `);
    },
  },
  {
    version: 81,
    name: 'p0_3_money_dual_write_cents_phase1',
    up: () => {
      // P0.3 Phase 1 — additive INTEGER cents alongside REAL. No cutover.
      // Backfill with ROUND(real * 100). Readers may prefer cents when non-null.
      const productCols = getColumns(db, 'products');
      if (!productCols.includes('price_cents')) {
        db.exec(`ALTER TABLE products ADD COLUMN price_cents INTEGER`);
      }
      if (!productCols.includes('cost_cents')) {
        db.exec(`ALTER TABLE products ADD COLUMN cost_cents INTEGER`);
      }
      db.exec(`
        UPDATE products SET price_cents = CAST(ROUND(COALESCE(price, 0) * 100) AS INTEGER)
        WHERE price_cents IS NULL;
        UPDATE products SET cost_cents = CAST(ROUND(COALESCE(cost, 0) * 100) AS INTEGER)
        WHERE cost_cents IS NULL;
      `);

      const orderCols = getColumns(db, 'orders');
      for (const col of [
        'subtotal_cents',
        'tax_amount_cents',
        'discount_amount_cents',
        'delivery_charge_cents',
        'packaging_charge_cents',
        'total_cents',
      ]) {
        if (!orderCols.includes(col)) {
          db.exec(`ALTER TABLE orders ADD COLUMN ${col} INTEGER`);
        }
      }
      db.exec(`
        UPDATE orders SET
          subtotal_cents = CAST(ROUND(COALESCE(subtotal, 0) * 100) AS INTEGER),
          tax_amount_cents = CAST(ROUND(COALESCE(tax_amount, 0) * 100) AS INTEGER),
          discount_amount_cents = CAST(ROUND(COALESCE(discount_amount, 0) * 100) AS INTEGER),
          delivery_charge_cents = CAST(ROUND(COALESCE(delivery_charge, 0) * 100) AS INTEGER),
          packaging_charge_cents = CAST(ROUND(COALESCE(packaging_charge, 0) * 100) AS INTEGER),
          total_cents = CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER)
        WHERE total_cents IS NULL;
      `);

      const billCols = getColumns(db, 'bills');
      for (const col of [
        'subtotal_cents',
        'tax_amount_cents',
        'discount_amount_cents',
        'total_cents',
        'paid_amount_cents',
        'balance_cents',
      ]) {
        if (!billCols.includes(col)) {
          db.exec(`ALTER TABLE bills ADD COLUMN ${col} INTEGER`);
        }
      }
      db.exec(`
        UPDATE bills SET
          subtotal_cents = CAST(ROUND(COALESCE(subtotal, 0) * 100) AS INTEGER),
          tax_amount_cents = CAST(ROUND(COALESCE(tax_amount, 0) * 100) AS INTEGER),
          discount_amount_cents = CAST(ROUND(COALESCE(discount_amount, 0) * 100) AS INTEGER),
          total_cents = CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER),
          paid_amount_cents = CAST(ROUND(COALESCE(paid_amount, 0) * 100) AS INTEGER),
          balance_cents = CAST(ROUND(COALESCE(balance, 0) * 100) AS INTEGER)
        WHERE total_cents IS NULL;
      `);

      const itemCols = getColumns(db, 'order_items');
      for (const col of [
        'unit_price_cents',
        'subtotal_cents',
        'tax_amount_cents',
        'discount_amount_cents',
        'total_cents',
      ]) {
        if (!itemCols.includes(col)) {
          db.exec(`ALTER TABLE order_items ADD COLUMN ${col} INTEGER`);
        }
      }
      db.exec(`
        UPDATE order_items SET
          unit_price_cents = CAST(ROUND(COALESCE(unit_price, 0) * 100) AS INTEGER),
          subtotal_cents = CAST(ROUND(COALESCE(subtotal, 0) * 100) AS INTEGER),
          tax_amount_cents = CAST(ROUND(COALESCE(tax_amount, 0) * 100) AS INTEGER),
          discount_amount_cents = CAST(ROUND(COALESCE(discount_amount, 0) * 100) AS INTEGER),
          total_cents = CAST(ROUND(COALESCE(total, 0) * 100) AS INTEGER)
        WHERE total_cents IS NULL;
      `);
    },
  },
  {
    version: 82,
    name: 'r7_customer_crm_notes_and_segment_defaults',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_notes (
          id TEXT PRIMARY KEY,
          customer_id TEXT NOT NULL,
          body TEXT NOT NULL,
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        );
        CREATE INDEX IF NOT EXISTS idx_customer_notes_customer
          ON customer_notes(customer_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_customer_notes_active
          ON customer_notes(customer_id) WHERE deleted_at IS NULL;
      `);

      // Centralized CRM segment thresholds (JSON). Explainable defaults — not hard-coded in UI.
      insertSettingIfMissing(
        'crm_segment_rules',
        JSON.stringify({
          new_max_orders: 1,
          returning_min_orders: 2,
          loyal_min_orders: 5,
          frequent_min_orders: 8,
          frequent_window_days: 90,
          high_value_min_spend_cents: 100000,
          inactive_days: 60,
        }),
      );
    },
  },
  {
    version: 83,
    name: 'r9_expenses_os',
    up: () => {
      // R9 Slice 1 — café expenses (integer cents only; no REAL amount column).
      db.exec(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          category TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          notes TEXT,
          expense_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'posted'
            CHECK (status IN ('posted', 'voided')),
          created_by_user_id TEXT,
          updated_by_user_id TEXT,
          voided_by_user_id TEXT,
          voided_at TEXT,
          void_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (created_by_user_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_date
          ON expenses(expense_date DESC, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_expenses_status
          ON expenses(status);
        CREATE INDEX IF NOT EXISTS idx_expenses_category
          ON expenses(category);
        CREATE INDEX IF NOT EXISTS idx_expenses_created_by
          ON expenses(created_by_user_id);
      `);
    },
  },
  {
    version: 84,
    name: 'r10_table_qr_ordering',
    up: () => {
      // R10 — opaque per-table guest QR token + system attribution user (pay-at-counter).
      const cols = getColumns(db, 'tables');
      if (!cols.includes('qr_token')) {
        db.exec(`ALTER TABLE tables ADD COLUMN qr_token TEXT`);
      }
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_qr_token
          ON tables(qr_token) WHERE qr_token IS NOT NULL
      `);

      const ts = now();
      const password = bcrypt.hashSync(`qr-guest-disabled-${ts}`, 10);
      db.prepare(
        `INSERT OR IGNORE INTO users
          (id, name, email, password, role, is_active, created_at, updated_at)
         VALUES (?, 'QR Guest', 'qr-guest@system.local', ?, 'waiter', 0, ?, ?)`,
      ).run('usr-system-qr-guest', password, ts, ts);

      const tables = db
        .prepare(`SELECT id FROM tables WHERE qr_token IS NULL OR qr_token = ''`)
        .all() as {
        id: string;
      }[];
      const update = db.prepare(`UPDATE tables SET qr_token = ?, updated_at = ? WHERE id = ?`);
      for (const t of tables) {
        update.run(randomBytes(24).toString('base64url'), ts, t.id);
      }
    },
  },
  {
    version: 85,
    name: 'r11_coupons',
    up: () => {
      // R11 — marketing coupon codes (percent XOR fixed cents; apply via order discount path).
      db.exec(`
        CREATE TABLE IF NOT EXISTS coupons (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          percent_off INTEGER,
          amount_cents INTEGER,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          max_uses INTEGER,
          uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
          created_at TEXT NOT NULL,
          CHECK (
            (
              percent_off IS NOT NULL
              AND amount_cents IS NULL
              AND percent_off BETWEEN 1 AND 100
            )
            OR
            (
              amount_cents IS NOT NULL
              AND percent_off IS NULL
              AND amount_cents > 0
            )
          ),
          CHECK (max_uses IS NULL OR max_uses > 0)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_nocase
          ON coupons(code COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active);
      `);
    },
  },
  {
    version: 86,
    name: 'r13_print_jobs',
    up: () => {
      // R13 — durable print outbox (bill print failure + manual retry). Terminals/aggregators stay Frozen.
      db.exec(`
        CREATE TABLE IF NOT EXISTS print_jobs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'failed', 'done', 'cancelled')),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
          max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts >= 1),
          job_type TEXT NOT NULL DEFAULT 'bill',
          bill_id INTEGER,
          order_id INTEGER,
          payload_json TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          FOREIGN KEY (bill_id) REFERENCES bills(id)
        );
        CREATE INDEX IF NOT EXISTS idx_print_jobs_status_created
          ON print_jobs(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_print_jobs_bill_id
          ON print_jobs(bill_id);
      `);
    },
  },
  {
    version: 87,
    name: 'kds_h_delivery_outbox',
    up: () => {
      // KDS-H-OUTBOX — durable snapshot delivery intent. SQLite order_items remain SoR.
      db.exec(`
        CREATE TABLE IF NOT EXISTS kds_delivery_outbox (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL UNIQUE,
          job_type TEXT NOT NULL DEFAULT 'snapshot'
            CHECK (job_type IN ('snapshot')),
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'in_flight', 'done', 'failed', 'cancelled')),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
          max_attempts INTEGER NOT NULL DEFAULT 12 CHECK (max_attempts >= 1),
          order_id INTEGER,
          item_id INTEGER,
          payload_json TEXT,
          last_error TEXT,
          next_attempt_at TEXT NOT NULL,
          leased_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_kds_delivery_outbox_drain
          ON kds_delivery_outbox(status, next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_kds_delivery_outbox_event
          ON kds_delivery_outbox(event_id);
      `);
    },
  },
];
