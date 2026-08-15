import { Express, Router } from 'express';
import { authRoutes } from './auth';
import { requireRole } from '../middleware/security';
import { categoryRoutes } from './categories';
import { productRoutes } from './products';
import { addonGroupRoutes } from './addon-groups';
import { orderRoutes } from './orders';
import { orderItemRoutes } from './order-items';
import { billRoutes } from './bills';
import { tableRoutes } from './tables';
import { kitchenStationRoutes } from './kitchen-stations';
import { kitchenRoutes } from './kitchen';
import { customerRoutes, parseCustomer, getWalletBalance } from './customers';
import { staffRoutes } from './staff';
import { settingsRoutes } from './settings';
import { paymentMethodRoutes } from './payment-methods';
import { reportRoutes } from './reports';
import { kdsRoutes } from './kds';
import { kdsInfoRoutes } from './kds-info';
import { posInfoRoutes } from './pos-info';
import { serverAppInfoRoutes } from './server-app-info';
import { moreAppsRoutes } from './more-apps';
import { printerRoutes } from './printers';
import { databaseRoutes } from './database';
import { databaseToolsRoutes } from './database-tools';
import { menuCsvRoutes } from './menu-csv';
import { taxPackRoutes } from './tax-packs';
import { taxRoutes } from './tax';
import { inventoryRoutes } from './inventory';
import { recipeRoutes } from './recipes';
import { purchasingRoutes } from './purchasing';
import { heldOrderRoutes } from './held-orders';
import { whatsappRoutes } from './whatsapp';
import { supportTicketRoutes } from './support-ticket';
import { auditLogRoutes } from './audit-logs';
import { platformRoutes } from './platform';
import { shiftRoutes } from './shifts';
import { refundRoutes } from './refunds';
import { refundRestockRoutes } from './refund-restock';
import { getDatabase, getSettingValue, getCachedPairingCode, setCachedPairingCode } from '../db';
import {
  assertFailClosedComposition,
  getPlatformCompositionSummary,
  logCompositionSnapshotIfDev,
  shouldMountModule,
  type ModuleId,
} from '../modules';
import { cloudSync } from '../services/cloud-sync';
import { parsePhoneE164, stripPhoneDigits } from '../lib/phone';
import QRCode from 'qrcode';

// "Cloud POS is not registered" (thrown synchronously by cloud-sync.ts's
// signedFetch, no network call even attempted) means this store was never
// claimed in FloAdmin — a distinct, actionable state from a genuine
// connectivity failure reaching FloAdmin, and the two need different status
// codes/messages so the frontend (and anyone reading server logs) doesn't
// mistake "not claimed yet" for "FloAdmin is down".
function isUnregisteredCloudError(error: any): boolean {
  return typeof error?.message === 'string' && error.message.includes('is not registered');
}

function mobilePairingErrorStatus(error: any): number {
  return isUnregisteredCloudError(error) ? 409 : 502;
}

function mobilePairingErrorMessage(error: any): string {
  if (isUnregisteredCloudError(error)) {
    return 'This POS hasn’t been claimed in FloAdmin yet. Complete registration in FloAdmin, then try generating a pairing code again.';
  }
  return error?.message || 'Could not reach FloAdmin';
}

export interface RegisterRoutesOptions {
  /**
   * Vertical composition for mount decisions.
   * Defaults to committed deploy/start vertical (ACTIVE_VERTICAL_ID env),
   * falling back to restaurant when unset.
   * Tests may pass retail-test to prove restaurant routes are absent.
   */
  verticalId?: string;
}

