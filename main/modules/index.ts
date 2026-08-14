/**
 * Operavia module registry public surface (Phase 2.1–3.3).
 */
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
  listModules,
  getModule,
  getActiveVerticalId,
  resolveActiveVerticalIdFromConfigModule,
  getVerticalDefinition,
  resolveKnownVertical,
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

export {
  CompositionValidationError,
  resolveVerticalDefinition,
  assertFailClosedComposition,
  getRouteMountPlan,
  shouldMountModule,
} from './route-mounting';

export {
  ACTIVE_VERTICAL_ENV_KEY,
  resolveActiveVerticalId,
  commitActiveVerticalFromEnv,
  getCommittedActiveVerticalId,
  resetActiveVerticalResolutionForTests,
  formatStartupCompositionDiagnostics,
  logStartupCompositionIfAppropriate,
} from './vertical-config';

export { OPERVIA_SHARED_COMMERCE_MODULES } from './shared-commerce-modules';
export { OPERVIA_RESTAURANT_ENABLED_MODULES } from './verticals';
// Production retail in VERTICALS; synthetic retail-test in SYNTHETIC_VERTICALS.

export type {
  ModuleId,
  OperviaModule,
  VerticalDefinition,
  ModuleKind,
  CapabilityId,
  ModuleDefinition,
} from './types';
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
export type { FailClosedCompositionOptions, RouteMountPlan } from './route-mounting';
