/**
 * Opervia module registry public surface (Phase 2.1 + 2.2 diagnostics).
 */
export {
  MODULE_CATALOG,
  MODULE_IDS,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL,
  ACTIVE_VERTICAL_ID,
  VERTICALS,
  listModules,
  getModule,
  getActiveVerticalId,
  getVerticalDefinition,
  getEnabledModules,
  isModuleEnabled,
  isFeatureAvailable,
  getModuleDependencies,
  getRouteModuleMap,
  verticalIdForBusinessType,
  getPlatformCompositionSummary,
} from './registry';

export {
  validateVerticalDependencies,
  validateEnabledSetDependencies,
  validateRegistryIntegrity,
  detectDependencyCycles,
  formatModuleDiagnosticsLog,
  getModuleDiagnosticsSnapshot,
  shouldLogModuleDiagnostics,
  logModuleDiagnosticsIfDev,
} from './diagnostics';

export { OPERVIA_RESTAURANT_ENABLED_MODULES } from './verticals';

export type { ModuleId, OperviaModule, VerticalDefinition, ModuleKind } from './types';
export type {
  MissingDependency,
  VerticalDependencyReport,
  RegistryIntegrityIssue,
  RegistryIntegrityIssueKind,
  RegistryIntegrityReport,
} from './diagnostics';
