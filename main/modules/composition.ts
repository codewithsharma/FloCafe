/**
 * Phase 2.3 — read-only Operavia composition snapshot.
 * Observability only: does not install, uninstall, or modify modules.
 */
import { MODULE_CATALOG } from './catalog';
import { getEnabledModules, getModule, getRouteModuleMap, getVerticalDefinition } from './registry';
import { getModuleDiagnosticsSnapshot, validateEnabledSetDependencies } from './diagnostics';
import type {
  MissingDependency,
  RegistryIntegrityIssue,
  RegistryIntegrityReport,
  VerticalDependencyReport,
} from './diagnostics';
import type { ModuleId, ModuleKind } from './types';

export const COMPOSITION_SNAPSHOT_SCHEMA_VERSION = '2.3' as const;

export interface CompositionModuleEntry {
  id: ModuleId;
  name: string;
  version: string;
  kind: ModuleKind;
  dependencies: readonly ModuleId[];
  featureFlags?: readonly string[];
}

export interface CompositionDiagnosticWarning {
  kind: 'missing_dependency' | 'registry_integrity';
  detail: string;
  module?: string;
  dependency?: string;
}

export interface CompositionSnapshot {
  schemaVersion: typeof COMPOSITION_SNAPSHOT_SCHEMA_VERSION;
  vertical: {
    id: string;
    name: string;
    version: string;
    description?: string;
  };
  modules: {
    enabled: readonly ModuleId[];
    entries: readonly CompositionModuleEntry[];
    counts: {
      enabled: number;
      registered: number;
      byKind: Record<ModuleKind, number>;
      registeredRoutePrefixes: number;
    };
  };
  dependencies: Pick<
    VerticalDependencyReport,
    'verticalId' | 'valid' | 'missing' | 'enabledModuleCount'
  >;
  registryIntegrity: Pick<RegistryIntegrityReport, 'valid' | 'issues'>;
  diagnostics: {
    valid: boolean;
    warnings: CompositionDiagnosticWarning[];
  };
}

export interface CompositionSnapshotOptions {
  verticalId?: string;
  /** Synthetic enabled set for tooling/tests; does not mutate vertical definitions. */
  enabledModules?: readonly ModuleId[];
}

/** Minimal HTTP projection of {@link getCompositionSnapshot} (Phase 2.4). */
export interface PlatformCompositionResponse {
  verticalId: string;
  verticalName: string;
  enabledModules: readonly ModuleId[];
  diagnostics: {
    valid: boolean;
  };
}

function emptyKindCounts(): Record<ModuleKind, number> {
  return { core: 0, shared: 0, restaurant: 0 };
}

function buildModuleEntries(enabled: readonly ModuleId[]): CompositionModuleEntry[] {
  const entries: CompositionModuleEntry[] = [];
  for (const id of enabled) {
    const mod = getModule(id);
    if (!mod) continue;
    entries.push({
      id: mod.id,
      name: mod.name,
      version: mod.version,
      kind: mod.kind,
      dependencies: [...mod.dependencies].sort(),
      ...(mod.featureFlags ? { featureFlags: [...mod.featureFlags].sort() } : {}),
    });
  }
  return entries;
}

function countByKind(entries: readonly CompositionModuleEntry[]): Record<ModuleKind, number> {
  const counts = emptyKindCounts();
  for (const entry of entries) {
    counts[entry.kind] += 1;
  }
  return counts;
}

function dependencyWarnings(missing: readonly MissingDependency[]): CompositionDiagnosticWarning[] {
  return missing.map((m) => ({
    kind: 'missing_dependency' as const,
    detail: `${m.module} requires ${m.dependency}`,
    module: m.module,
    dependency: m.dependency,
  }));
}

function integrityWarnings(
  issues: readonly RegistryIntegrityIssue[],
): CompositionDiagnosticWarning[] {
  return issues.map((issue) => ({
    kind: 'registry_integrity' as const,
    detail: issue.detail,
    module: issue.module,
    dependency: issue.dependency,
  }));
}

function buildWarnings(
  missing: readonly MissingDependency[],
  issues: readonly RegistryIntegrityIssue[],
): CompositionDiagnosticWarning[] {
  return [...dependencyWarnings(missing), ...integrityWarnings(issues)].sort((a, b) => {
    const byKind = a.kind.localeCompare(b.kind);
    if (byKind !== 0) return byKind;
    return a.detail.localeCompare(b.detail);
  });
}

