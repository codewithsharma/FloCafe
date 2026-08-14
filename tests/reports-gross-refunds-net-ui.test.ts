/**
 * Phase 3.6B — Reports/Home Gross / Refunds / Net Sales UI contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/reports-gross-refunds-net-ui.test.ts
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
  console.log('Phase 3.6B Reports Gross / Refunds / Net UI');
  console.log('='.repeat(60));

  const reports = read('app/(dashboard)/reports/page.tsx');
  assert.ok(/grossSales/.test(reports), 'reports page binds grossSales');
  assert.ok(/netSales/.test(reports), 'reports page binds netSales');
  assert.ok(
    /refunds/.test(reports) && /dashboard\.refunds|flo\.reports\.refunds/.test(reports),
    'reports page shows refunds tile label',
  );
  assert.ok(
    !/value:\s*fmt\(isToday \? \(stats\?\.sales/.test(reports),
    'reports primary sales tile no longer uses legacy sales-only binding',
  );
  console.log('   ✓ reports binds Gross / Refunds / Net');

  const dashboard = read('app/(dashboard)/dashboard/page.tsx');
  assert.ok(/grossSales/.test(dashboard), 'dashboard binds grossSales');
  assert.ok(/netSales/.test(dashboard), 'dashboard binds netSales');
  assert.ok(/refunds/.test(dashboard), 'dashboard binds refunds');
  assert.ok(
    !/fmt\(stats\?\.sales \?\? 0\)/.test(dashboard),
    'dashboard primary sales tile no longer uses legacy sales-only binding',
  );
  console.log('   ✓ home binds Gross / Refunds / Net');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  const es = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/es.json'), 'utf8');
  const pt = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/pt.json'), 'utf8');
  for (const [label, src] of [
    ['en', en],
    ['es', es],
    ['pt', pt],
  ] as const) {
    assert.ok(src.includes('"dashboard.grossSales"'), `${label} dashboard.grossSales`);
    assert.ok(src.includes('"dashboard.refunds"'), `${label} dashboard.refunds`);
    assert.ok(src.includes('"dashboard.netSales"'), `${label} dashboard.netSales`);
  }
  console.log('   ✓ i18n Gross / Refunds / Net keys');

  // Backend must remain the source of truth — no duplicate sales math in UI helpers
  const reportsRoute = fs.readFileSync(path.join(ROOT, 'main/routes/reports.ts'), 'utf8');
  assert.ok(
    reportsRoute.includes('daySalesSemantics'),
    'reports route still owns daySalesSemantics',
  );
  assert.ok(reportsRoute.includes('grossSales'), 'API still exposes grossSales');
  console.log('   ✓ API semantics unchanged (reused)');

  console.log('='.repeat(60));
  console.log('✅ Phase 3.6B Gross / Refunds / Net UI contracts passed');
}

main();
