/**
 * Phase 2.16 — POS orchestration boundary source contracts.
 *
 * POS composes Order/Payment/Tax/Inventory; it does not own those domains.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/pos-orchestration-boundary.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isModuleEnabled, isFeatureAvailable, verticalIdForBusinessType } from '../main/modules';
import {
  POS_OWNED,
  POS_DOES_NOT_OWN,
  assertPosOrchestrationInvariants,
} from '../frontend/src/lib/pos/orchestration';
import {
  placePostpaidOrder,
  placePrepaidOrder,
} from '../frontend/src/lib/pos/checkout-coordinator';

const ROOT = path.join(__dirname, '..');
const POS_PAGE = path.join(ROOT, 'frontend/src/app/(dashboard)/pos/page.tsx');
const COORDINATOR = path.join(ROOT, 'frontend/src/lib/pos/checkout-coordinator.ts');
const ORCHESTRATION = path.join(ROOT, 'frontend/src/lib/pos/orchestration.ts');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function main(): void {
  console.log('Phase 2.16 POS Orchestration Boundary Contracts');
  console.log('='.repeat(60));

  assert.ok(fs.existsSync(COORDINATOR), 'checkout-coordinator.ts exists');
  assert.ok(fs.existsSync(ORCHESTRATION), 'orchestration.ts exists');

  const page = read(POS_PAGE);
  const coordinator = read(COORDINATOR);
  const orchestration = read(ORCHESTRATION);

  // --- imports / coordinator seam ---
  assert.ok(page.includes("from '@/lib/modules'"), 'pos page imports module registry');
  assert.ok(page.includes('isModuleEnabled'), 'pos page uses isModuleEnabled');
  assert.ok(
    page.includes("from '@/lib/pos/checkout-coordinator'") ||
      page.includes('placePostpaidOrder') ||
      page.includes('placePrepaidOrder'),
    'pos page wires checkout coordinator',
  );
  assert.ok(page.includes('placePostpaidOrder'), 'page calls placePostpaidOrder');
  assert.ok(page.includes('placePrepaidOrder'), 'page calls placePrepaidOrder');
  assert.ok(
    coordinator.includes('export async function placePostpaidOrder'),
    'coordinator exports placePostpaidOrder',
  );
  assert.ok(
    coordinator.includes('export async function placePrepaidOrder'),
    'coordinator exports placePrepaidOrder',
  );
  assert.ok(coordinator.includes("'/orders'"), 'coordinator posts /orders');
  assert.ok(coordinator.includes('/bills/generate'), 'coordinator posts bill generate');
  assert.ok(coordinator.includes('/payments'), 'coordinator posts bill payments');

  // --- ownership markers ---
  assert.ok(Array.isArray(POS_OWNED) && POS_OWNED.length > 0, 'POS_OWNED exported');
  assert.ok(
    Array.isArray(POS_DOES_NOT_OWN) && POS_DOES_NOT_OWN.length > 0,
    'POS_DOES_NOT_OWN exported',
  );
  assert.ok(
    POS_DOES_NOT_OWN.some((s) => /tax engine/i.test(s)),
    'POS_DOES_NOT_OWN documents tax engine',
  );
  assert.ok(
    POS_DOES_NOT_OWN.some((s) => /inventory/i.test(s) && /stock/i.test(s)),
    'POS_DOES_NOT_OWN documents inventory stock',
  );
  assert.ok(
    POS_DOES_NOT_OWN.some((s) => /payment tender/i.test(s)),
    'POS_DOES_NOT_OWN documents payment tender internals',
  );
  assertPosOrchestrationInvariants();
  assert.ok(
    orchestration.includes('POS_DOES_NOT_OWN') && orchestration.includes('tax engine'),
    'orchestration source documents POS_DOES_NOT_OWN tax engine',
  );

  // --- module gates: tables (existing), addons, kds/kot ---
  // Phase 3.3: gates may pass composition verticalId: isModuleEnabled('tables', verticalId)
  assert.ok(/isModuleEnabled\(\s*['"]tables['"]/.test(page), 'tables module gate present');
  assert.ok(/isModuleEnabled\(\s*['"]addons['"]/.test(page), 'addons module gate present');
  assert.ok(
    /isFeatureAvailable\(\s*['"]kds['"]/.test(page) ||
      (/isModuleEnabled\(\s*['"]kds['"]/.test(page) && page.includes('kotPrintingEnabled')),
    'KOT print gated with kds module + kotPrintingEnabled (isFeatureAvailable pattern)',
  );
  assert.ok(
    page.includes('addonsModuleEnabled') && page.includes('AddonModal'),
    'AddonModal flow gated behind addonsModuleEnabled',
  );

  const restaurantVertical = verticalIdForBusinessType('restaurant');
  for (const mod of ['tables', 'addons', 'kds', 'pos', 'order', 'payment'] as const) {
    assert.equal(isModuleEnabled(mod, restaurantVertical), true, `${mod} enabled for restaurant`);
  }
  assert.equal(
    isFeatureAvailable('kds', true, restaurantVertical),
    true,
    'kds + flag true → available for restaurant',
  );
  assert.equal(
    isFeatureAvailable('kds', false, restaurantVertical),
    false,
    'kds module on but kot flag off → unavailable',
  );

  // --- coordinator functions are callable (smoke) ---
  assert.equal(typeof placePostpaidOrder, 'function');
  assert.equal(typeof placePrepaidOrder, 'function');

  // --- no POS backend god-service ---
  const posInfo = path.join(ROOT, 'main/routes/pos-info.ts');
  if (fs.existsSync(posInfo)) {
    const src = read(posInfo);
    assert.ok(src.split('\n').length < 120, 'pos-info.ts stays thin');
    assert.ok(
      !/calculateTax|decrementStock|preparePaymentBatch/.test(src),
      'pos-info does not own domain math',
    );
  }

  console.log('   ✓ checkout-coordinator + orchestration ownership markers');
  console.log('   ✓ page wires placePostpaidOrder / placePrepaidOrder');
  console.log('   ✓ tables / addons / kds+kot gates');
  console.log('   ✓ restaurant vertical keeps modules enabled (UX identical)');
  console.log('\n' + '='.repeat(60));
  console.log('All POS orchestration boundary contract tests passed.');
}

main();
