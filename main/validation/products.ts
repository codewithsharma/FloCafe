/**
 * Product availability HTTP body schema (POST /products/:id/availability).
 * Toggles sellable flag only — never stock.
 */

import { z } from 'zod';

export const productAvailabilityBodySchema = z.object({
  is_active: z.boolean(),
});

export type ProductAvailabilityBody = z.infer<typeof productAvailabilityBodySchema>;
