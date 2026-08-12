/**
 * Phase 8 Products / Menu inventory workspace contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-products.test.ts
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
  console.log('Phase 8 Flo Products Workspace Contracts');
  console.log('='.repeat(60));

  const productsPage = read('app/(dashboard)/products/page.tsx');
  assert.ok(productsPage.includes('PageHeader'), 'products page uses PageHeader');
  assert.ok(productsPage.includes('LoadingState'), 'products page uses LoadingState');
  assert.ok(productsPage.includes('ProductsTabBar'), 'products page uses ProductsTabBar');
  assert.ok(productsPage.includes('ProductsTable'), 'products page uses ProductsTable');
  assert.ok(productsPage.includes('CategoriesTable'), 'products page uses CategoriesTable');
  assert.ok(productsPage.includes('AddonGroupsTable'), 'products page uses AddonGroupsTable');
  assert.ok(productsPage.includes("api.get('/products')"), 'products list API preserved');
  assert.ok(productsPage.includes("api.get('/categories')"), 'categories list API preserved');
  assert.ok(productsPage.includes("api.get('/addon-groups')"), 'addon groups API preserved');
  assert.ok(productsPage.includes('/tax/categories'), 'tax categories API preserved');
  assert.ok(productsPage.includes('/settings/loyalty'), 'loyalty settings API preserved');
  assert.ok(productsPage.includes("api.post('/products'"), 'create product API preserved');
  assert.ok(productsPage.includes('api.put(`/products/${'), 'update product API preserved');
  assert.ok(productsPage.includes('handleBulkTaxAssign'), 'bulk tax assign preserved');
  assert.ok(productsPage.includes('/menu-csv/import/'), 'CSV import preserved');
  assert.ok(productsPage.includes('isOwnerOrManager'), 'role gate preserved');
  assert.ok(productsPage.includes('isRestaurant'), 'restaurant addon tab gate preserved');
  assert.ok(productsPage.includes('parseProductsTab'), 'tab URL param support');
  assert.ok(!productsPage.includes('bg-white rounded-xl border border-gray-100'), 'legacy table card pattern removed from page');
  assert.ok(!productsPage.includes('fixed inset-0 bg-black/50'), 'legacy modal overlay removed from page');
  assert.ok(!productsPage.includes('bg-white rounded-xl shadow-xl'), 'legacy modal panel removed from page');
  assert.ok(productsPage.includes('ProductFormDialog'), 'products page uses ProductFormDialog');
  assert.ok(productsPage.includes('CategoryFormDialog'), 'products page uses CategoryFormDialog');
  assert.ok(productsPage.includes('AddonGroupDialog'), 'products page uses AddonGroupDialog');
  assert.ok(productsPage.includes('CsvImportDialog'), 'products page uses CsvImportDialog');
  assert.ok(productsPage.includes('BulkTaxDialog'), 'products page uses BulkTaxDialog');
  assert.ok(productsPage.includes('CategoryDeleteDialog'), 'products page uses CategoryDeleteDialog');
  console.log('   ✓ products page orchestration preserved');

  const addonRedirect = read('app/(dashboard)/addon-groups/page.tsx');
  assert.ok(addonRedirect.includes("router.replace('/products?tab=addons')"), 'addon-groups redirects to products addons tab');
  assert.ok(addonRedirect.includes('LoadingState'), 'addon-groups redirect uses LoadingState');
  console.log('   ✓ addon-groups redirect');

  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/products/ProductsTabBar.tsx')), 'ProductsTabBar exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/products/ProductsTable.tsx')), 'ProductsTable exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/products/CategoriesTable.tsx')), 'CategoriesTable exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/products/AddonGroupsTable.tsx')), 'AddonGroupsTable exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/products/ProductFormDialog.tsx')), 'ProductFormDialog exists');
  console.log('   ✓ products components exist');

  const productDialog = read('components/products/ProductFormDialog.tsx');
  assert.ok(productDialog.includes('Dialog'), 'ProductFormDialog uses Dialog');
  assert.ok(productDialog.includes('border-flo-border'), 'ProductFormDialog uses flo tokens');
  assert.ok(productDialog.includes('min-h-11'), 'ProductFormDialog uses min-h-11 inputs');
  console.log('   ✓ products dialog flo styling');

  const tabBar = read('components/products/ProductsTabBar.tsx');
  assert.ok(tabBar.includes('border-flo-border'), 'ProductsTabBar uses flo border tokens');
  assert.ok(tabBar.includes('border-flo-brand-600'), 'ProductsTabBar active tab styling');
  console.log('   ✓ ProductsTabBar flo styling');

  const productsTable = read('components/products/ProductsTable.tsx');
  assert.ok(productsTable.includes('Panel'), 'ProductsTable uses Panel');
  assert.ok(productsTable.includes('StatusBadge'), 'ProductsTable uses StatusBadge');
  assert.ok(productsTable.includes('EmptyState'), 'ProductsTable uses EmptyState');
  assert.ok(productsTable.includes('activeStatusVariant'), 'ProductsTable active/inactive badge');
  assert.ok(!productsTable.includes('bg-white rounded-xl border border-gray-100'), 'legacy card removed from ProductsTable');
  console.log('   ✓ ProductsTable flo styling');

  const categoriesTable = read('components/products/CategoriesTable.tsx');
  assert.ok(categoriesTable.includes('Panel'), 'CategoriesTable uses Panel');
  assert.ok(categoriesTable.includes('StatusBadge'), 'CategoriesTable uses StatusBadge');
  console.log('   ✓ CategoriesTable flo styling');

  const floDisplay = read('lib/flo-display.ts');
  assert.ok(floDisplay.includes('activeStatusVariant'), 'activeStatusVariant helper');
  console.log('   ✓ flo-display helpers');

  const pkg = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  assert.ok(pkg.includes('test:flo-products'), 'test:flo-products npm script');
  assert.ok(pkg.includes('npm run test:flo-products'), 'test:flo-products wired into test:security');
  console.log('   ✓ npm scripts wired');

  console.log('='.repeat(60));
  console.log('✅ Phase 8 Flo Products workspace contracts passed');
}

main();
