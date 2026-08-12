/**
 * Phase 10 Operations hub contracts.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-operations.test.ts
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
  console.log('Phase 10 Flo Operations Hub Contracts');
  console.log('='.repeat(60));

  const operations = read('app/(dashboard)/operations/page.tsx');
  assert.ok(operations.includes('PageHeader'), 'operations uses PageHeader');
  assert.ok(operations.includes('Panel'), 'operations uses Panel');
  assert.ok(operations.includes('DayCloseCard'), 'operations wires DayCloseCard');
  assert.ok(
    operations.includes('ShiftHistoryPanel') ||
      operations.includes('@/components/shifts/ShiftHistoryPanel'),
    'operations wires ShiftHistoryPanel',
  );
  assert.ok(!operations.includes('preparingTitle'), 'placeholder preparing UI removed');
  assert.ok(!operations.includes('bg-white rounded-xl'), 'legacy card pattern not used');
  console.log('   ✓ operations hub composition');

  const nav = read('config/navigation.ts');
  assert.ok(
    /id:\s*'operations'[\s\S]*?status:\s*'live'/.test(nav),
    'operations nav status is live',
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
    assert.ok(src.includes('"flo.operations.title"'), `${label} flo.operations.title`);
    assert.ok(src.includes('"flo.operations.description"'), `${label} flo.operations.description`);
    assert.ok(
      src.includes('"flo.operations.dayClose"') || src.includes('"flo.operations.shiftHistory"'),
      `${label} operations section keys`,
    );
  }
  console.log('   ✓ i18n keys');

  assert.ok(
    fs.existsSync(path.join(FRONTEND, 'components/shifts/ShiftHistoryPanel.tsx')),
    'ShiftHistoryPanel exists for import',
  );
  console.log('   ✓ ShiftHistoryPanel available');

  console.log('='.repeat(60));
  console.log('✅ Phase 10 Flo Operations contracts passed');
}

main();
