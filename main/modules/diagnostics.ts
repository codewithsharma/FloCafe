/**
 * Phase 2.2 — soft dependency diagnostics + registry integrity.
 * Read-only, deterministic, non-blocking. Never fail-closed at startup.
 */
import { MODULE_CATALOG, MODULE_IDS } from './catalog';
import { VERTICALS } from './verticals';
import {
  getModule,
  getModuleDependencies,
  getVerticalDefinition,
} from './registry';
import type { ModuleId } from './types';

export interface MissingDependency {
  module: ModuleId;
  dependency: ModuleId;
}

export interface VerticalDependencyReport {
  verticalId: string;
  valid: boolean;
  missing: MissingDependency[];
  enabledModuleCount: number;
}

export type RegistryIntegrityIssueKind =
  | 'duplicate_module_id'
  | 'unknown_dependency'
  | 'unknown_vertical_module'
  | 'duplicate_vertical_module'
  | 'circular_dependency';

export interface RegistryIntegrityIssue {
  kind: RegistryIntegrityIssueKind;
  detail: string;
  module?: string;
  dependency?: string;
  cycle?: string[];
}

export interface RegistryIntegrityReport {
  valid: boolean;
  issues: RegistryIntegrityIssue[];
}

function compareMissing(a: MissingDependency, b: MissingDependency): number {
  const byModule = a.module.localeCompare(b.module);
  if (byModule !== 0) return byModule;
  return a.dependency.localeCompare(b.dependency);
}

/**
 * Direct (non-transitive) check: each enabled module's declared deps ⊆ enabled set.
 * Used by tests and by validateVerticalDependencies.
 */
export function validateEnabledSetDependencies(
  enabledModules: readonly ModuleId[],
): Pick<VerticalDependencyReport, 'valid' | 'missing' | 'enabledModuleCount'> {
  const enabled = new Set(enabledModules);
  const missing: MissingDependency[] = [];

  for (const moduleId of [...enabledModules].sort()) {
    for (const dependency of getModuleDependencies(moduleId)) {
      if (!enabled.has(dependency)) {
        missing.push({ module: moduleId, dependency });
      }
    }
  }

  missing.sort(compareMissing);
  return {
    valid: missing.length === 0,
    missing,
    enabledModuleCount: enabledModules.length,
  };
}

/** Soft check for a vertical's enabled module set. Never throws. */
export function validateVerticalDependencies(
  verticalId?: string,
): VerticalDependencyReport {
  const vertical = getVerticalDefinition(verticalId);
  const result = validateEnabledSetDependencies(vertical.enabledModules);
  return {
    verticalId: vertical.id,
    ...result,
  };
}

/**
 * DFS cycle detection over an adjacency map.
 * Exported for unit tests with synthetic graphs.
 */
export function detectDependencyCycles(
  adjacency: Map<string, readonly string[]>,
): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();

  for (const id of adjacency.keys()) {
    color.set(id, WHITE);
  }

  function normalizeCycle(path: string[]): string[] {
    if (path.length === 0) return path;
    let minIdx = 0;
    for (let i = 1; i < path.length; i++) {
      if (path[i]! < path[minIdx]!) minIdx = i;
    }
    return [...path.slice(minIdx), ...path.slice(0, minIdx)];
  }

  function dfs(u: string, stack: string[]): void {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adjacency.get(u) || []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(v);
        if (start >= 0) {
          const raw = stack.slice(start);
          const normalized = normalizeCycle(raw);
          const key = normalized.join('→');
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key);
            cycles.push(normalized);
          }
        }
      } else if (c === WHITE) {
        dfs(v, stack);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  }

  for (const id of [...adjacency.keys()].sort()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      dfs(id, []);
    }
  }

  return cycles;
}

