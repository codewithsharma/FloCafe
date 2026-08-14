/**
 * Phase 2 Flo UI shell contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-ui-shell.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FLO_NAV_ITEMS,
  filterNavItems,
  getNavItemById,
  isNavItemActive,
} from '../frontend/src/config/navigation';
import { STATUS_BADGE_VARIANTS, varianceTone } from '../frontend/src/lib/flo-display';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(FRONTEND, rel));
}

function main(): void {
  console.log('Phase 2 Flo UI Shell Contracts');
  console.log('='.repeat(60));

  assert.ok(Array.isArray(FLO_NAV_ITEMS), 'FLO_NAV_ITEMS exported');
  assert.ok(typeof filterNavItems === 'function', 'filterNavItems exported');
  assert.ok(typeof isNavItemActive === 'function', 'isNavItemActive exported');
  assert.ok(typeof getNavItemById === 'function', 'getNavItemById exported');

  const ids = FLO_NAV_ITEMS.map((item) => item.id);
  for (const required of [
    'home',
    'pos',
    'tables',
    'orders',
    'kitchen',
    'customers',
    'inventory',
    'reports',
    'operations',
    'team',
    'settings',
  ]) {
    assert.ok(ids.includes(required), `nav includes ${required}`);
  }

  const kitchen = getNavItemById('kitchen');
  assert.equal(kitchen?.href, '/kds', 'kitchen navigates to live KDS');
  assert.notEqual(kitchen?.href, '/settings?tab=kds', 'kitchen not miswired to settings');

  const reports = getNavItemById('reports');
  assert.equal(reports?.href, '/reports', 'reports href is /reports');

  const inventory = getNavItemById('inventory');
  assert.ok(inventory, 'inventory item exists');
  assert.ok(
    inventory?.href === '/products' || inventory?.href === '/inventory',
    'inventory maps to products or inventory route',
  );

  const team = getNavItemById('team');
  assert.equal(team?.href, '/staff', 'team maps to /staff');

  const cashierNav = filterNavItems({
    role: 'cashier',
    businessType: 'restaurant',
    tablesRequired: true,
    kdsEnabled: true,
    whatsappEnabled: false,
  });
  const cashierIds = cashierNav.map((i) => i.id);
  assert.ok(cashierIds.includes('pos'), 'cashier sees POS');
  assert.ok(cashierIds.includes('orders'), 'cashier sees orders');
  assert.ok(!cashierIds.includes('settings'), 'cashier does not see settings');
  assert.ok(!cashierIds.includes('home'), 'cashier does not see owner home');
  assert.ok(!cashierIds.includes('team'), 'cashier does not see team');

  const ownerNav = filterNavItems({
    role: 'owner',
    businessType: 'restaurant',
    tablesRequired: true,
    kdsEnabled: true,
    whatsappEnabled: true,
  });
  const ownerIds = ownerNav.map((i) => i.id);
  assert.ok(ownerIds.includes('home'), 'owner sees home');
  assert.ok(ownerIds.includes('reports'), 'owner sees reports');
  assert.ok(ownerIds.includes('operations'), 'owner sees operations');
  assert.ok(ownerIds.includes('kitchen'), 'owner sees kitchen when kds enabled');

  const noTables = filterNavItems({
    role: 'owner',
    businessType: 'restaurant',
    tablesRequired: false,
    kdsEnabled: false,
    whatsappEnabled: false,
  });
  assert.ok(!noTables.some((i) => i.id === 'tables'), 'tables hidden when tablesRequired false');
  assert.ok(!noTables.some((i) => i.id === 'kitchen'), 'kitchen hidden when kds disabled');

  const tablesItem = getNavItemById('tables');
  assert.equal(tablesItem?.requiresModule, 'tables', 'tables nav requires tables module');
  assert.equal(tablesItem?.businessTypes, null, 'tables gated by module not businessTypes');
  const kitchenItem = getNavItemById('kitchen');
  assert.equal(kitchenItem?.requiresModule, 'kds', 'kitchen nav requires kds module');
  assert.equal(kitchenItem?.businessTypes, null, 'kitchen gated by module not businessTypes');

  assert.equal(getNavItemById('pos')?.requiresModule, 'pos');
  assert.equal(getNavItemById('orders')?.requiresModule, 'order');
  assert.equal(getNavItemById('customers')?.requiresModule, 'customer');
  assert.equal(getNavItemById('inventory')?.requiresModule, 'product');
  assert.equal(getNavItemById('reports')?.requiresModule, 'reporting');
  assert.equal(getNavItemById('team')?.requiresModule, 'staff');
  assert.equal(getNavItemById('whatsapp')?.requiresModule, 'notification');

  const navigationSource = read('config/navigation.ts');
  assert.ok(navigationSource.includes('isFeatureAvailable'), 'nav uses isFeatureAvailable');

  assert.equal(isNavItemActive('/kds', kitchen!), true, 'kitchen active on /kds');
  assert.equal(isNavItemActive('/settings', kitchen!), false, 'kitchen inactive on settings');
  assert.equal(isNavItemActive('/pos', getNavItemById('pos')!), true);
  assert.equal(isNavItemActive('/pos/', getNavItemById('pos')!), true, 'trailing slash ok');
  assert.equal(isNavItemActive('/orders', getNavItemById('pos')!), false);

  for (const bad of ['/print-test', '/order-history-demo', '/addon-groups']) {
    assert.ok(!FLO_NAV_ITEMS.some((i) => i.href === bad), `primary nav must not include ${bad}`);
  }
  console.log('   ✓ navigation configuration');

  assert.equal(varianceTone(0), 'balanced');
  assert.equal(varianceTone(2500), 'over');
  assert.equal(varianceTone(-1850), 'short');
  assert.equal(varianceTone(null), 'unknown');
  assert.equal(varianceTone(undefined), 'unknown');

  assert.ok(STATUS_BADGE_VARIANTS.includes('success'));
  assert.ok(STATUS_BADGE_VARIANTS.includes('warning'));
  assert.ok(STATUS_BADGE_VARIANTS.includes('danger'));
  assert.ok(STATUS_BADGE_VARIANTS.includes('info'));
  assert.ok(STATUS_BADGE_VARIANTS.includes('secondary'));
  console.log('   ✓ flo display helpers');

  for (const file of [
    'components/flo/AppShell.tsx',
    'components/flo/Sidebar.tsx',
    'components/flo/ContextHeader.tsx',
    'components/flo/Panel.tsx',
    'components/flo/PageHeader.tsx',
    'components/flo/SectionHeader.tsx',
    'components/flo/MoneyDisplay.tsx',
    'components/flo/VarianceIndicator.tsx',
    'components/flo/StatusBadge.tsx',
    'components/flo/EmptyState.tsx',
    'components/flo/LoadingState.tsx',
    'components/flo/ErrorState.tsx',
    'components/flo/index.ts',
  ]) {
    assert.ok(exists(file), `missing ${file}`);
  }
  console.log('   ✓ flo component files');

  const dashboardLayout = read('app/(dashboard)/layout.tsx');
  assert.ok(dashboardLayout.includes('AppShell'), 'dashboard layout uses AppShell');
  assert.ok(
    !dashboardLayout.includes("from '@/components/layout/Sidebar'"),
    'old Sidebar not imported in dashboard layout',
  );

  const floSidebar = read('components/flo/Sidebar.tsx');
  assert.ok(
    floSidebar.includes('FLO_NAV_ITEMS') || floSidebar.includes('filterNavItems'),
    'flo Sidebar uses nav config',
  );
  assert.ok(floSidebar.includes('/kds'), 'flo Sidebar kitchen points to /kds');

  const appShell = read('components/flo/AppShell.tsx');
  assert.ok(appShell.includes('Sidebar'), 'AppShell includes Sidebar');

  const money = read('components/flo/MoneyDisplay.tsx');
  assert.ok(money.includes('useFormatCurrency'), 'MoneyDisplay uses currency hook');
  assert.ok(
    money.includes('tabular-nums') || money.includes('text-numeric'),
    'MoneyDisplay uses tabular nums',
  );

  const variance = read('components/flo/VarianceIndicator.tsx');
  assert.ok(
    variance.includes('varianceTone') || variance.includes('formatVarianceLabel'),
    'VarianceIndicator uses variance semantics',
  );

  const statusBadge = read('components/flo/StatusBadge.tsx');
  assert.ok(statusBadge.includes('variant'), 'StatusBadge has variants');
  console.log('   ✓ shell wiring contracts');

  assert.ok(exists('app/(dashboard)/reports/page.tsx'), '/reports page exists');
  assert.ok(exists('app/(dashboard)/operations/page.tsx'), '/operations page exists');

  const reportsPage = read('app/(dashboard)/reports/page.tsx');
  assert.ok(
    reportsPage.includes('EmptyState') || reportsPage.includes('Panel'),
    'reports uses flo primitives',
  );
  assert.ok(!/fake|mock revenue|lorem/i.test(reportsPage), 'reports has no fake metrics');

  const menuHandler = read('components/layout/MenuActionHandler.tsx');
  assert.ok(
    menuHandler.includes("'/reports'") || menuHandler.includes('"/reports"'),
    'MenuActionHandler still targets /reports',
  );
  console.log('   ✓ routes');

  const css = read('app/globals.css');
  assert.ok(css.includes('--flo-brand-600'), 'flo brand token defined');
  assert.ok(css.includes('--flo-bg'), 'flo bg token defined');
  assert.ok(css.includes('--flo-success'), 'flo success token defined');
  assert.ok(
    css.includes('--color-flo-brand-600') || css.includes('--color-flo-bg'),
    'flo colors registered in theme',
  );
  // Flo brand may be indigo (design system) or current token hex — require a defined brand color
  assert.ok(
    /--color-brand:\s*#[0-9A-Fa-f]{6}/.test(css) || /--flo-brand-600:\s*#[0-9A-Fa-f]{6}/.test(css),
    'brand color token defined',
  );
  console.log('   ✓ design tokens');

  const rootLayout = read('app/layout.tsx');
  assert.ok(rootLayout.includes('Opervia'), 'root metadata uses Opervia');
  assert.ok(!rootLayout.includes('Nexora'), 'root metadata no longer Nexora');
  // MenuActionHandler → MasterPinPrompt uses useTranslation; must sit inside I18nextProvider
  // or every route logs NO_I18NEXT_INSTANCE and can crash with "t is not a function".
  const providersOpen = rootLayout.indexOf('<AppProviders');
  const menuHandlerJsx = rootLayout.indexOf('<MenuActionHandler');
  const providersClose = rootLayout.indexOf('</AppProviders>');
  assert.ok(providersOpen !== -1, 'root layout mounts AppProviders');
  assert.ok(menuHandlerJsx !== -1, 'root layout mounts MenuActionHandler');
  assert.ok(
    providersOpen < menuHandlerJsx && menuHandlerJsx < providersClose,
    'MenuActionHandler must mount inside AppProviders (i18next context)',
  );

  const manifest = fs.readFileSync(path.join(ROOT, 'frontend/public/manifest.json'), 'utf8');
  assert.ok(manifest.includes('Opervia'), 'manifest uses Opervia');
  assert.ok(!manifest.includes('Nexora'), 'manifest no longer Nexora');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('"common.brandName": "Opervia"'), 'i18n brandName is Opervia');
  assert.ok(en.includes('"flo.nav.home"') || en.includes('"nav.home"'), 'home nav i18n key');
  assert.ok(
    en.includes('"flo.nav.reports"') || en.includes('"nav.reports"'),
    'reports nav i18n key',
  );
  assert.ok(
    en.includes('"flo.nav.operations"') || en.includes('"nav.operations"'),
    'operations nav i18n key',
  );
  console.log('   ✓ branding');

  console.log('='.repeat(60));
  console.log('✅ Phase 2 Flo UI shell contracts passed');
}

main();
