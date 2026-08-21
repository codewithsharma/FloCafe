#!/usr/bin/env node
/**
 * Run automated tests for a tier or named group from tests/test-tiers.json.
 *
 * Usage:
 *   node scripts/run-test-tier.cjs merge
 *   node scripts/run-test-tier.cjs extended
 *   node scripts/run-test-tier.cjs critical
 *   node scripts/run-test-tier.cjs recovery
 *   node scripts/run-test-tier.cjs merge --only-runners=electron,ts-node
 *
 * Vitest and Playwright files are skipped here — run via npm run test:unit /
 * test:unit:frontend / test:e2e. Manual/obsolete entries are always skipped.
 *
 * Exit 77 from a suite (ABI skip) is treated as success (same as tests/run-test.sh).
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TIERS_PATH = path.join(ROOT, 'tests', 'test-tiers.json');

function loadTiers() {
  return JSON.parse(fs.readFileSync(TIERS_PATH, 'utf8'));
}

function parseArgs(argv) {
  const tierOrGroup = argv[0];
  if (!tierOrGroup) {
    console.error(
      'Usage: node scripts/run-test-tier.cjs <merge|extended|critical|recovery|all-automated> [--only-runners=a,b]',
    );
    process.exit(2);
  }
  let onlyRunners = null;
  for (const a of argv.slice(1)) {
    if (a.startsWith('--only-runners=')) {
      onlyRunners = new Set(
        a
          .slice('--only-runners='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
  }
  return { tierOrGroup, onlyRunners };
}

function resolveFileList(tiers, tierOrGroup) {
  if (tierOrGroup === 'merge' || tierOrGroup === 'extended') {
    return tiers[tierOrGroup];
  }
  if (tierOrGroup === 'all-automated') {
    return [...tiers.merge, ...tiers.extended];
  }
  if (tiers.groups && Array.isArray(tiers.groups[tierOrGroup])) {
    return tiers.groups[tierOrGroup];
  }
  console.error(`[run-test-tier] Unknown tier/group: ${tierOrGroup}`);
  process.exit(2);
}

function runnerFor(tiers, file) {
  return (tiers.runners && tiers.runners[file]) || 'electron';
}

function runOne(file, runner) {
  const label = `${runner}:${file}`;
  console.log(`\n── ${label} ──`);

  let cmd;
  let args;
  if (runner === 'electron') {
    cmd = process.execPath;
    args = [path.join(ROOT, 'tests', 'run-electron-node-test.cjs'), file];
  } else if (runner === 'ts-node') {
    cmd = process.execPath;
    args = [
      path.join(ROOT, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      '--transpile-only',
      '-P',
      path.join(ROOT, 'tests', 'tsconfig.json'),
      path.join(ROOT, file),
    ];
  } else {
    console.log(`  ⏭ skipped (runner=${runner}; use dedicated npm script)`);
    return { status: 0, skipped: true };
  }

  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test' },
  });

  if (result.error) {
    console.error(`  ✗ spawn error: ${result.error.message}`);
    return { status: 1, skipped: false };
  }
  return { status: result.status == null ? 1 : result.status, skipped: false };
}

function main() {
  const { tierOrGroup, onlyRunners } = parseArgs(process.argv.slice(2));
  const tiers = loadTiers();
  const files = resolveFileList(tiers, tierOrGroup);

  const runnable = [];
  let skippedRunner = 0;
  for (const f of files) {
    const runner = runnerFor(tiers, f);
    if (runner === 'manual' || runner === 'obsolete' || runner === 'vitest' || runner === 'playwright') {
      skippedRunner += 1;
      continue;
    }
    if (onlyRunners && !onlyRunners.has(runner)) {
      skippedRunner += 1;
      continue;
    }
    runnable.push({ file: f, runner });
  }

  console.log(
    `[run-test-tier] ${tierOrGroup}: ${runnable.length} suites to run (${skippedRunner} skipped as vitest/playwright/manual/filtered)`,
  );

  const failed = [];
  let passed = 0;
  let skippedAbi = 0;

  for (const { file, runner } of runnable) {
    const { status } = runOne(file, runner);
    if (status === 77) {
      console.log('  ⏭ Skipped (ABI mismatch)');
      skippedAbi += 1;
      continue;
    }
    if (status === 0) {
      passed += 1;
      continue;
    }
    failed.push({ file, runner, status });
    if (process.env.TEST_TIER_FAIL_FAST !== '0') {
      break;
    }
  }

  console.log(
    `\n[run-test-tier] ${tierOrGroup} summary: pass=${passed} fail=${failed.length} abi_skip=${skippedAbi}`,
  );
  if (failed.length) {
    console.error('[run-test-tier] Failed:');
    for (const f of failed) {
      console.error(`  - ${f.file} (exit ${f.status})`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
