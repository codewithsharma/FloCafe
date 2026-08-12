/**
 * Flo component migration guard — no legacy overlays/card shells in key component dirs.
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/flo-components-complete.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..');
const COMPONENT_DIRS = [
  'frontend/src/components/pos',
  'frontend/src/components/kds',
  'frontend/src/components/shifts',
  'frontend/src/components/settings',
  'frontend/src/components/layout',
  'frontend/src/components/products',
].map((rel) => path.join(ROOT, rel));

const FORBIDDEN_OVERLAY = 'fixed inset-0 bg-black/50';
const FORBIDDEN_CARD = 'bg-white rounded-xl border border-gray-100';

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function collectTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && /\.(tsx|ts)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findMatches(pattern: string): { file: string; line: number }[] {
  const offenders: { file: string; line: number }[] = [];
  for (const dir of COMPONENT_DIRS) {
    for (const filePath of collectTsxFiles(dir)) {
      const source = stripComments(fs.readFileSync(filePath, 'utf8'));
      const rel = path.relative(ROOT, filePath);
      source.split('\n').forEach((line, index) => {
        if (line.includes(pattern)) {
          offenders.push({ file: rel, line: index + 1 });
        }
      });
    }
  }
  return offenders;
}

function main(): void {
  console.log('Flo Components Complete Migration Guard');
  console.log('='.repeat(60));

  const scanned = COMPONENT_DIRS.reduce((sum, dir) => sum + collectTsxFiles(dir).length, 0);
  assert.ok(scanned >= 20, `expected at least 20 component files, found ${scanned}`);

  const overlayOffenders = findMatches(FORBIDDEN_OVERLAY);
  if (overlayOffenders.length > 0) {
    const details = overlayOffenders.map((e) => `  - ${e.file}:${e.line}`).join('\n');
    assert.fail(
      `Found ${overlayOffenders.length} legacy overlay pattern(s) ("${FORBIDDEN_OVERLAY}"):\n${details}`,
    );
  }
  console.log(`   ✓ scanned ${scanned} files — zero "${FORBIDDEN_OVERLAY}" matches`);

  const cardOffenders = findMatches(FORBIDDEN_CARD);
  if (cardOffenders.length > 0) {
    const details = cardOffenders.map((e) => `  - ${e.file}:${e.line}`).join('\n');
    assert.fail(
      `Found ${cardOffenders.length} legacy card pattern(s) ("${FORBIDDEN_CARD}"):\n${details}`,
    );
  }
  console.log(`   ✓ scanned ${scanned} files — zero "${FORBIDDEN_CARD}" matches`);

  console.log('='.repeat(60));
  console.log('✅ Flo components complete migration guard passed');
}

main();
