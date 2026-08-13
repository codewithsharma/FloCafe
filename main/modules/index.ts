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
  OPERVIA_RETAIL_TEST_VERTICAL_ID,
  OPERVIA_RETAIL_TEST_VERTICAL,
  OPERVIA_RETAIL_TEST_ENABLED_MODULES,
  SYNTHETIC_VERTICALS,
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
  getModuleCapabilities,
  moduleOwnsCapability,
  findCapabilityOwner,
  CAPABILITY_IDS,
} from './registry';

export {
  validateVerticalDependencies,
  validateEnabledSetDependencies,
  validateRegistryIntegrity,
  validateModuleDefinitions,
  detectDependencyCycles,
  formatModuleDiagnosticsLog,
  getModuleDiagnosticsSnapshot,
  shouldLogModuleDiagnostics,
  logModuleDiagnosticsIfDev,
} from './diagnostics';

export {
  COMPOSITION_SNAPSHOT_SCHEMA_VERSION,
  getCompositionSnapshot,
  getPlatformCompositionResponse,
  formatCompositionDiagnosticsLog,
  logCompositionSnapshotIfDev,
} from './composition';

export { OPERVIA_RESTAURANT_ENABLED_MODULES } from './verticals';
// Synthetic retail-test is re-exported via registry (not production VERTICALS).

export type { ModuleId, OperviaModule, VerticalDefinition, ModuleKind, CapabilityId, ModuleDefinition } from './types';
export type {
  MissingDependency,
  VerticalDependencyReport,
  RegistryIntegrityIssue,
  RegistryIntegrityIssueKind,
  RegistryIntegrityReport,
} from './diagnostics';
export type {
  CompositionSnapshot,
  CompositionSnapshotOptions,
  CompositionModuleEntry,
  CompositionDiagnosticWarning,
  PlatformCompositionResponse,
} from './composition';
