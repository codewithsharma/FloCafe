/**
 * Opervia module registry — read-only queries over catalog + active vertical.
 * Dependency lists are metadata only (soft diagnostics in Phase 2.2; not fail-closed).
 */
import { getCatalogModule, MODULE_CATALOG, MODULE_IDS } from './catalog';
import {
  ACTIVE_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  VERTICALS,
} from './verticals';
import type { ModuleId, OperviaModule, VerticalDefinition } from './types';

export {
  MODULE_CATALOG,
  MODULE_IDS,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL,
  ACTIVE_VERTICAL_ID,
  VERTICALS,
};
export type { ModuleId, OperviaModule, VerticalDefinition };

export function listModules(): readonly OperviaModule[] {
  return MODULE_CATALOG;
}

export function getModule(id: string): OperviaModule | undefined {
  return getCatalogModule(id);
}

export function getActiveVerticalId(): string {
  return ACTIVE_VERTICAL_ID;
}

export function getVerticalDefinition(verticalId?: string): VerticalDefinition {
  const id = verticalId || ACTIVE_VERTICAL_ID;
  const found = VERTICALS.find((v) => v.id === id);
  if (!found) {
    // Phase 2.1: only Restaurant exists; unknown ids fall back to active vertical.
    return OPERVIA_RESTAURANT_VERTICAL;
  }
  return found;
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

/** Descriptive prefix → module map (does not change Express mounting). */
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
 * Unknown types fall back to restaurant (only supported vertical today).
 */
export function verticalIdForBusinessType(businessType: string | null | undefined): string {
  const normalized = String(businessType || 'restaurant').trim().toLowerCase();
  if (normalized === 'restaurant') return OPERVIA_RESTAURANT_VERTICAL_ID;
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
