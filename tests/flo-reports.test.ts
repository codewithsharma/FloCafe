/**
 * Phase 10 Reports hub contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-reports.test.ts
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
  console.log('Phase 10 Flo Reports Hub Contracts');
  console.log('='.repeat(60));

  const reports = read('app/(dashboard)/reports/page.tsx');
  assert.ok(reports.includes('PageHeader'), 'reports uses PageHeader');
  assert.ok(reports.includes('MetricCard'), 'reports uses MetricCard');
  assert.ok(reports.includes('Panel'), 'reports uses Panel');
  assert.ok(reports.includes('LoadingState'), 'reports uses LoadingState');
  assert.ok(reports.includes('StatusBadge'), 'reports uses StatusBadge');
  assert.ok(reports.includes('EmptyState'), 'reports uses EmptyState');
  assert.ok(reports.includes('type="date"'), 'reports has date picker');
  assert.ok(reports.includes('/reports/daily-stats'), 'daily-stats API wired');
  assert.ok(reports.includes('/reports/summary'), 'summary API wired');
  assert.ok(reports.includes('/reports/topProducts'), 'topProducts API wired');
  assert.ok(reports.includes('/reports/recentOrders'), 'recentOrders API wired');
  assert.ok(reports.includes('/reports/insights'), 'insights API wired');
  assert.ok(!reports.includes('preparingTitle'), 'placeholder preparing UI removed');
  assert.ok(!reports.includes('bg-white rounded-xl'), 'legacy card pattern not used');
  console.log('   ✓ reports hub live analytics');

  const nav = read('config/navigation.ts');
  assert.ok(
    /id:\s*'reports'[\s\S]*?status:\s*'live'/.test(nav),
    'reports nav status is live',
  );
  console.log('   ✓ navigation status live');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  const es = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/es.json'), 'utf8');
  const pt = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/pt.json'), 'utf8');
  for (const [label, src] of [
    ['en', en],
    ['es', es],
    ['pt', pt],
  ] as const) {
    assert.ok(src.includes('"flo.reports.title"'), `${label} flo.reports.title`);
    assert.ok(src.includes('"flo.reports.description"'), `${label} flo.reports.description`);
  }
  console.log('   ✓ i18n keys');

  console.log('='.repeat(60));
  console.log('✅ Phase 10 Flo Reports contracts passed');
}

main();
