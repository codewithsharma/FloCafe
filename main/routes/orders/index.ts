/**
 * Order HTTP routes — thin mount (foundation deepen).
 * Behavior lives in concern modules; no logic changes.
 */
import { Router } from 'express';
import { checkPinRateLimit } from '../orders-shared';
import { registerListRoutes } from './list';
import { registerCreateRoutes } from './create';
import { registerItemsRoutes } from './items';
import { registerStatusRoutes } from './status';
import { registerMutateRoutes } from './mutate';
import { registerDiscountRoutes } from './discount';
import { registerCancelRoutes } from './cancel';

const router = Router();
registerListRoutes(router);
registerCreateRoutes(router);
registerItemsRoutes(router);
registerStatusRoutes(router);
registerMutateRoutes(router);
registerDiscountRoutes(router);
registerCancelRoutes(router);

export const orderRoutes = router;
export { checkPinRateLimit };
