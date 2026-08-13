/**
 * Phase 2.11 — Tax snapshot contract characterization.
 *
 * Freezes EngineTaxSnapshot shape + sacred money goldens at the Tax facade.
 * Does NOT change calculation math or schema.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/tax-snapshot-contract.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-tax-snap-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const assert = require('node:assert/strict');
const {
  calculateTax,
  applyPayableRounding,
  scaleItemTaxForDiscountRatio,
  scaleItemTaxAfterOrderDiscount,
  computeDiscountTaxRatio,
  aggregateTaxSnapshots,
  invertTaxSnapshot,
  scaleTaxSnapshots,
} = require('../main/services/tax');

const dualRatePackData = require('./fixtures/synthetic-dual-rate-pack.json');

const ENGINE_SNAPSHOT_KEYS = [
  'packId', 'packVersion', 'effectiveFrom',
  'taxRounding', 'payableRounding', 'appliedRuleIds', 'lines',
] as const;

const LINE_KEYS = [
  'lineId', 'categoryId', 'categorySource', 'taxBehavior',
  'grossAmount', 'taxableBase', 'taxAmount', 'components',
] as const;

function assertSnapshotShape(snapshot: any, label: string): void {
  for (const key of ENGINE_SNAPSHOT_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(snapshot, key), `${label} has ${key}`);
  }
  assert.ok(Array.isArray(snapshot.lines), `${label}.lines is array`);
  assert.ok(Array.isArray(snapshot.appliedRuleIds), `${label}.appliedRuleIds is array`);
  if (snapshot.lines.length > 0) {
    const line = snapshot.lines[0];
    for (const key of LINE_KEYS) {
      assert.ok(Object.prototype.hasOwnProperty.call(line, key), `${label}.lines[0] has ${key}`);
    }
    assert.ok(Array.isArray(line.components), `${label}.lines[0].components is array`);
    if (line.components.length > 0) {
      const c = line.components[0];
      for (const key of ['ruleId', 'label', 'type', 'baseRuleIds', 'amount', 'roundingRemainder']) {
        assert.ok(Object.prototype.hasOwnProperty.call(c, key), `${label} component has ${key}`);
      }
    }
  }
}

function main(): void {
  console.log('Phase 2.11 Tax Snapshot Contract Characterization');
  console.log('='.repeat(60));

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

  // ── 1. Facade snapshot shape + dual-rate golden ─────────────────────
  console.log('\n1. calculateTax snapshot shape + ₹1000 dual-rate → 50.00');
  const calc = calculateTax(engineInput);
  assertSnapshotShape(calc.snapshot, 'engine snapshot');
  assert.equal(calc.snapshot.packId, dualRatePackData.id);
  assert.equal(calc.snapshot.packVersion, dualRatePackData.version);
  assert.equal(calc.lines[0].taxAmount, '50.00');
  assert.equal(calc.snapshot.lines[0].taxAmount, '50.00');
  assert.equal(calc.snapshot.lines[0].components[0].amount, '25.00');
  assert.equal(calc.snapshot.lines[0].components[1].amount, '25.00');
  console.log('   ✓ dual-rate exclusive ₹1000 → 50.00 with frozen keys');

  // ── 2. No session-only totals leaked into snapshot ──────────────────
  console.log('\n2. Snapshot does not require session totals fields');
  for (const leaked of [
    'subtotal', 'totalBeforePayableRounding', 'payableTotal', 'payableRoundingAdjustment',
  ]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(calc.snapshot, leaked),
      false,
      `snapshot must not expose ${leaked}`,
    );
  }
  console.log('   ✓ session totals stay on TaxCalculation, not snapshot');

  // ── 3. Zero tax / exempt path still produces snapshot lines ─────────
  console.log('\n3. Exclusive line with zero unit still yields snapshot contract');
  const zeroCalc = calculateTax({
    ...engineInput,
    lines: [{
      lineId: 'z1',
      kind: 'product',
      quantity: '1',
      unitPrice: '0',
      productCategoryId: 'standard',
      taxBehavior: 'exclusive',
    }],
  });
  assertSnapshotShape(zeroCalc.snapshot, 'zero snapshot');
  assert.equal(zeroCalc.snapshot.lines[0].taxAmount, '0.00');
  console.log('   ✓ zero unit price → taxAmount 0.00, shape intact');

  // ── 4. Inclusive behavior field present ─────────────────────────────
  console.log('\n4. Inclusive taxBehavior on snapshot line');
  const inclusive = calculateTax({
    ...engineInput,
    lines: [{
      lineId: 'i1',
      kind: 'product',
      quantity: '1',
      unitPrice: '105',
      productCategoryId: 'standard',
      taxBehavior: 'inclusive',
    }],
  });
  assert.equal(inclusive.snapshot.lines[0].taxBehavior, 'inclusive');
  assertSnapshotShape(inclusive.snapshot, 'inclusive snapshot');
  console.log('   ✓ inclusive taxBehavior frozen on line');

  // ── 5. Money-path discount goldens (Math.round) ─────────────────────
  console.log('\n5. Discount goldens unchanged (Math.round path)');
  assert.equal(computeDiscountTaxRatio(900, 1000), 0.9);
  const scaled10 = scaleItemTaxForDiscountRatio(50, 50, 0.9);
  assert.equal(scaled10.taxAmount, 45);
  assert.equal(scaled10.exclusiveTaxAmount, 45);
  const scaled20 = scaleItemTaxAfterOrderDiscount({
    itemTaxAmount: 22.5,
    itemExclusiveTaxAmount: 22.5,
    discountAmount: 200,
    subtotal: 1000,
  });
  assert.equal(scaled20.taxRatio, 0.8);
  assert.equal(scaled20.taxAmount, 18);
  assert.equal(scaled20.exclusiveTaxAmount, 18);
  console.log('   ✓ 50@0.9→45; 22.50@20%→18');

  // ── 6. Payable rounding golden ──────────────────────────────────────
  console.log('\n6. Payable rounding 19.97 @ 0.05 → 19.95');
  const payable = applyPayableRounding(19.97, {
    payableRounding: { increment: '0.05', method: 'half_up' },
    taxRounding: dualRatePackData.taxRounding,
  } as any);
  assert.equal(payable.total, 19.95);
  assert.equal(payable.adjustment, -0.02);
  console.log('   ✓ payable rounding golden');

  // ── 7. Multiple lines in one calculation ────────────────────────────
  console.log('\n7. Multiple items share one snapshot.lines array');
  const multi = calculateTax({
    ...engineInput,
    lines: [
      {
        lineId: 'm1',
        kind: 'product',
        quantity: '1',
        unitPrice: '1000',
        productCategoryId: 'standard',
        taxBehavior: 'exclusive',
      },
      {
        lineId: 'm2',
        kind: 'product',
        quantity: '1',
        unitPrice: '1000',
        productCategoryId: 'standard',
        taxBehavior: 'exclusive',
      },
    ],
  });
  assert.equal(multi.snapshot.lines.length, 2);
  assert.equal(multi.snapshot.lines[0].taxAmount, '50.00');
  assert.equal(multi.snapshot.lines[1].taxAmount, '50.00');
  console.log('   ✓ two exclusive ₹1000 lines → 50.00 each');

  // ── 8. Decimal price path ───────────────────────────────────────────
  console.log('\n8. Decimal unit price still yields string tax amounts');
  const decimalPrice = calculateTax({
    ...engineInput,
    lines: [{
      lineId: 'd1',
      kind: 'product',
      quantity: '1',
      unitPrice: '99.99',
      productCategoryId: 'standard',
      taxBehavior: 'exclusive',
    }],
  });
  assert.equal(typeof decimalPrice.snapshot.lines[0].taxAmount, 'string');
  assert.equal(typeof decimalPrice.snapshot.lines[0].grossAmount, 'string');
  assertSnapshotShape(decimalPrice.snapshot, 'decimal snapshot');
  console.log('   ✓ decimal prices keep string money fields');

  // ── 9. aggregateTaxSnapshots document array contract ────────────────
  console.log('\n9. Document snapshot is array of item snapshots (or null)');
  assert.equal(aggregateTaxSnapshots([]), null);
  assert.equal(aggregateTaxSnapshots([null, null]), null);
  const one = aggregateTaxSnapshots([JSON.stringify(calc.snapshot)]);
  assert.ok(one);
  const parsedOne = JSON.parse(one as string);
  assert.ok(Array.isArray(parsedOne));
  assert.equal(parsedOne.length, 1);
  assertSnapshotShape(parsedOne[0], 'document[0]');
  console.log('   ✓ aggregateTaxSnapshots → JSON array | null');

  // ── 10. invertTaxSnapshot void contract ─────────────────────────────
  console.log('\n10. invertTaxSnapshot negates amounts + void-adjustment suffix');
  const invertedJson = invertTaxSnapshot(JSON.stringify(calc.snapshot));
  assert.ok(invertedJson);
  const inverted = JSON.parse(invertedJson as string);
  assert.ok(String(inverted.lines[0].lineId).endsWith(':void-adjustment'));
  assert.equal(Number(inverted.lines[0].taxAmount) < 0, true);
  console.log('   ✓ void invert contract');

  // ── 11. scaleTaxSnapshots preserves shape ───────────────────────────
  console.log('\n11. scaleTaxSnapshots keeps frozen keys');
  const scaledArr = scaleTaxSnapshots([JSON.stringify(calc.snapshot)], 0.9);
  assert.ok(Array.isArray(scaledArr) && scaledArr.length === 1);
  const scaledSnap = JSON.parse(scaledArr[0]);
  assertSnapshotShape(scaledSnap, 'scaled snapshot');
  console.log('   ✓ scaled snapshot shape intact');

  // ── 12. Facade is preferred consumer entry (source check) ───────────
  console.log('\n12. Money routes import applyPayableRounding from tax facade');
  for (const rel of [
    '../main/routes/orders.ts',
    '../main/routes/bills.ts',
    '../main/routes/index.ts',
    '../main/routes/tax-packs.ts',
  ]) {
    const src = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    assert.equal(
      /from ['"]\.\.\/services\/tax-engine['"]/.test(src),
      false,
      `${rel} must not import tax-engine`,
    );
  }
  const taxPacksSrc = fs.readFileSync(path.join(__dirname, '../main/routes/tax-packs.ts'), 'utf8');
  assert.ok(taxPacksSrc.includes('calculateTax'), 'tax-packs uses calculateTax facade');
  console.log('   ✓ no route-level tax-engine imports');

  // ── 13. Vertical neutrality of snapshot keys ────────────────────────
  console.log('\n13. Snapshot keys are vertical-neutral');
  for (const forbidden of ['table', 'kot', 'kds', 'waiter', 'kitchen', 'restaurant']) {
    assert.equal(
      Object.keys(calc.snapshot).some((k) => k.toLowerCase().includes(forbidden)),
      false,
      `snapshot must not include ${forbidden}`,
    );
  }
  console.log('   ✓ no floor/KDS keys on snapshot');

  console.log('\nAll tax-snapshot-contract checks passed.');
}

main();
