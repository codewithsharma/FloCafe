/**
 * Complete Flo page migration guard — no legacy card shell on any route page.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-routes-complete.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'frontend/src/app');
const FORBIDDEN = 'bg-white rounded-xl border border-gray-100';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function collectPageFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPageFiles(fullPath));
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function main(): void {
  console.log('Flo Complete Page Migration Guard');
  console.log('='.repeat(60));

  const pages = collectPageFiles(APP_DIR);
  assert.ok(pages.length >= 20, `expected at least 20 page.tsx files, found ${pages.length}`);

  const offenders: { file: string; line: number }[] = [];

  for (const filePath of pages) {
    const rel = path.relative(APP_DIR, filePath);
    const raw = fs.readFileSync(filePath, 'utf8');
    const source = stripComments(raw);
    const lines = source.split('\n');

    lines.forEach((line, index) => {
      if (line.includes(FORBIDDEN)) {
        offenders.push({ file: rel, line: index + 1 });
      }
    });
  }

  if (offenders.length > 0) {
    const details = offenders
      .map((entry) => `  - ${entry.file}:${entry.line}`)
      .join('\n');
    assert.fail(
      `Found ${offenders.length} legacy card pattern(s) in page.tsx files:\n${details}`,
    );
  }

  console.log(`   ✓ scanned ${pages.length} page.tsx files — zero "${FORBIDDEN}" matches`);

  const migratedRoutes = [
    'app/(dashboard)/kds/page.tsx',
    'app/kds-standalone/page.tsx',
    'app/kds-standalone/layout.tsx',
    'app/server-standalone/page.tsx',
    'app/server-standalone/layout.tsx',
    'app/(dashboard)/print-test/page.tsx',
    'app/(dashboard)/order-history-demo/page.tsx',
  ];

  for (const rel of migratedRoutes) {
    const content = fs.readFileSync(path.join(ROOT, 'frontend/src', rel), 'utf8');
    assert.ok(
      content.includes('flo-') || content.includes('@/components/flo'),
      `${rel} uses Flo tokens or components`,
    );
  }
  console.log('   ✓ final route batch uses Flo tokens/components');

  console.log('='.repeat(60));
  console.log('✅ Flo complete page migration guard passed');
}

main();
