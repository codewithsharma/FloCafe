/**
 * M6.1 — Minimal Orders refund UI contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-refund-ui.test.ts
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
  console.log('M6.1 Flo Refund UI Contracts');
  console.log('='.repeat(60));

  assert.ok(fs.existsSync(path.join(FRONTEND, 'lib/refunds.ts')), 'refunds.ts exists');
  const refunds = read('lib/refunds.ts');
  assert.ok(refunds.includes('postBillRefund'), 'postBillRefund exported');
  assert.ok(refunds.includes('extractRefundErrorMessage'), 'extractRefundErrorMessage exported');
  assert.ok(refunds.includes('/bills/'), 'posts to /bills/ path');
  assert.ok(refunds.includes('refund'), 'refund path segment present');
  assert.ok(
    refunds.includes('Idempotency-Key') || refunds.includes('idempotencyKey'),
    'idempotency supported',
  );
  console.log('   ✓ refunds.ts client contract');

  const terminalId = read('lib/terminal-id.ts');
  assert.ok(
    terminalId.includes('refund') && /bills.*refund|refund.*bills/s.test(terminalId),
    'terminal-id attaches refund path',
  );
  assert.ok(
    shouldAttachSnippetExpectsTrue(terminalId),
    'shouldAttachTerminalId includes refund route',
  );
  console.log('   ✓ terminal-id attaches refund path');

  const types = read('lib/types.ts');
  assert.ok(
    types.includes("'partially_refunded'"),
    'Bill.payment_status includes partially_refunded',
  );
  assert.ok(types.includes("'refunded'"), 'Bill.payment_status includes refunded');
  console.log('   ✓ types include refund payment statuses');

  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/orders/RefundDialog.tsx')),
    'RefundDialog exists',
  );
  const refundDialog = read('components/orders/RefundDialog.tsx');
  assert.ok(refundDialog.includes('Dialog'), 'RefundDialog uses Dialog');
  assert.ok(refundDialog.includes('border-flo-border'), 'RefundDialog uses flo border');
  assert.ok(refundDialog.includes('min-h-11'), 'RefundDialog uses min-h-11');
  assert.ok(refundDialog.includes('overridePin'), 'RefundDialog has overridePin');
  assert.ok(refundDialog.includes('reason'), 'RefundDialog has reason');
  console.log('   ✓ RefundDialog flo styling');

  const orderCard = read('components/orders/OrderCard.tsx');
  assert.ok(orderCard.includes('onRefund'), 'OrderCard includes onRefund');
  assert.ok(orderCard.includes('canRefund'), 'OrderCard includes canRefund');
  assert.ok(
    orderCard.includes('onPrintRefund') || orderCard.includes('printRefund'),
    'OrderCard print refund affordance',
  );
  assert.ok(
    orderCard.includes('partially_refunded') && orderCard.includes('refunded'),
    'OrderCard PaymentStatus includes refund statuses',
  );
  console.log('   ✓ OrderCard refund affordances');

  const ordersPage = read('app/(dashboard)/orders/page.tsx');
  assert.ok(ordersPage.includes('RefundDialog'), 'orders page includes RefundDialog');
  assert.ok(ordersPage.includes('handleRefund'), 'orders page includes handleRefund');
  assert.ok(
    ordersPage.includes('printRefund') || ordersPage.includes('print-refund'),
    'orders page prints refund receipt',
  );
  assert.ok(
    ordersPage.includes('postBillRefund') || ordersPage.includes('/bills/'),
    'orders page posts bill refund',
  );
  assert.ok(ordersPage.includes('canRefund'), 'orders page wires canRefund');
  console.log('   ✓ orders page refund orchestration');

  const index = read('components/orders/index.ts');
  assert.ok(index.includes('RefundDialog'), 'orders index exports RefundDialog');
  console.log('   ✓ orders index exports RefundDialog');

  for (const locale of ['en', 'es', 'pt']) {
    const i18n = read(`lib/i18n/${locale}.json`);
    for (const key of [
      'orders.refund',
      'orders.refundConfirm',
      'orders.refundReason',
      'orders.refundAmount',
      'orders.refundAmountHint',
      'orders.confirmRefund',
      'orders.refunding',
      'orders.refundSuccess',
      'orders.refundFailed',
      'orders.refunded',
      'orders.partiallyRefunded',
    ]) {
      assert.ok(i18n.includes(`"${key}"`), `${locale}.json has ${key}`);
    }
  }
  console.log('   ✓ i18n refund keys present');

  console.log('='.repeat(60));
  console.log('✅ M6.1 Flo refund UI contracts passed');
}

function shouldAttachSnippetExpectsTrue(source: string): boolean {
  return (
    /\/bills\/[^/]+\/refund/.test(source) ||
    source.includes("'/refund'") ||
    source.includes('"/refund"') ||
    source.includes('refund')
  );
}

main();
