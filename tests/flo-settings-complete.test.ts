/**
 * Settings tab body Flo migration contracts — Panel replaces legacy card wrappers.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-settings-complete.test.ts
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
  console.log('Settings Flo Tab Body Complete Contracts');
  console.log('='.repeat(60));

  const page = read('app/(dashboard)/settings/page.tsx');

  assert.ok(page.includes('PageHeader'), 'settings uses PageHeader');
  assert.ok(page.includes('Panel'), 'settings uses Panel');
  assert.ok(
    (page.match(/<Panel[\s>]/g) || []).length >= 30,
    'settings tab bodies use Panel extensively',
  );
  assert.ok(
    !page.includes('bg-white rounded-xl border border-gray-100'),
    'legacy bg-white card wrappers removed from settings page',
  );
  assert.ok(
    !page.includes('bg-flo-surface rounded-flo-lg border border-flo-border p-6'),
    'inline flo-surface card divs replaced with Panel',
  );
  console.log('   ✓ PageHeader + Panel usage; legacy wrappers removed');

  assert.ok(
    page.includes("searchParams?.get('tab')") || page.includes("searchParams.get('tab')"),
    '?tab= deep-link init preserved',
  );
  assert.ok(page.includes("get('action')") || page.includes('action'), '?action= deep-links preserved');
  console.log('   ✓ ?tab= routing preserved');

  const paymentMethods = read('components/settings/PaymentMethodsSettings.tsx');
  assert.ok(paymentMethods.includes('Panel'), 'PaymentMethodsSettings uses Panel');
  assert.ok(
    !paymentMethods.includes('bg-white rounded-xl border border-gray-100'),
    'legacy wrappers removed from PaymentMethodsSettings',
  );
  console.log('   ✓ extracted PaymentMethodsSettings migrated');

  const taxPanel = read('components/settings/TaxConfigurationPanel.tsx');
  assert.ok(taxPanel.includes('Panel'), 'TaxConfigurationPanel uses Panel');
  assert.ok(
    !taxPanel.includes('rounded-xl border border-gray-200 bg-white p-5'),
    'legacy section cards removed from TaxConfigurationPanel',
  );
  console.log('   ✓ extracted TaxConfigurationPanel migrated');

  const legacyPatterns = [
    'text-gray-900',
    'border-gray-100',
    'bg-white ',
    'text-brand',
    'bg-brand ',
  ] as const;
  for (const pattern of legacyPatterns) {
    const count = page.split(pattern).length - 1;
    assert.equal(count, 0, `settings page must have 0 occurrences of "${pattern}" (found ${count})`);
  }
  console.log('   ✓ legacy gray/brand tokens cleared from settings page');

  const settingsDir = path.join(FRONTEND, 'components/settings');
  const componentLegacy = [
    'text-gray-',
    'border-gray-',
    'bg-gray-',
    'bg-white',
    'text-brand',
    'bg-brand',
    'focus:ring-brand',
  ] as const;
  for (const file of fs.readdirSync(settingsDir).filter((f) => f.endsWith('.tsx'))) {
    const src = fs.readFileSync(path.join(settingsDir, file), 'utf8');
    for (const pattern of componentLegacy) {
      assert.equal(
        src.split(pattern).length - 1,
        0,
        `${file} must have 0 occurrences of "${pattern}"`,
      );
    }
  }
  console.log('   ✓ settings components free of legacy gray/brand tokens');

  console.log('='.repeat(60));
  console.log('✅ Settings Flo tab body complete contracts passed');
}

main();
