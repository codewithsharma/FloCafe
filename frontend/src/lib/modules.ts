/**
 * Frontend re-export of Opervia module registry (Phase 2.1 + 2.2).
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
  ACTIVE_VERTICAL_ID,
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
  validateVerticalDependencies,
  validateEnabledSetDependencies,
  validateRegistryIntegrity,
  formatModuleDiagnosticsLog,
  getModuleDiagnosticsSnapshot,
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
} from '../../../main/modules';
