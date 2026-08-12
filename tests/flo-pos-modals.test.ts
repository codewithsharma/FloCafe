/**
 * Flo POS modal migration contracts.
 *
 * Usage: npm run test:flo-pos-modals
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');
const POS_DIR = path.join(FRONTEND, 'components/pos');
const POS_PAGE = path.join(FRONTEND, 'app/(dashboard)/pos/page.tsx');

const LEGACY_OVERLAY = 'fixed inset-0 bg-black/50';

const MIGRATED = [
  'PaymentModal.tsx',
  'PrepaidCheckoutModal.tsx',
  'AddonModal.tsx',
  'TablePickerModal.tsx',
  'TableCheckoutModal.tsx',
  'EditCustomerModal.tsx',
  'SplitCheckModal.tsx',
  'CustomerSearch.tsx',
  'PrinterStatus.tsx',
] as const;

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function assertNoLegacyOverlay(label: string, source: string): void {
  assert.ok(
    !source.includes(LEGACY_OVERLAY),
    `${label} must not contain legacy overlay "${LEGACY_OVERLAY}"`,
  );
  assert.ok(
    !/fixed\s+inset-0\s+bg-black\/\d+/.test(source),
    `${label} must not contain custom fixed inset-0 bg-black/* overlays`,
  );
}

function assertFloOrDialog(label: string, source: string): void {
  const hasDialog = source.includes('@/components/ui/dialog') || source.includes('DialogContent');
  const hasFlo = source.includes('flo-') || source.includes('bg-flo-') || source.includes('text-flo-');
  assert.ok(hasDialog || hasFlo, `${label} must use Dialog and/or Flo tokens`);
}

function main(): void {
  console.log('Flo POS Modals Migration Contracts');
  console.log('='.repeat(60));

  for (const name of MIGRATED) {
    const filePath = path.join(POS_DIR, name);
    assert.ok(fs.existsSync(filePath), `missing migrated file: ${name}`);
    const source = read(filePath);
    assertNoLegacyOverlay(name, source);
    assertFloOrDialog(name, source);
    console.log(`   ✓ ${name}`);
  }

  const posPage = read(POS_PAGE);
  assertNoLegacyOverlay('pos/page.tsx', posPage);
  assert.ok(
    posPage.includes('@/components/ui/dialog') || posPage.includes('DialogContent'),
    'pos/page.tsx customer prompt must use Dialog',
  );
  assert.ok(posPage.includes('flo-') || posPage.includes('bg-flo-'), 'pos/page.tsx uses Flo tokens');
  console.log('   ✓ pos/page.tsx');

  // Scan entire POS components directory for legacy overlays
  for (const entry of fs.readdirSync(POS_DIR)) {
    if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;
    assertNoLegacyOverlay(`components/pos/${entry}`, read(path.join(POS_DIR, entry)));
  }
  console.log('   ✓ zero legacy overlays under components/pos/');

  const payment = read(path.join(POS_DIR, 'PaymentModal.tsx'));
  assert.ok(payment.includes('/bills/') || payment.includes('`/bills/'), 'PaymentModal references bills API');
  assert.ok(payment.includes('/payments'), 'PaymentModal references payments API');
  assert.ok(payment.includes('/wallet') || payment.includes('wallet'), 'PaymentModal references wallet');
  assert.ok(payment.includes('Idempotency-Key') || payment.includes('idempotency'), 'PaymentModal preserves idempotency');
  assert.ok(payment.includes('Dialog'), 'PaymentModal uses Dialog');
  console.log('   ✓ PaymentModal critical APIs preserved');

  console.log('='.repeat(60));
  console.log('✅ Flo POS modals migration contracts passed');
}

main();
