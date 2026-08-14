/**
 * Phase 4/10 HOME command center contracts (slimmed in Phase 10).
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-home.test.ts
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
  console.log('Phase 4/10 Flo HOME Command Center Contracts');
  console.log('='.repeat(60));

  const dashboard = read('app/(dashboard)/dashboard/page.tsx');
  assert.ok(dashboard.includes('PageHeader'), 'dashboard uses PageHeader');
  assert.ok(dashboard.includes('MetricCard'), 'dashboard uses MetricCard');
  assert.ok(dashboard.includes('AttentionStrip'), 'dashboard uses AttentionStrip');
  assert.ok(dashboard.includes('LoadingState'), 'dashboard uses LoadingState');
  assert.ok(
    dashboard.includes('/reports/daily-stats'),
    'live stats API preserved for HOME metrics',
  );
  assert.ok(dashboard.includes('grossSales'), 'HOME binds grossSales');
  assert.ok(dashboard.includes('netSales'), 'HOME binds netSales');
  assert.ok(
    dashboard.includes('href="/reports"') || dashboard.includes("href='/reports'"),
    'HOME links to reports',
  );
  assert.ok(
    dashboard.includes('href="/operations"') || dashboard.includes("href='/operations'"),
    'HOME links to operations',
  );
  assert.ok(!dashboard.includes('DayCloseCard'), 'DayCloseCard moved off HOME');
  assert.ok(
    !dashboard.includes('/reports/topProducts'),
    'heavy topProducts analytics moved to Reports',
  );
  assert.ok(!dashboard.includes('/reports/insights'), 'heavy insights analytics moved to Reports');
  assert.ok(!dashboard.includes('/reports/recentOrders'), 'recent orders panel moved to Reports');
  assert.ok(
    !dashboard.includes('bg-white rounded-xl'),
    'legacy card pattern removed from dashboard',
  );
  console.log('   ✓ slim HOME command center');

  const dayClose = read('components/dashboard/DayCloseCard.tsx');
  assert.ok(dayClose.includes('Panel'), 'DayCloseCard uses Panel');
  assert.ok(dayClose.includes('VarianceIndicator'), 'DayCloseCard uses VarianceIndicator');
  assert.ok(dayClose.includes('MoneyDisplay'), 'DayCloseCard uses MoneyDisplay');
  assert.ok(dayClose.includes('postDayClose'), 'day close action preserved');
  assert.ok(dayClose.includes('open_shifts_warning'), 'open shift warning preserved');
  console.log('   ✓ DayCloseCard flo styling');

  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/flo/MetricCard.tsx')),
    'MetricCard exists',
  );
  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/flo/AttentionStrip.tsx')),
    'AttentionStrip exists',
  );
  console.log('   ✓ flo components');

  const en = fs.readFileSync(path.join(FRONTEND, 'lib/i18n/en.json'), 'utf8');
  assert.ok(en.includes('"flo.home.title"'), 'flo.home.title i18n');
  assert.ok(en.includes('"flo.home.needsAttention"'), 'flo.home.needsAttention i18n');
  assert.ok(
    en.includes('"flo.home.openReports"') || en.includes('"flo.home.viewReports"'),
    'HOME reports CTA i18n',
  );
  assert.ok(
    en.includes('"flo.home.openOperations"') || en.includes('"flo.home.viewOperations"'),
    'HOME operations CTA i18n',
  );
  console.log('   ✓ i18n keys');

  console.log('='.repeat(60));
  console.log('✅ Phase 4/10 Flo HOME contracts passed');
}

main();
