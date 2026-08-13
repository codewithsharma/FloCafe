/**
 * Phase 2.10 — Tax HTTP routes (`/api/tax/*`).
 *
 * Owns tax domain HTTP only: preview + categories.
 * Pack lifecycle stays in tax-packs.ts; settings tax keys stay in settings.ts.
 * Calculations live in main/services/tax.ts / tax-engine — not here.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { getSettingValue } from '../db';
import {
  calculateTaxPreview,
  getActiveCountryPack,
  hasConfiguredTaxCategories,
  previewCategoryRate,
} from '../services/tax';

const router = Router();

// Tax preview — any authenticated role (global requireAuth). No requireRole.
router.post('/preview', (req: Request, res: Response) => {
  void calculateTaxPreview(req, res);
});

// Categories available under the store's active country pack — powers the
// product-page category selector. Read-only; pack activation/management
// (installing/updating a pack) remains on /api/tax-packs.
router.get('/categories', requireRole('owner', 'manager'), (req: Request, res: Response) => {
  try {
    const country = getSettingValue('country') || 'IN';
    const businessType = getSettingValue('business_type') || 'restaurant';
    const pack = getActiveCountryPack(country);
    const configurationReady = hasConfiguredTaxCategories(pack, businessType);
    res.json({
      pack_id: pack.id,
      country: pack.country,
      // The bundled generic pack deliberately has no rules. Exposing its
      // placeholder categories as assignable would migrate a product from
      // legacy tax to a zero-tax engine path.
      categories: configurationReady
        ? pack.categories.map((category) => {
          const preview = previewCategoryRate(pack, businessType, category.id);
          return {
            id: category.id,
            label: category.label,
            rate_percent: preview?.percent ?? null,
            rate_label: preview?.label ?? null,
          };
        })
        : [],
      default_category_id: configurationReady ? pack.defaultCategories.product : null,
      configuration_ready: configurationReady,
      unclassified_category_id: pack.unclassifiedCategoryId,
    });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const taxRoutes = router;
