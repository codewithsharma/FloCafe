/**
 * Phase 3.1 — Fail-closed composition validation + route mount planning.
 *
 * Soft diagnostics (Phase 2.2) remain for logging. Startup / remount uses
 * these helpers and must NOT silently fall back to restaurant or mount all.
 */
import { MODULE_CATALOG } from './catalog';
import { CompositionValidationError } from './errors';
import { getEnabledModules, resolveKnownVertical } from './registry';
import { validateEnabledSetDependencies, validateRegistryIntegrity } from './diagnostics';
import type { ModuleId } from './types';

export { CompositionValidationError } from './errors';

export interface FailClosedCompositionOptions {
  verticalId?: string;
  /**
   * Synthetic enabled set for tooling / Case E tests.
   * When set, vertical lookup is skipped; verticalId is labels-only.
   */
  enabledModules?: readonly ModuleId[];
}

export interface RouteMountPlan {
  verticalId: string;
  enabledModules: readonly ModuleId[];
  /** Catalog-backed prefixes that will be mounted. */
  mounted: string[];
  /** Catalog-backed prefixes skipped because owning module is disabled. */
  skipped: string[];
}

/** Resolve a vertical or throw — never falls back to restaurant. */
export function resolveVerticalDefinition(verticalId?: string) {
  return resolveKnownVertical(verticalId);
}

/**
 * Fail-closed gate used before Express remount / listen.
 * Unknown vertical, registry integrity failure, or missing module deps → throw.
 */
export function assertFailClosedComposition(options: FailClosedCompositionOptions = {}): {
  verticalId: string;
  enabledModules: readonly ModuleId[];
} {
  const integrity = validateRegistryIntegrity();
  if (!integrity.valid) {
    const detail = integrity.issues.map((i) => `${i.kind}: ${i.detail}`).join('; ');
    throw new CompositionValidationError(`Registry integrity failed (fail-closed): ${detail}`);
  }

  if (options.enabledModules) {
    const label = options.verticalId || 'synthetic-enabled-set';
    const deps = validateEnabledSetDependencies(options.enabledModules);
    if (!deps.valid) {
      const detail = deps.missing.map((m) => `${m.module} -> ${m.dependency}`).join('; ');
      throw new CompositionValidationError(
        `Invalid composition for ${label}: missing dependency ${detail}`,
      );
    }
    return { verticalId: label, enabledModules: options.enabledModules };
  }

  const vertical = resolveKnownVertical(options.verticalId);
  const deps = validateEnabledSetDependencies(vertical.enabledModules);
  if (!deps.valid) {
    const detail = deps.missing.map((m) => `${m.module} -> ${m.dependency}`).join('; ');
    throw new CompositionValidationError(
      `Invalid composition for vertical ${vertical.id}: missing dependency ${detail}`,
    );
  }

  return {
    verticalId: vertical.id,
    enabledModules: vertical.enabledModules,
  };
}

/**
 * Deterministic mount plan from catalog routePrefixes + enabled modules.
 * Always-on / uncatalogued mounts are handled separately in registerRoutes.
 */
export function getRouteMountPlan(verticalId?: string): RouteMountPlan {
  const vertical = resolveKnownVertical(verticalId);
  const enabled = new Set(getEnabledModules(vertical.id));
  const mounted: string[] = [];
  const skipped: string[] = [];

  for (const mod of MODULE_CATALOG) {
    const prefixes = mod.routePrefixes || [];
    for (const prefix of prefixes) {
      if (enabled.has(mod.id)) {
        mounted.push(prefix);
      } else {
        skipped.push(prefix);
      }
    }
  }

  mounted.sort();
  skipped.sort();
  return {
    verticalId: vertical.id,
    enabledModules: vertical.enabledModules,
    mounted,
    skipped,
  };
}

/** Whether a catalog module's HTTP prefixes should mount for this vertical. */
export function shouldMountModule(moduleId: ModuleId, verticalId?: string): boolean {
  return getEnabledModules(verticalId).includes(moduleId);
}
