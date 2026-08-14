/**
 * Shared commerce module set used by production Retail and synthetic retail-test.
 * Excludes restaurant-only modules (tables, kitchen, kds, menu, addons).
 */
import type { ModuleId } from './types';

export const OPERVIA_SHARED_COMMERCE_MODULES: readonly ModuleId[] = [
  'core',
  'customer',
  'product',
  'category',
  'inventory',
  'pos',
  'order',
  'payment',
  'refund',
  'tax',
  'shift',
  'staff',
  'loyalty',
  'reporting',
  'printing',
  'notification',
  'backup',
] as const;
