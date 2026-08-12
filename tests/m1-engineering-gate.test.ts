/**
 * M1 engineering gate — verifies baseline tooling without changing product behavior.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

function run() {
  console.log('M1 engineering gate checks');

  assert.ok(
    packageJson.scripts['test:coverage:baseline'],
    'test:coverage:baseline script must exist',
  );

  assert.ok(
    fs.existsSync(path.join(repoRoot, 'scripts/run-coverage-baseline.cjs')),
    'scripts/run-coverage-baseline.cjs must exist',
  );

  assert.ok(
    fs.existsSync(path.join(repoRoot, '.c8rc.json')),
    '.c8rc.json must exist',
  );

  const dbSource = fs.readFileSync(path.join(repoRoot, 'main/db.ts'), 'utf8');
  const versionMatch = dbSource.match(/version:\s*(\d+)/g);
  assert.ok(versionMatch && versionMatch.length > 0, 'db.ts must define migration versions');
  const maxVersion = Math.max(
    ...versionMatch.map((entry) => Number(entry.replace(/\D/g, ''))),
  );
  assert.equal(maxVersion, 69, 'M4-B adds migration v69 for shift foundation');

  console.log('✅ M1 engineering gate checks passed');
}

run();