export function registerRoutes(app: Express, options: RegisterRoutesOptions = {}): void {
  // Phase 3.1 — fail-closed composition validation before any mounts.
  // Phase 3.2 — default vertical comes from commitActiveVerticalFromEnv / env.
  const { getCommittedActiveVerticalId } =
    require('../modules/vertical-config') as typeof import('../modules/vertical-config');
  const verticalId = options.verticalId ?? getCommittedActiveVerticalId();
  assertFailClosedComposition({ verticalId });

  void getPlatformCompositionSummary();
  logCompositionSnapshotIfDev({ verticalId });

  const mount = (prefix: string, router: Router, moduleId: ModuleId | null): void => {
    // null = always-on platform/ops surface (not vertical-gated).
    if (moduleId !== null && !shouldMountModule(moduleId, verticalId)) {
      return;
    }
    app.use(prefix, router);
  };

  // Auth / core
  mount('/api/auth', authRoutes, 'core');
  mount('/api/settings', settingsRoutes, 'core');
  mount('/api/audit-logs', auditLogRoutes, 'core');

  // Shared commerce
  mount('/api/categories', categoryRoutes, 'category');
  mount('/api/products', productRoutes, 'product');
  mount('/api/orders', orderRoutes, 'order');
  mount('/api/order-items', orderItemRoutes, 'order');
  mount('/api/held-orders', heldOrderRoutes, 'order');
  mount('/api/bills', billRoutes, 'payment');
  mount('/api/bills', refundRoutes, 'refund');
  mount('/api/refunds', refundRoutes, 'refund');
  mount('/api/refunds', refundRestockRoutes, 'refund');
  mount('/api/payment-methods', paymentMethodRoutes, 'payment');
  mount('/api/customers', customerRoutes, 'customer');
  mount('/api/staff', staffRoutes, 'staff');
  mount('/api/users', staffRoutes, 'staff');
  mount('/api/reports', reportRoutes, 'reporting');
  mount('/api/pos-info', posInfoRoutes, 'pos');
  mount('/api/printers', printerRoutes, 'printing');
  mount('/api/db', databaseRoutes, 'backup');
  mount('/api/db-tools', databaseToolsRoutes, 'backup');
  mount('/api/tax-packs', taxPackRoutes, 'tax');
  mount('/api/tax', taxRoutes, 'tax');
  mount('/api/inventory', inventoryRoutes, 'inventory');
  mount('/api/recipes', recipeRoutes, 'inventory');
  mount('/api/purchasing', purchasingRoutes, 'inventory');
  mount('/api/whatsapp', whatsappRoutes, 'notification');
  mount('/api/shifts', shiftRoutes, 'shift');

  // Restaurant-only — omitted when module disabled (e.g. retail-test)
  mount('/api/addon-groups', addonGroupRoutes, 'addons');
  mount('/api/kitchen', kitchenRoutes, 'kitchen');
  mount('/api/kitchen-stations', kitchenStationRoutes, 'kitchen');
  mount('/api/tables', tableRoutes, 'tables');
  mount('/api/kds', kdsRoutes, 'kds');
  mount('/api/kds-info', kdsInfoRoutes, 'kds');
  mount('/api/menu-csv', menuCsvRoutes, 'menu');

  // Always-on platform / ops (uncatalogued or cross-cutting)
  mount('/api/server-app-info', serverAppInfoRoutes, null);
  mount('/api/more-apps', moreAppsRoutes, null);
  mount('/api/support-ticket', supportTicketRoutes, null);
  mount('/api/platform', platformRoutes, null);

  // Mobile pairing code — proxies FloAdmin (see cloud-sync.ts generatePairingCode).
  // Cache-first: repeat GETs (e.g. reopening Settings) must NOT generate a new
  // code or disconnect paired devices — only a stale/missing cache calls out.
  app.get('/api/mobile/pairing-code', requireRole('owner'), async (req, res) => {
    try {
      const cached = getCachedPairingCode();
      if (cached) {
        return res.json({
          pairing_code: cached.code,
          expires_at: cached.expiresAt,
          qr_data_url: await QRCode.toDataURL(cached.code, {
            errorCorrectionLevel: 'M',
            width: 256,
          }),
        });
      }
      const { code, expires_at } = await cloudSync.generatePairingCode(false);
      setCachedPairingCode(code, expires_at);
      res.json({
        pairing_code: code,
        expires_at,
        qr_data_url: await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', width: 256 }),
      });
    } catch (error: any) {
      res.status(mobilePairingErrorStatus(error)).json({ error: mobilePairingErrorMessage(error) });
    }
  });

  // Explicit rotate — disconnects every currently-paired RevFlo device.
  app.post('/api/mobile/rotate-code', requireRole('owner'), async (req, res) => {
    try {
      const { code, expires_at } = await cloudSync.generatePairingCode(true);
      setCachedPairingCode(code, expires_at);
      res.json({
        pairing_code: code,
        expires_at,
        qr_data_url: await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', width: 256 }),
      });
    } catch (error: any) {
      res.status(mobilePairingErrorStatus(error)).json({ error: mobilePairingErrorMessage(error) });
    }
  });

  // Paired RevFlo devices for this store — Settings > Mobile App session list.
  app.get('/api/mobile/devices', requireRole('owner'), async (req, res) => {
    try {
      const devices = await cloudSync.listPairedDevices();
      res.json({ devices });
    } catch (error: any) {
      console.error('[API] FloAdmin request failed:', error);
      res.status(502).json({ error: 'Could not reach FloAdmin' });
    }
  });

  // Legacy/flat customer search endpoint (frontend uses this)
  app.get(
    '/api/customers-search',
    requireRole('owner', 'manager', 'cashier', 'waiter'),
    (req, res) => {
      try {
        const { q } = req.query;
        if (!q || String(q).length < 2) {
          return res.json([]);
        }

        const db = getDatabase();
        const searchTerm = `%${q}%`;

        const customers = db
          .prepare(
            `
        SELECT * FROM customers
        WHERE is_active = 1 AND (phone_digits LIKE ? OR name LIKE ? OR email LIKE ?)
        ORDER BY name LIMIT 20
      `,
          )
          .all(searchTerm, searchTerm, searchTerm) as any[];

        const results = customers.map((c) => ({
          ...parseCustomer(c),
          wallet_balance: getWalletBalance(c.id),
        }));

        res.json(results);
      } catch (error: any) {
        console.error('[API] Internal error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // CRM lookup endpoint (frontend uses this)
  app.get('/api/crm/lookup', requireRole('owner', 'manager', 'cashier', 'waiter'), (req, res) => {
    try {
      const { phone, country_code } = req.query;
      if (!phone) {
        return res.status(400).json({ error: 'Phone number required' });
      }

      const db = getDatabase();
      const tenantCountry = getSettingValue('country') || 'IN';
      const parsed = parsePhoneE164(String(phone).trim(), tenantCountry);
      const lookupPhone = parsed ? parsed.e164 : String(phone).trim();
      const phoneDigits = stripPhoneDigits(lookupPhone);

      const customer = db
        .prepare('SELECT * FROM customers WHERE phone_digits = ?')
        .get(phoneDigits);

      if (customer) {
        res.json({ found: true, customer });
      } else {
        res.json({ found: false, customer: null });
      }
    } catch (error: any) {
      console.error('[API] Internal error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}
