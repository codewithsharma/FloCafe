/**
 * Phase 2.4–2.5 — Settings tab module capability gating contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-settings-module-gating.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isModuleEnabled, verticalIdForBusinessType } from '../main/modules';

const ROOT = path.join(__dirname, '..');
const SETTINGS_PAGE = path.join(ROOT, 'frontend/src/app/(dashboard)/settings/page.tsx');

function readSettingsPage(): string {
  return fs.readFileSync(SETTINGS_PAGE, 'utf8');
}

function main(): void {
  console.log('Phase 2.4–2.5 Settings Module Gating Contracts');
  console.log('='.repeat(60));

  const source = readSettingsPage();

  assert.ok(source.includes("from '@/lib/modules'"), 'settings imports module registry');
  assert.ok(source.includes('isModuleEnabled'), 'settings uses isModuleEnabled');
  assert.ok(source.includes('verticalIdForBusinessType'), 'settings resolves vertical id');

  const restaurantVertical = verticalIdForBusinessType('restaurant');
  for (const mod of [
    'tax',
    'shift',
    'kds',
    'loyalty',
    'printing',
    'notification',
    'backup',
  ] as const) {
    assert.equal(isModuleEnabled(mod, restaurantVertical), true, `${mod} enabled for restaurant`);
  }

  const gates: Array<{ tab: string; showVar: string; module: string }> = [
    { tab: 'tax', showVar: 'showTaxSettingsTab', module: 'tax' },
    { tab: 'shifts', showVar: 'showShiftsSettingsTab', module: 'shift' },
    { tab: 'kds', showVar: 'showKdsSettingsTab', module: 'kds' },
    { tab: 'loyalty', showVar: 'showLoyaltySettingsTab', module: 'loyalty' },
    { tab: 'receipts-printers', showVar: 'showPrintingSettingsTab', module: 'printing' },
    { tab: 'whatsapp', showVar: 'showNotificationSettingsTab', module: 'notification' },
    { tab: 'data', showVar: 'showBackupSettingsTab', module: 'backup' },
  ];

  for (const gate of gates) {
    assert.ok(source.includes(gate.showVar), `${gate.showVar} defined`);
    assert.ok(
      source.includes(`isModuleEnabled('${gate.module}'`),
      `${gate.module} module gate present`,
    );
    assert.ok(
      source.includes(`value="${gate.tab}"`) && source.includes(`{${gate.showVar} &&`),
      `${gate.tab} nav wrapped by ${gate.showVar}`,
    );
    assert.ok(
      source.includes(`<TabsContent value="${gate.tab}"`) && source.includes(`{${gate.showVar} &&`),
      `${gate.tab} content wrapped by ${gate.showVar}`,
    );
  }

  assert.ok(
    source.includes('showTaxSettingsTab') && source.includes('canViewTaxConfiguration'),
    'tax retains owner/manager role gate',
  );
  assert.ok(
    source.includes('showShiftsSettingsTab') && source.includes('canViewTaxConfiguration'),
    'shifts retains owner/manager role gate',
  );

  assert.ok(
    !source.includes('isFeatureAvailable('),
    'settings tabs do not use isFeatureAvailable for visibility',
  );

  // Phase 4.1 — tables business control (tablesRequired) gated by tables module
  assert.ok(source.includes('showTablesBusinessControls'), 'showTablesBusinessControls defined');
  assert.ok(
    source.includes("isModuleEnabled('tables'"),
    'tables module gate present for business controls',
  );
  assert.ok(
    source.includes("t('settings.tablesRequired')") &&
      source.includes('{showTablesBusinessControls &&'),
    'tablesRequired UI wrapped by showTablesBusinessControls',
  );
  assert.equal(
    isModuleEnabled('tables', 'retail-test'),
    false,
    'retail-test vertical disables tables module',
  );
  assert.equal(isModuleEnabled('tables', 'restaurant'), true, 'restaurant vertical enables tables');

  console.log('   ✓ module registry imports and gate variables');
  console.log('   ✓ tax/shifts/kds/loyalty/printing/notification/backup guarded');
  console.log('   ✓ tablesRequired guarded by tables module (Phase 4.1)');
  console.log('   ✓ restaurant vertical keeps all candidate tabs enabled');
  console.log('\n' + '='.repeat(60));
  console.log('All settings module gating contract tests passed.');
}

main();
