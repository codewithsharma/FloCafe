/**
 * Facade for order routes (keeps `require('../main/routes/orders')` stable).
 * Implementation lives in `main/routes/orders/*.ts`.
 */
export { orderRoutes, checkPinRateLimit } from './orders/index';
