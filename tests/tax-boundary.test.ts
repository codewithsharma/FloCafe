/**
 * Phase 2.7 — Tax domain boundary characterization.
 *
 * Locks money-path discount scaling + TaxService facade behavior.
 * Does NOT change rounding conventions.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/tax-boundary.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-tax-boundary-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const assert = require('node:assert/strict');
const {
  calculateTax,
  scaleItemTaxForDiscountRatio,
  scaleItemTaxAfterOrderDiscount,
  computeDiscountTaxRatio,
  applyPayableRounding,
  calculateItemTax,
} = require('../main/services/tax');
const { TaxEngine } = require('../main/services/tax-engine');

const dualRatePackData = require('./fixtures/synthetic-dual-rate-pack.json');

function main(): void {
  console.log('Phase 2.7 Tax Boundary Characterization');
  console.log('='.repeat(60));

  // ── Facade: calculateTax === TaxEngine.calculate ─────────────────────────
  const engineInput = {
    pack: dualRatePackData,
    country: 'IN',
    businessType: 'restaurant',
    storeStateCode: '27',
    transactionDate: '2026-01-15T12:00:00.000Z',
    customer: null,
    lines: [{
      lineId: 'l1',
      kind: 'product',
      quantity: '1',
      unitPrice: '1000',
      productCategoryId: 'standard',
      taxBehavior: 'exclusive',
    }],
  };
  const viaFacade = calculateTax(engineInput);
  const viaEngine = TaxEngine.calculate(engineInput);
  assert.equal(viaFacade.lines[0].taxAmount, viaEngine.lines[0].taxAmount);
  assert.equal(viaFacade.lines[0].taxAmount, '50.00');
  console.log('   ✓ calculateTax facade matches TaxEngine (₹1000 dual-rate → 50.00)');

  // ── Golden: historical Math.round discount scale ─────────────────────────
  // 10% discount on ₹50 item tax → ratio 0.9 → 45
  assert.equal(computeDiscountTaxRatio(900, 1000), 0.9);
  const scaled10 = scaleItemTaxForDiscountRatio(50, 50, 0.9);
  assert.equal(scaled10.taxAmount, 45);
  assert.equal(scaled10.exclusiveTaxAmount, 45);
  console.log('   ✓ scaleItemTaxForDiscountRatio 50 @ 0.9 → 45 (Math.round path)');

  // Characterization: 22.50 @ 20% discount → ratio 0.8 → 18
  const scaled20 = scaleItemTaxAfterOrderDiscount({
    itemTaxAmount: 22.5,
    itemExclusiveTaxAmount: 22.5,
    discountAmount: 200,
    subtotal: 1000,
  });
  assert.equal(scaled20.taxRatio, 0.8);
  assert.equal(scaled20.taxAmount, 18);
  assert.equal(scaled20.exclusiveTaxAmount, 18);
  console.log('   ✓ scaleItemTaxAfterOrderDiscount 22.50 with 20% off → 18');

  // No discount → identity (no Math.round pass)
  const identity = scaleItemTaxAfterOrderDiscount({
    itemTaxAmount: 12.345,
    itemExclusiveTaxAmount: 12.345,
    discountAmount: 0,
    subtotal: 100,
  });
  assert.equal(identity.taxRatio, 1);
  assert.equal(identity.taxAmount, 12.345);
  console.log('   ✓ zero discount leaves tax totals unchanged');

  // Inclusive meal golden from audit: price 105 @ 5% → tax 5 (adapter needs DB;
  // engine-level inclusive covered in tax-engine.test — here we lock payable round)
  const rounded = applyPayableRounding(19.97, {
    ...dualRatePackData,
    payableRounding: { increment: '0.05', method: 'half_up' },
  });
  assert.equal(rounded.total, 19.95);
  assert.equal(rounded.adjustment, -0.02);
  console.log('   ✓ applyPayableRounding re-export 19.97 @ 0.05 → 19.95');

  // Adapter still exported (taxes disabled → zero)
  const zero = calculateItemTax(
    { country: 'IN', business_type: 'restaurant', state_code: '27', taxes_enabled: false },
    { tax_type: 'exclusive', tax_rate: 0, tax_category_id: 'standard', tax_behavior: 'exclusive' },
    100,
    null,
  );
  assert.equal(zero.tax_amount, 0);
  assert.equal(zero.tax_type, 'none');
  console.log('   ✓ calculateItemTax with taxes_enabled=false → zero');

  console.log('\nAll tax-boundary checks passed.');
}

main();