/**
 * Read-only snapshot of vertical composition derived from registry + diagnostics.
 * Never throws. Deterministic for a given vertical / enabled-module override.
 */
export function getCompositionSnapshot(options?: CompositionSnapshotOptions): CompositionSnapshot {
  const vertical = getVerticalDefinition(options?.verticalId);
  const enabled = options?.enabledModules
    ? [...options.enabledModules].sort()
    : [...getEnabledModules(vertical.id)].sort();

  const entries = buildModuleEntries(enabled);
  const routeMap = getRouteModuleMap();
  const enabledSet = new Set(enabled);

  const dependencyReport = options?.enabledModules
    ? {
        verticalId: vertical.id,
        ...validateEnabledSetDependencies(enabled),
      }
    : getModuleDiagnosticsSnapshot(vertical.id).vertical;

  const integrity = getModuleDiagnosticsSnapshot(vertical.id).integrity;
  const warnings = buildWarnings(dependencyReport.missing, integrity.issues);

  return {
    schemaVersion: COMPOSITION_SNAPSHOT_SCHEMA_VERSION,
    vertical: {
      id: vertical.id,
      name: vertical.name,
      version: vertical.version,
      ...(vertical.description ? { description: vertical.description } : {}),
    },
    modules: {
      enabled,
      entries,
      counts: {
        enabled: enabled.length,
        registered: MODULE_CATALOG.length,
        byKind: countByKind(entries),
        registeredRoutePrefixes: Object.keys(routeMap).filter((prefix) =>
          enabledSet.has(routeMap[prefix]!),
        ).length,
      },
    },
    dependencies: {
      verticalId: dependencyReport.verticalId,
      valid: dependencyReport.valid,
      missing: dependencyReport.missing,
      enabledModuleCount: dependencyReport.enabledModuleCount,
    },
    registryIntegrity: {
      valid: integrity.valid,
      issues: integrity.issues,
    },
    diagnostics: {
      valid: dependencyReport.valid && integrity.valid,
      warnings,
    },
  };
}

/**
 * Minimal read-only composition for platform/support HTTP consumers.
 * Never throws. Does not expose dependency internals, registry issues, or paths.
 */
export function getPlatformCompositionResponse(
  options?: CompositionSnapshotOptions,
): PlatformCompositionResponse {
  const snapshot = getCompositionSnapshot(options);
  return {
    verticalId: snapshot.vertical.id,
    verticalName: snapshot.vertical.name,
    enabledModules: snapshot.modules.enabled,
    diagnostics: {
      valid: snapshot.diagnostics.valid,
    },
  };
}

/** Dev-friendly composition log (pure; no side effects). */
export function formatCompositionDiagnosticsLog(options?: CompositionSnapshotOptions): string {
  const snapshot = getCompositionSnapshot(options);
  const lines: string[] = [];

  lines.push('[Operavia Composition]');
  lines.push(`Vertical: ${snapshot.vertical.name}`);
  lines.push(`Modules: ${snapshot.modules.counts.enabled}`);

  if (snapshot.dependencies.valid) {
    lines.push('Dependencies: valid');
  } else {
    lines.push('Dependency warnings:');
    for (const w of snapshot.diagnostics.warnings.filter((x) => x.kind === 'missing_dependency')) {
      lines.push(`- ${w.module} -> ${w.dependency}`);
    }
  }

  if (!snapshot.registryIntegrity.valid) {
    lines.push('Integrity warnings:');
    for (const w of snapshot.diagnostics.warnings.filter((x) => x.kind === 'registry_integrity')) {
      lines.push(`- ${w.detail}`);
    }
  }

  if (snapshot.diagnostics.valid) {
    lines.push('Diagnostics: none');
  }

  return lines.join('\n');
}

/** Log composition snapshot in non-production environments. Never throws. */
export function logCompositionSnapshotIfDev(options?: CompositionSnapshotOptions): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    console.info(formatCompositionDiagnosticsLog(options));
  } catch {
    // Soft diagnostics must never affect startup.
  }
}
