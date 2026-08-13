/**
 * Read-only Opervia platform endpoints (Phase 2.4).
 */
import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/security';
import { getPlatformCompositionResponse } from '../modules';

const router = Router();

router.get('/composition', requireRole('owner', 'manager'), (_req: Request, res: Response) => {
  try {
    res.json(getPlatformCompositionResponse());
  } catch (error: unknown) {
    console.error('[Platform] Composition snapshot failed:', error);
    res.status(500).json({ error: 'Could not load platform composition' });
  }
});

export { router as platformRoutes };
