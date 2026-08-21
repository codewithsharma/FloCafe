#!/usr/bin/env node
/**
 * Assert every discovered automated test file is classified in tests/test-tiers.json.
 * Fails CI when a new *.test.ts / *.spec.ts would otherwise be silently orphaned.
 *
 * Usage: node scripts/assert-test-tiers.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TIERS_PATH = path.join(ROOT, 'tests', 'test-tiers.json');

const DISCOVER_GLOBS = [
  { dir: path.join(ROOT, 'tests'), re: /\.test\.ts$/ },
  { dir: path.join(ROOT, 'frontend', 'src'), re: /\.test\.tsx?$/ },
  { dir: path.join(ROOT, 'frontend', 'e2e'), re: /\.spec\.ts$/ },
];

function walk(dir, re, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'fixtures' || ent.name === 'helpers') continue;
      walk(p, re, acc);
    } else if (re.test(ent.name)) {
      acc.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
  }
  return acc;
}

function discover() {
  const files = [];
  for (const g of DISCOVER_GLOBS) {
    walk(g.dir, g.re, files);
  }
  // tests/unit is under tests/ — already covered. fixtures/helpers skipped.
  return [...new Set(files)].sort();
}

function main() {
  if (!fs.existsSync(TIERS_PATH)) {
    console.error(`[discover-guard] Missing ${path.relative(ROOT, TIERS_PATH)}`);
    process.exit(1);
  }

  const tiers = JSON.parse(fs.readFileSync(TIERS_PATH, 'utf8'));
  const buckets = ['merge', 'extended', 'manual', 'obsolete'];
  for (const b of buckets) {
    if (!Array.isArray(tiers[b])) {
      console.error(`[discover-guard] tiers.${b} must be an array`);
      process.exit(1);
    }
  }

  const discovered = discover();
  const classified = new Map();
  const dupes = [];

  for (const b of buckets) {
    for (const f of tiers[b]) {
      if (classified.has(f)) {
        dupes.push(`${f} in both ${classified.get(f)} and ${b}`);
      } else {
        classified.set(f, b);
      }
    }
  }

  const missing = discovered.filter((f) => !classified.has(f));
  const stale = [...classified.keys()].filter((f) => !discovered.includes(f));

  let failed = false;

  if (dupes.length) {
    failed = true;
    console.error('[discover-guard] Duplicate tier membership:');
    for (const d of dupes) console.error(`  - ${d}`);
  }

  if (missing.length) {
    failed = true;
    console.error(
      '[discover-guard] Unclassified test files (add to tests/test-tiers.json merge|extended|manual|obsolete):',
    );
    for (const f of missing) console.error(`  - ${f}`);
  }

  if (stale.length) {
    failed = true;
    console.error('[discover-guard] Tier entries with no file on disk:');
    for (const f of stale) console.error(`  - ${f} (${classified.get(f)})`);
  }

  // groups must be subsets of merge|extended
  if (tiers.groups && typeof tiers.groups === 'object') {
    for (const [name, list] of Object.entries(tiers.groups)) {
      if (!Array.isArray(list)) continue;
      for (const f of list) {
        const bucket = classified.get(f);
        if (!bucket || bucket === 'manual' || bucket === 'obsolete') {
          failed = true;
          console.error(`[discover-guard] groups.${name} entry not in merge/extended: ${f}`);
        }
      }
    }
  }

  if (failed) {
    console.error(
      `\n[discover-guard] FAIL — ${discovered.length} discovered, ${classified.size} classified.`,
    );
    process.exit(1);
  }

  const counts = Object.fromEntries(buckets.map((b) => [b, tiers[b].length]));
  console.log(
    `[discover-guard] PASS — ${discovered.length} files classified (${JSON.stringify(counts)})`,
  );
  process.exit(0);
}

main();
