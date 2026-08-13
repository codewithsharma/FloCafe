/**
 * Opervia Phase 2.1–2.6 — module contract (metadata only).
 * No lifecycle, installers, authorization engine, or package extraction.
 *
 * Capabilities describe what a module provides. They do NOT grant user access.
 * Authorization remains requireRole() / existing middleware.
 */

export type ModuleId =
  | 'core'
  | 'customer'
  | 'product'
  | 'category'
  | 'inventory'
  | 'pos'
  | 'order'
  | 'payment'
  | 'refund'
  | 'tax'
  | 'shift'
  | 'staff'
  | 'loyalty'
  | 'reporting'
  | 'printing'
  | 'notification'
  | 'backup'
  | 'tables'
  | 'kitchen'
  | 'kds'
  | 'menu'
  | 'addons';

/** Category for documentation / future filtering — not enforced. */
export type ModuleKind = 'core' | 'shared' | 'restaurant';

/**
 * Domain-level capability owned by exactly one module.
 * Pattern: `{domain}.{verb}` — not CRUD (no customer.create/read/update/delete).
 * Not authorization.
 */
export type CapabilityId =
  | 'platform.auth'
  | 'platform.settings'
  | 'platform.audit'
  | 'customer.manage'
  | 'product.manage'
  | 'category.manage'
  | 'inventory.stock'
  | 'pos.sell'
  | 'order.manage'
  | 'payment.tender'
  | 'refund.process'
  | 'tax.compute'
  | 'shift.operate'
  | 'staff.manage'
  | 'loyalty.operate'
  | 'reporting.view'
  | 'printing.output'
  | 'notification.deliver'
  | 'backup.operate'
  | 'tables.manage'
  | 'kitchen.stations'
  | 'kds.display'
  | 'menu.present'
  | 'addons.manage';

export const CAPABILITY_IDS: readonly CapabilityId[] = [
  'platform.auth',
  'platform.settings',
  'platform.audit',
  'customer.manage',
  'product.manage',
  'category.manage',
  'inventory.stock',
  'pos.sell',
  'order.manage',
  'payment.tender',
  'refund.process',
  'tax.compute',
  'shift.operate',
  'staff.manage',
  'loyalty.operate',
  'reporting.view',
  'printing.output',
  'notification.deliver',
  'backup.operate',
  'tables.manage',
  'kitchen.stations',
  'kds.display',
  'menu.present',
  'addons.manage',
] as const;

export interface OperviaModule {
  id: ModuleId;
  name: string;
  version: string;
  /** Module ids this capability conceptually depends on (soft diagnostics). */
  dependencies: ModuleId[];
  kind: ModuleKind;
  /**
   * Declared domain capabilities (discovery / ownership only).
   * Never used as authorization — see requireRole() / permissions docs.
   */
  capabilities: readonly CapabilityId[];
  /** Settings keys that further gate runtime availability (Phase 1 flags). */
  featureFlags?: string[];
  /** Descriptive API/route prefixes owned by this capability (no mount changes). */
  routePrefixes?: string[];
  description?: string;
}

/** Formal Phase 2.6 name; same shape as OperviaModule. */
export type ModuleDefinition = OperviaModule;

export interface VerticalDefinition {
  id: string;
  name: string;
  version: string;
  /** Modules composed into this vertical. */
  enabledModules: ModuleId[];
  description?: string;
}
