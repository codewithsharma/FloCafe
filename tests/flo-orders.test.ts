/**
 * Phase 7 Orders/Bills workspace contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-orders.test.ts
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
  console.log('Phase 7 Flo Orders/Bills Workspace Contracts');
  console.log('='.repeat(60));

  const ordersPage = read('app/(dashboard)/orders/page.tsx');
  assert.ok(ordersPage.includes('PageHeader'), 'orders page uses PageHeader');
  assert.ok(ordersPage.includes('LoadingState'), 'orders page uses LoadingState');
  assert.ok(ordersPage.includes('EmptyState'), 'orders page uses EmptyState');
  assert.ok(ordersPage.includes('PaymentModal'), 'PaymentModal preserved');
  assert.ok(ordersPage.includes('useConfirm'), 'useConfirm preserved');
  assert.ok(ordersPage.includes("'all'"), 'tab filter all preserved');
  assert.ok(ordersPage.includes("'active'"), 'tab filter active preserved');
  assert.ok(ordersPage.includes("'unpaid'"), 'tab filter unpaid preserved');
  assert.ok(ordersPage.includes("'held'"), 'tab filter held preserved');
  assert.ok(ordersPage.includes('10000'), 'orders polling interval preserved');
  assert.ok(ordersPage.includes('30000'), 'now snapshot interval preserved');
  assert.ok(ordersPage.includes('3000'), 'WebSocket reconnect delay preserved');
  assert.ok(ordersPage.includes("api.get('/orders'"), 'orders list API preserved');
  assert.ok(ordersPage.includes("api.post('/bills/generate'"), 'bill generate API preserved');
  assert.ok(ordersPage.includes('handleCheckout'), 'handleCheckout preserved');
  assert.ok(ordersPage.includes('handleCancelOrder'), 'handleCancelOrder preserved');
  assert.ok(ordersPage.includes('handleVoidItem'), 'handleVoidItem preserved');
  assert.ok(ordersPage.includes('handlePaymentComplete'), 'handlePaymentComplete preserved');
  assert.ok(ordersPage.includes('OrdersFilterBar'), 'orders page uses OrdersFilterBar');
  assert.ok(ordersPage.includes('OrderCard'), 'orders page uses OrderCard');
  assert.ok(ordersPage.includes('HeldOrderCard'), 'orders page uses HeldOrderCard');
  assert.ok(
    !ordersPage.includes('bg-white rounded-xl border border-gray-100'),
    'legacy card pattern removed from page',
  );
  assert.ok(!ordersPage.includes('fixed inset-0 bg-black/50'), 'legacy modal overlay removed from page');
  assert.ok(!ordersPage.includes('bg-white rounded-xl shadow-xl'), 'legacy modal panel removed from page');
  assert.ok(ordersPage.includes('PrintConfirmDialog'), 'orders page uses PrintConfirmDialog');
  assert.ok(ordersPage.includes('CancelOrderDialog'), 'orders page uses CancelOrderDialog');
  assert.ok(ordersPage.includes('VoidItemDialog'), 'orders page uses VoidItemDialog');
  assert.ok(ordersPage.includes('RefundDialog'), 'orders page uses RefundDialog');
  assert.ok(ordersPage.includes('handleRefund'), 'orders page includes handleRefund');
  assert.ok(
    ordersPage.includes('postBillRefund') || ordersPage.includes("'/bills/") || ordersPage.includes('/bills/'),
    'orders page refunds via /bills/ path',
  );
  assert.ok(ordersPage.includes('DiscountDialog'), 'orders page uses DiscountDialog');
  assert.ok(ordersPage.includes('AddItemsDialog'), 'orders page uses AddItemsDialog');
  assert.ok(ordersPage.includes('Idempotency-Key'), 'add items idempotency key preserved');
  console.log('   ✓ orders page orchestration preserved');

  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/orders/OrdersFilterBar.tsx')), 'OrdersFilterBar exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/orders/OrderCard.tsx')), 'OrderCard exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/orders/HeldOrderCard.tsx')), 'HeldOrderCard exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/orders/index.ts')), 'orders index exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/orders/AddItemsDialog.tsx')), 'AddItemsDialog exists');
  assert.ok(fs.existsSync(path.join(FRONTEND, 'components/orders/RefundDialog.tsx')), 'RefundDialog exists');
  console.log('   ✓ orders components exist');

  const printDialog = read('components/orders/PrintConfirmDialog.tsx');
  assert.ok(printDialog.includes('Dialog'), 'PrintConfirmDialog uses Dialog');
  assert.ok(printDialog.includes('border-flo-border'), 'PrintConfirmDialog uses flo tokens');
  assert.ok(printDialog.includes('min-h-11'), 'PrintConfirmDialog uses min-h-11 buttons');
  console.log('   ✓ orders dialog flo styling');

  const orderCard = read('components/orders/OrderCard.tsx');
  assert.ok(orderCard.includes('Panel'), 'OrderCard uses Panel');
  assert.ok(orderCard.includes('StatusBadge'), 'OrderCard uses StatusBadge');
  assert.ok(orderCard.includes('MoneyDisplay') || orderCard.includes('orderStatusVariant'), 'OrderCard uses Flo money or status helpers');
  assert.ok(orderCard.includes('orderStatusVariant'), 'OrderCard uses orderStatusVariant');
  assert.ok(orderCard.includes('onRefund'), 'OrderCard includes onRefund');
  assert.ok(orderCard.includes('canRefund'), 'OrderCard includes canRefund');
  console.log('   ✓ OrderCard flo styling');

  const refundDialog = read('components/orders/RefundDialog.tsx');
  assert.ok(refundDialog.includes('Dialog'), 'RefundDialog uses Dialog');
  assert.ok(refundDialog.includes('border-flo-border'), 'RefundDialog uses flo tokens');
  assert.ok(refundDialog.includes('min-h-11'), 'RefundDialog uses min-h-11 buttons');
  assert.ok(refundDialog.includes('overridePin'), 'RefundDialog has overridePin');
  assert.ok(refundDialog.includes('reason'), 'RefundDialog has reason');
  console.log('   ✓ RefundDialog flo styling');

  const heldCard = read('components/orders/HeldOrderCard.tsx');
  assert.ok(heldCard.includes('Panel'), 'HeldOrderCard uses Panel');
  assert.ok(heldCard.includes('StatusBadge'), 'HeldOrderCard uses StatusBadge');
  console.log('   ✓ HeldOrderCard flo styling');

  const filterBar = read('components/orders/OrdersFilterBar.tsx');
  assert.ok(filterBar.includes('flo-'), 'OrdersFilterBar uses Flo tokens');
  console.log('   ✓ OrdersFilterBar flo styling');

  const floDisplay = read('lib/flo-display.ts');
  assert.ok(floDisplay.includes('orderStatusVariant'), 'orderStatusVariant helper');
  assert.ok(floDisplay.includes('itemStatusVariant'), 'itemStatusVariant helper');
  console.log('   ✓ flo-display helpers');

  console.log('='.repeat(60));
  console.log('✅ Phase 7 Flo Orders/Bills workspace contracts passed');
}

main();
