/**
 * Frontend re-export of Operavia module registry (Phase 2.1–2.3).
 * Single source of truth lives in main/modules — this barrel does not duplicate the catalog.
 * Relative import keeps ts-node tests and Next bundler both resolving without
 * depending on path aliases inside this barrel.
 */
export {
  MODULE_CATALOG,
  MODULE_IDS,
  OPERVIA_RESTAURANT_VERTICAL_ID,
  OPERVIA_RESTAURANT_VERTICAL,
  OPERVIA_RESTAURANT_ENABLED_MODULES,
  OPERVIA_RETAIL_VERTICAL_ID,
  OPERVIA_RETAIL_VERTICAL,
  OPERVIA_RETAIL_ENABLED_MODULES,
  ACTIVE_VERTICAL_ID,
  listModules,
  getModule,
  getActiveVerticalId,
  resolveActiveVerticalIdFromConfigModule,
  getVerticalDefinition,
  getEnabledModules,
  isModuleEnabled,
  isFeatureAvailable,
  getModuleDependencies,
  getRouteModuleMap,
  verticalIdForBusinessType,
  getPlatformCompositionSummary,
  validateVerticalDependencies,
  validateEnabledSetDependencies,
  validateRegistryIntegrity,
  formatModuleDiagnosticsLog,
  getModuleDiagnosticsSnapshot,
  COMPOSITION_SNAPSHOT_SCHEMA_VERSION,
  getCompositionSnapshot,
  formatCompositionDiagnosticsLog,
} from '../../../main/modules';

export type {
  ModuleId,
  OperviaModule,
  VerticalDefinition,
  ModuleKind,
  MissingDependency,
  VerticalDependencyReport,
  RegistryIntegrityIssue,
  RegistryIntegrityReport,
  CompositionSnapshot,
  CompositionSnapshotOptions,
  CompositionModuleEntry,
  CompositionDiagnosticWarning,
} from '../../../main/modules';
