/**
 * Phase 11 Settings Flo shell contracts (pragmatic — shell only, not full tab rewrite).
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-settings.test.ts
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
  console.log('Phase 11 Flo Settings Shell Contracts');
  console.log('='.repeat(60));

  const page = read('app/(dashboard)/settings/page.tsx');

  assert.ok(page.includes('PageHeader'), 'settings uses PageHeader');
  assert.ok(
    page.includes('flo.settings') ||
      page.includes("t('flo.settings.title')") ||
      page.includes('text-flo-') ||
      page.includes('border-flo-') ||
      page.includes('bg-flo-'),
    'settings shell uses Flo tokens or flo.settings keys',
  );
  console.log('   ✓ PageHeader / Flo tokens present');

  assert.ok(
    page.includes("searchParams?.get('tab')") || page.includes('searchParams.get(\'tab\')'),
    '?tab= deep-link init preserved',
  );
  assert.ok(page.includes("get('action')") || page.includes('action'), '?action= deep-links preserved');
  assert.ok(
    page.includes('health-check') &&
      page.includes('initialize-db') &&
      page.includes('master-pin'),
    'Electron deep-link actions preserved',
  );
  console.log('   ✓ ?tab= / ?action= routing preserved');

  assert.ok(
    page.includes('TaxConfigurationPanel') ||
      page.includes('@/components/settings/TaxConfigurationPanel'),
    'TaxConfigurationPanel import preserved',
  );
  assert.ok(
    page.includes('PaymentMethodsSettings') ||
      page.includes('@/components/settings/PaymentMethodsSettings'),
    'PaymentMethodsSettings import preserved',
  );
  assert.ok(
    page.includes('ShiftHistoryPanel') ||
      page.includes('@/components/shifts/ShiftHistoryPanel'),
    'ShiftHistoryPanel import preserved',
  );
  assert.ok(page.includes('value="shifts"') || page.includes("'shifts'"), 'shifts tab still present');
  console.log('   ✓ key panels/imports preserved');

  assert.ok(page.includes('isDirty'), 'dirty-state save bar still wired');
  assert.ok(page.includes('MasterPinPrompt'), 'MasterPinPrompt preserved');
  assert.ok(page.includes('HealthCheckDialog'), 'HealthCheckDialog preserved');
  assert.ok(page.includes('InitializeDatabaseDialog'), 'InitializeDatabaseDialog preserved');
  console.log('   ✓ dirty bar + Electron dialogs preserved');

  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/settings/TaxConfigurationPanel.tsx')),
    'TaxConfigurationPanel exists',
  );
  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/settings/PaymentMethodsSettings.tsx')),
    'PaymentMethodsSettings exists',
  );
  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/shifts/ShiftHistoryPanel.tsx')),
    'ShiftHistoryPanel exists',
  );
  console.log('   ✓ panel source files exist');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  const es = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/es.json'), 'utf8');
  const pt = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/pt.json'), 'utf8');
  for (const [label, src] of [
    ['en', en],
    ['es', es],
    ['pt', pt],
  ] as const) {
    assert.ok(src.includes('"flo.settings.title"'), `${label} flo.settings.title`);
    assert.ok(src.includes('"flo.settings.description"'), `${label} flo.settings.description`);
  }
  console.log('   ✓ i18n keys');

  console.log('='.repeat(60));
  console.log('✅ Phase 11 Flo Settings shell contracts passed');
}

main();
