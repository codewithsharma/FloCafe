/**
 * Operavia module registry — read-only queries over catalog + active vertical.
 * Phase 3.1: unknown vertical ids fail closed (no silent restaurant fallback).
 * Soft diagnostics remain for logging; remount uses assertFailClosedComposition.
 */
import { getCatalogModule, MODULE_CATALOG, MODULE_IDS } from './catalog';
import {
  ACTIVE_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  VERTICALS,
} from './verticals';
import {
  OPERVIA_RETAIL_VERTICAL,
  OPERVIA_RETAIL_VERTICAL_ID,
  OPERVIA_RETAIL_ENABLED_MODULES,
} from './retail-vertical';
import {
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  OPERVIA_RETAIL_TEST_VERTICAL,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  SYNTHETIC_VERTICALS,
} from './fixtures/retail-test-vertical';
import { CompositionValidationError } from './errors';
import type {
  CapabilityId,
  ModuleId,
  ModuleDefinition,
  OperviaModule,
  VerticalDefinition,
} from './types';
import { CAPABILITY_IDS } from './types';

export { CompositionValidationError };

export {
  MODULE_CATALOG,
  MODULE_IDS,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL,
  ACTIVE_VERTICAL_ID,
  VERTICALS,
  OPERVIA_RETAIL_VERTICAL_ID,
  OPERVIA_RETAIL_VERTICAL,
  OPERVIA_RETAIL_ENABLED_MODULES,
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL,
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  SYNTHETIC_VERTICALS,
};
export type { ModuleId, OperviaModule, VerticalDefinition, CapabilityId, ModuleDefinition };
export { CAPABILITY_IDS };

export function getModuleCapabilities(moduleId: string): readonly CapabilityId[] {
  return getModule(moduleId)?.capabilities ?? [];
}

export function moduleOwnsCapability(moduleId: string, capability: CapabilityId): boolean {
  return getModuleCapabilities(moduleId).includes(capability);
}

/** Soft discovery: which enabled module owns this capability (if any). Not authz. */
export function findCapabilityOwner(
  capability: CapabilityId,
  verticalId?: string,
): ModuleId | undefined {
  for (const id of getEnabledModules(verticalId)) {
    if (moduleOwnsCapability(id, capability)) return id;
  }
  return undefined;
}

export function listModules(): readonly OperviaModule[] {
  return MODULE_CATALOG;
}

export function getModule(id: string): OperviaModule | undefined {
  return getCatalogModule(id);
}

/**
 * Resolve active vertical from a vertical-config-like module export.
 * Turbopack may mis-resolve registry's lazy `require('./vertical-config')` to a
 * sibling chunk that lacks `getCommittedActiveVerticalId` — callers must not
 * assume the named export exists (renderer crash: "t is not a function").
 */
export function resolveActiveVerticalIdFromConfigModule(
  verticalConfig: Partial<{ getCommittedActiveVerticalId: () => string }> | null | undefined,
  fallback: string = ACTIVE_VERTICAL_ID,
): string {
  if (verticalConfig && typeof verticalConfig.getCommittedActiveVerticalId === 'function') {
    return verticalConfig.getCommittedActiveVerticalId();
  }
  return fallback;
}

export function getActiveVerticalId(): string {
  // Phase 3.2: prefer committed deploy/start resolution (env), else resolve without lock.
  // Lazy require avoids load-time cycle with vertical-config → registry.
  try {
    const verticalConfig = require('./vertical-config') as Partial<
      typeof import('./vertical-config')
    >;
    return resolveActiveVerticalIdFromConfigModule(verticalConfig);
  } catch {
    return ACTIVE_VERTICAL_ID;
  }
}

/** Resolve a known production or synthetic vertical; throw if unknown. */
export function resolveKnownVertical(verticalId?: string): VerticalDefinition {
  let id: string;
  if (verticalId === undefined || verticalId === null) {
    id = getActiveVerticalId();
  } else {
    const trimmed = String(verticalId).trim();
    if (trimmed === '') {
      throw new CompositionValidationError(
        `Unknown vertical id: (empty). Fail-closed: refusing restaurant fallback.`,
      );
    }
    id = trimmed;
  }
  const found = VERTICALS.find((v) => v.id === id) || SYNTHETIC_VERTICALS.find((v) => v.id === id);
  if (!found) {
    throw new CompositionValidationError(
      `Unknown vertical id: ${id}. Fail-closed: refusing restaurant fallback.`,
    );
  }
  return found;
}

export function getVerticalDefinition(verticalId?: string): VerticalDefinition {
  return resolveKnownVertical(verticalId);
}

export function getEnabledModules(verticalId?: string): readonly ModuleId[] {
  return getVerticalDefinition(verticalId).enabledModules;
}

export function isModuleEnabled(moduleId: string, verticalId?: string): boolean {
  return getEnabledModules(verticalId).includes(moduleId as ModuleId);
}

/**
 * Module enabled by vertical AND runtime feature flag (when applicable).
 * Preserves Phase 1 semantics: flags still gate availability.
 */
export function isFeatureAvailable(
  moduleId: string,
  featureFlagEnabled: boolean,
  verticalId?: string,
): boolean {
  if (!isModuleEnabled(moduleId, verticalId)) return false;
  return featureFlagEnabled;
}

export function getModuleDependencies(moduleId: string): readonly ModuleId[] {
  const mod = getModule(moduleId);
  return mod ? mod.dependencies : [];
}

/** Descriptive prefix → module map (mounting uses getRouteMountPlan / registerRoutes). */
export function getRouteModuleMap(): Record<string, ModuleId> {
  const map: Record<string, ModuleId> = {};
  for (const mod of MODULE_CATALOG) {
    for (const prefix of mod.routePrefixes || []) {
      map[prefix] = mod.id;
    }
  }
  return map;
}

/**
 * Map Phase 1 business_type setting to a vertical id.
 * Production `retail` maps to retail. Synthetic fixtures (retail-test) are never
 * selected from business_type. Unknown types fall back to compile-time default.
 */
export function verticalIdForBusinessType(businessType: string | null | undefined): string {
  const normalized = String(businessType || 'restaurant')
    .trim()
    .toLowerCase();
  if (normalized === 'restaurant') return OPERVIA_RESTAURANT_VERTICAL_ID;
  if (normalized === 'retail') return OPERVIA_RETAIL_VERTICAL_ID;
  // Never map tenant business_type onto synthetic fixtures.
  return ACTIVE_VERTICAL_ID;
}

/** Lightweight diagnostics for static route registration coexistence. */
export function getPlatformCompositionSummary(): {
  verticalId: string;
  verticalName: string;
  enabledModuleCount: number;
  registeredModuleCount: number;
  routeMapSize: number;
} {
  const vertical = getVerticalDefinition();
  return {
    verticalId: vertical.id,
    verticalName: vertical.name,
    enabledModuleCount: vertical.enabledModules.length,
    registeredModuleCount: MODULE_CATALOG.length,
    routeMapSize: Object.keys(getRouteModuleMap()).length,
  };
}
