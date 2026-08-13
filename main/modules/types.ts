/**
 * Opervia Phase 2.1 — lightweight module contract (metadata only).
 * No lifecycle, installers, or package extraction.
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

export interface OperviaModule {
  id: ModuleId;
  name: string;
  version: string;
  /** Module ids this capability conceptually depends on (metadata; not enforced in 2.1). */
  dependencies: ModuleId[];
  kind: ModuleKind;
  /** Settings keys that further gate runtime availability (Phase 1 flags). */
  featureFlags?: string[];
  /** Descriptive API/route prefixes owned by this capability (no mount changes). */
  routePrefixes?: string[];
  description?: string;
}

export interface VerticalDefinition {
  id: string;
  name: string;
  version: string;
  /** Modules composed into this vertical. */
  enabledModules: ModuleId[];
  description?: string;
}