export function validateRegistryIntegrity(options?: {
  detectCycles?: boolean;
}): RegistryIntegrityReport {
  const issues: RegistryIntegrityIssue[] = [];
  const seenIds = new Set<string>();

  for (const mod of MODULE_CATALOG) {
    if (seenIds.has(mod.id)) {
      issues.push({
        kind: 'duplicate_module_id',
        detail: `Duplicate module id: ${mod.id}`,
        module: mod.id,
      });
    }
    seenIds.add(mod.id);

    for (const dep of mod.dependencies) {
      if (!getModule(dep)) {
        issues.push({
          kind: 'unknown_dependency',
          detail: `Module ${mod.id} depends on unregistered ${dep}`,
          module: mod.id,
          dependency: dep,
        });
      }
    }
  }

  for (const id of MODULE_IDS) {
    if (!seenIds.has(id)) {
      issues.push({
        kind: 'unknown_dependency',
        detail: `MODULE_IDS entry ${id} missing from catalog`,
        module: id,
      });
    }
  }

  for (const vertical of VERTICALS) {
    const seenEnabled = new Set<string>();
    for (const moduleId of vertical.enabledModules) {
      if (seenEnabled.has(moduleId)) {
        issues.push({
          kind: 'duplicate_vertical_module',
          detail: `Vertical ${vertical.id} lists ${moduleId} more than once`,
          module: moduleId,
        });
      }
      seenEnabled.add(moduleId);
      if (!getModule(moduleId)) {
        issues.push({
          kind: 'unknown_vertical_module',
          detail: `Vertical ${vertical.id} enables unknown module ${moduleId}`,
          module: moduleId,
        });
      }
    }
  }

  if (options?.detectCycles !== false) {
    const adjacency = new Map<string, readonly string[]>();
    for (const mod of MODULE_CATALOG) {
      adjacency.set(mod.id, mod.dependencies);
    }
    for (const cycle of detectDependencyCycles(adjacency)) {
      issues.push({
        kind: 'circular_dependency',
        detail: `Circular dependency: ${cycle.join(' → ')}`,
        cycle,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Dev-friendly multi-line diagnostics string. Pure — no console side effects.
 * Optional `override` lets callers format synthetic reports (tests / tooling).
 */
export function formatModuleDiagnosticsLog(
  verticalId?: string,
  override?: Pick<VerticalDependencyReport, 'valid' | 'missing' | 'enabledModuleCount' | 'verticalId'>,
): string {
  const vertical = override
    ? {
        verticalId: override.verticalId || verticalId || getVerticalDefinition().id,
        valid: override.valid,
        missing: override.missing,
        enabledModuleCount: override.enabledModuleCount,
      }
    : validateVerticalDependencies(verticalId);
  const integrity = validateRegistryIntegrity();
  const lines: string[] = [];

  lines.push(`[Opervia Modules]`);
  lines.push(`Vertical: ${vertical.verticalId}`);
  lines.push(`Modules: ${vertical.enabledModuleCount}`);

  if (vertical.valid) {
    lines.push(`Dependencies: valid`);
  } else {
    lines.push(`Dependency warnings:`);
    for (const m of vertical.missing) {
      lines.push(`- ${m.module} -> ${m.dependency}`);
    }
  }

  if (!integrity.valid) {
    lines.push(`Integrity warnings:`);
    for (const issue of integrity.issues) {
      lines.push(`- ${issue.kind}: ${issue.detail}`);
    }
  }

  return lines.join('\n');
}

/** Convenience snapshot for boot logging / tests. Never throws. */
export function getModuleDiagnosticsSnapshot(verticalId?: string): {
  vertical: VerticalDependencyReport;
  integrity: RegistryIntegrityReport;
} {
  return {
    vertical: validateVerticalDependencies(verticalId),
    integrity: validateRegistryIntegrity(),
  };
}

/** True when process should emit soft module diagnostics (never production spam). */
export function shouldLogModuleDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** Log soft diagnostics once when appropriate. Never throws / never blocks. */
export function logModuleDiagnosticsIfDev(verticalId?: string): void {
  if (!shouldLogModuleDiagnostics()) return;
  try {
    // eslint-disable-next-line no-console -- intentional development diagnostics
    console.info(formatModuleDiagnosticsLog(verticalId));
  } catch {
    // Soft diagnostics must never affect startup.
  }
}
