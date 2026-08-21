/**
 * RCP-05 — Recipe consumptions list UI source contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/recipe-consumptions-ui.test.ts
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
  console.log('RCP-05 Recipe Consumptions UI');
  console.log('='.repeat(60));

  const helper = read('lib/recipes.ts');
  assert.ok(helper.includes('listRecipeConsumptions'), 'client exports listRecipeConsumptions');
  assert.ok(helper.includes('/recipes/consumptions'), 'client calls /recipes/consumptions');
  assert.ok(helper.includes('order_id'), 'client can pass order_id filter');
  assert.ok(helper.includes('RecipeConsumption'), 'typed consumption shape');
  console.log('   ✓ recipes client');

  const pagePath = 'app/(dashboard)/products/recipes/consumptions/page.tsx';
  assert.ok(fs.existsSync(path.join(FRONTEND, pagePath)), 'consumptions page exists');
  const page = read(pagePath);
  assert.ok(page.includes('isOwnerOrManager'), 'owner/manager gate');
  assert.ok(page.includes("isModuleEnabled('inventory')"), 'inventory module fail-closed');
  assert.ok(page.includes('listRecipeConsumptions'), 'lists consumptions via helper');
  assert.ok(page.includes('LoadingState'), 'loading state');
  assert.ok(page.includes('EmptyState'), 'empty state');
  assert.ok(page.includes('order_id') || page.includes('orderId'), 'order filter surface');
  assert.ok(page.includes('lines'), 'renders consumption lines');
  assert.ok(page.includes('quantity_delta') || page.includes('quantityDelta'), 'shows line quantity');
  assert.ok(page.includes('status'), 'shows consumption status');
  assert.ok(!/getDatabase\(/.test(page), 'no direct SQLite');
  console.log('   ✓ consumptions page contracts');

  const recipesPage = read('app/(dashboard)/products/recipes/page.tsx');
  assert.ok(
    recipesPage.includes('/products/recipes/consumptions'),
    'recipes page links to consumptions',
  );
  console.log('   ✓ recipes hub link');

  const products = read('app/(dashboard)/products/page.tsx');
  assert.ok(
    products.includes('/products/recipes/consumptions') ||
      products.includes('recipeConsumptions'),
    'products hub can reach consumptions (direct or via recipes)',
  );
  console.log('   ✓ products hub reachability');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('recipeConsumptions.title'), 'en recipeConsumptions.title');
  assert.ok(en.includes('recipeConsumptions.emptyTitle'), 'en empty title');
  assert.ok(en.includes('recipeConsumptions.loadFailed'), 'en loadFailed');
  console.log('   ✓ i18n keys');

  console.log('='.repeat(60));
  console.log('✅ RCP-05 recipe consumptions UI contracts passed');
}

main();
