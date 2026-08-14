/**
 * Phase 6 Tables workspace contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-tables.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main(): void {
  console.log('Phase 6 Flo Tables Workspace Contracts');
  console.log('='.repeat(60));

  const tablesPage = read('app/(dashboard)/tables/page.tsx');
  assert.ok(tablesPage.includes('PageHeader'), 'tables page uses PageHeader');
  assert.ok(tablesPage.includes('LoadingState'), 'tables page uses LoadingState');
  assert.ok(tablesPage.includes('EmptyState'), 'tables page uses EmptyState');
  assert.ok(
    tablesPage.includes('isFeatureAvailable'),
    'tables page fail-closed via isFeatureAvailable',
  );
  assert.ok(tablesPage.includes('usePlatformComposition'), 'tables page uses platform composition');
  assert.ok(tablesPage.includes('tablesUnavailable'), 'tables unavailable messaging');
  assert.ok(tablesPage.includes('TablesGrid'), 'tables page uses TablesGrid');
  assert.ok(tablesPage.includes('ReserveTableDialog'), 'tables page uses ReserveTableDialog');
  assert.ok(tablesPage.includes('AddTableDialog'), 'tables page uses AddTableDialog');
  assert.ok(
    tablesPage.includes("localStorage.getItem('tables_showDetails')"),
    'details preference preserved',
  );
  assert.ok(tablesPage.includes('10000'), 'polling interval preserved');
  assert.ok(tablesPage.includes("api.get('/tables')"), 'tables list API preserved');
  assert.ok(tablesPage.includes('api.patch(`/tables/${'), 'status update API preserved');
  assert.ok(tablesPage.includes("api.post('/tables'"), 'create table API preserved');
  assert.ok(tablesPage.includes('deactivate'), 'deactivate API preserved');
  assert.ok(tablesPage.includes('reactivate'), 'reactivate API preserved');
  assert.ok(
    !tablesPage.includes('bg-white rounded-xl border border-gray-100'),
    'legacy card pattern removed from page',
  );
  console.log('   ✓ tables page orchestration preserved');

  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/tables/TablesGrid.tsx')),
    'TablesGrid exists',
  );
  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/tables/TableDetailCard.tsx')),
    'TableDetailCard exists',
  );
  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/tables/TableCompactCard.tsx')),
    'TableCompactCard exists',
  );
  console.log('   ✓ tables components exist');

  const detailCard = read('components/tables/TableDetailCard.tsx');
  assert.ok(detailCard.includes('Panel'), 'TableDetailCard uses Panel');
  assert.ok(detailCard.includes('StatusBadge'), 'TableDetailCard uses StatusBadge');
  assert.ok(detailCard.includes('border-l-4'), 'TableDetailCard status left border');
  console.log('   ✓ TableDetailCard flo styling');

  const compactCard = read('components/tables/TableCompactCard.tsx');
  assert.ok(compactCard.includes('min-h-[100px]'), 'compact card touch target');
  assert.ok(compactCard.includes('StatusBadge'), 'TableCompactCard uses StatusBadge');
  console.log('   ✓ TableCompactCard flo styling');

  const floDisplay = read('lib/flo-display.ts');
  assert.ok(floDisplay.includes('tableStatusVariant'), 'tableStatusVariant helper');
  assert.ok(floDisplay.includes('orderStatusVariant'), 'orderStatusVariant helper');
  console.log('   ✓ flo-display helpers');

  const ordersHelper = read('lib/tables-orders.ts');
  assert.ok(ordersHelper.includes('buildOrdersByTable'), 'buildOrdersByTable helper');
  console.log('   ✓ tables-orders helper');

  console.log('='.repeat(60));
  console.log('✅ Phase 6 Flo Tables workspace contracts passed');
}

main();
