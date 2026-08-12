/**
 * Phase 5 POS layout contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-pos.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FRONTEND = path.join(__dirname, '../frontend/src');

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main(): void {
  console.log('Phase 5 Flo POS Layout Contracts');
  console.log('='.repeat(60));

  const posPage = read('app/(dashboard)/pos/page.tsx');
  assert.ok(posPage.includes('ProductGrid'), 'POS page uses ProductGrid');
  assert.ok(posPage.includes('CartPanel'), 'POS page uses CartPanel');
  assert.ok(posPage.includes('PaymentModal'), 'POS page uses PaymentModal');
  assert.ok(posPage.includes('PrepaidCheckoutModal'), 'POS page uses PrepaidCheckoutModal');
  assert.ok(posPage.includes('useBarcodeScanner'), 'barcode scanner preserved');
  assert.ok(posPage.includes('PREPAID_ATTEMPT_STORAGE_KEY'), 'prepaid idempotency preserved');
  assert.ok(posPage.includes('POSTPAID_ATTEMPT_STORAGE_KEY'), 'postpaid idempotency preserved');
  assert.ok(posPage.includes('handlePrepaidCheckout'), 'prepaid checkout preserved');
  assert.ok(posPage.includes('PosWorkspace'), 'POS uses PosWorkspace layout');
  console.log('   ✓ POS page orchestration preserved');

  const topbar = read('components/pos/PosTopbar.tsx');
  assert.ok(topbar.includes('flo-'), 'PosTopbar uses flo tokens');
  assert.ok(topbar.includes('min-h-11'), 'PosTopbar touch targets');
  console.log('   ✓ PosTopbar flo styling');

  const grid = read('components/pos/ProductGrid.tsx');
  assert.ok(grid.includes('data-testid="pos-product-grid"'), 'product grid test id preserved');
  assert.ok(grid.includes('data-testid="pos-product-card"'), 'product card test id preserved');
  assert.ok(grid.includes('flo-'), 'ProductGrid uses flo tokens');
  assert.ok(grid.includes('min-h-[88px]') || grid.includes('min-h-11'), 'product cards touch-friendly');
  console.log('   ✓ ProductGrid flo styling');

  const cart = read('components/pos/CartPanel.tsx');
  assert.ok(cart.includes('text-numeric-xl') || cart.includes('MoneyDisplay'), 'cart total hierarchy');
  assert.ok(cart.includes('flo-'), 'CartPanel uses flo tokens');
  assert.ok(cart.includes('min-h-12') || cart.includes('size="lg"'), 'primary action sizing');
  console.log('   ✓ CartPanel flo styling');

  const workspace = read('components/flo/pos/PosWorkspace.tsx');
  assert.ok(workspace.includes('PosWorkspace'), 'PosWorkspace component exists');
  assert.ok(workspace.includes('w-[320px]'), 'desktop order panel width');
  console.log('   ✓ PosWorkspace layout primitive');

  console.log('='.repeat(60));
  console.log('✅ Phase 5 Flo POS layout contracts passed');
}

main();
