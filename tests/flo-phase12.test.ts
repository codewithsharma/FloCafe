/**
 * Phase 12 responsive / a11y / performance contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-phase12.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function assertTouchTargets(content: string, label: string): void {
  assert.ok(
    content.includes('min-h-11')
      || content.includes('min-h-12')
      || content.includes('min-h-[88px]')
      || content.includes('min-h-[100px]'),
    `${label} must include Flo touch-target sizing (min-h-11 or equivalent)`,
  );
}

function assertLoadingAndEmpty(page: string, label: string, requireEmpty = true): void {
  assert.ok(page.includes('LoadingState'), `${label} uses LoadingState`);
  if (requireEmpty) {
    assert.ok(page.includes('EmptyState'), `${label} uses EmptyState`);
  }
}

function main(): void {
  console.log('Phase 12 Flo Responsive / A11y / Performance Contracts');
  console.log('='.repeat(60));

  const dashboardLayout = read('app/(dashboard)/layout.tsx');
  assert.ok(dashboardLayout.includes('AppShell'), 'dashboard layout uses AppShell');
  assert.ok(!dashboardLayout.includes("from '@/components/layout/Sidebar'"), 'legacy Sidebar not in dashboard layout');
  console.log('   ✓ AppShell shell regression guard');

  const dashboard = read('app/(dashboard)/dashboard/page.tsx');
  assertTouchTargets(dashboard, 'HOME dashboard');
  assert.ok(dashboard.includes('LoadingState'), 'HOME uses LoadingState');
  assert.ok(dashboard.includes('aria-label'), 'HOME includes landmark aria-labels');
  assert.ok(dashboard.includes('focus-visible'), 'HOME links include focus-visible rings');
  console.log('   ✓ HOME touch targets + loading + a11y');

  const posPage = read('app/(dashboard)/pos/page.tsx');
  assert.ok(posPage.includes('PosWorkspace'), 'POS uses PosWorkspace');
  assert.ok(posPage.includes('aria-label'), 'POS mobile FAB has aria-label');
  assert.ok(posPage.includes('focus-visible'), 'POS mobile FAB has focus-visible ring');

  const topbar = read('components/pos/PosTopbar.tsx');
  assertTouchTargets(topbar, 'PosTopbar');
  assert.ok(topbar.includes('focus-visible'), 'PosTopbar buttons include focus-visible rings');

  const workspace = read('components/flo/pos/PosWorkspace.tsx');
  assert.ok(workspace.includes('aria-label'), 'PosWorkspace order panel has aria-label');
  console.log('   ✓ POS touch targets + a11y');

  const tablesPage = read('app/(dashboard)/tables/page.tsx');
  assertTouchTargets(tablesPage, 'tables page');
  assertLoadingAndEmpty(tablesPage, 'tables page');
  console.log('   ✓ tables touch targets + states');

  const ordersPage = read('app/(dashboard)/orders/page.tsx');
  assertTouchTargets(ordersPage, 'orders page');
  assertLoadingAndEmpty(ordersPage, 'orders page');
  assert.ok(ordersPage.includes('PageHeader'), 'orders page uses PageHeader');
  assert.ok(ordersPage.includes('OrdersFilterBar'), 'orders page uses OrdersFilterBar');

  const filterBar = read('components/orders/OrdersFilterBar.tsx');
  assertTouchTargets(filterBar, 'OrdersFilterBar');
  assert.ok(filterBar.includes('aria-label'), 'OrdersFilterBar search has aria-label');
  assert.ok(filterBar.includes('focus:ring-2'), 'OrdersFilterBar inputs have focus rings');
  console.log('   ✓ orders touch targets + filter a11y + states');

  const customersPage = read('app/(dashboard)/customers/page.tsx');
  assertTouchTargets(customersPage, 'customers page');
  assert.ok(customersPage.includes('LoadingState'), 'customers page uses LoadingState');
  assert.ok(customersPage.includes('aria-label'), 'customers page includes aria-labels');

  const customersTable = read('components/customers/CustomersTable.tsx');
  assertTouchTargets(customersTable, 'CustomersTable');
  assert.ok(customersTable.includes('EmptyState'), 'CustomersTable uses EmptyState');
  assert.ok(customersTable.includes('aria-label'), 'CustomersTable icon actions have aria-labels');
  console.log('   ✓ customers touch targets + states + a11y');

  const staffPage = read('app/(dashboard)/staff/page.tsx');
  assertTouchTargets(staffPage, 'staff page');
  assert.ok(staffPage.includes('LoadingState'), 'staff page uses LoadingState');

  const staffGrid = read('components/staff/StaffGrid.tsx');
  assertTouchTargets(staffGrid, 'StaffGrid');
  assert.ok(staffGrid.includes('EmptyState'), 'StaffGrid uses EmptyState');
  console.log('   ✓ staff touch targets + states');

  const loadingState = read('components/flo/LoadingState.tsx');
  assert.ok(loadingState.includes('role="status"'), 'LoadingState exposes status role');
  assert.ok(loadingState.includes('aria-live="polite"'), 'LoadingState is polite live region');
  assert.ok(loadingState.includes('aria-busy="true"'), 'LoadingState marks busy');

  const emptyState = read('components/flo/EmptyState.tsx');
  assert.ok(emptyState.includes('role="status"'), 'EmptyState exposes status role');
  console.log('   ✓ Flo state primitives a11y');

  const css = read('app/globals.css');
  assert.ok(css.includes('prefers-reduced-motion'), 'globals.css respects reduced motion');
  assert.ok(css.includes('--flo-brand-600'), 'Flo brand tokens present');
  console.log('   ✓ global tokens + reduced motion');

  const reportsPage = read('app/(dashboard)/reports/page.tsx');
  assertTouchTargets(reportsPage, 'reports hub');
  assert.ok(reportsPage.includes('LoadingState'), 'reports uses LoadingState');
  assert.ok(reportsPage.includes('EmptyState'), 'reports uses EmptyState');
  console.log('   ✓ reports hub responsive patterns');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('"flo.a11y.clearFilter"'), 'flo.a11y.clearFilter i18n key');
  console.log('   ✓ a11y i18n keys');

  console.log('='.repeat(60));
  console.log('✅ Phase 12 Flo responsive/a11y contracts passed');
}

main();
