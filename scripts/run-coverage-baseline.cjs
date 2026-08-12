#!/usr/bin/env node
/**
 * M1 coverage baseline — measures coverage for auth, tax, and payment modules
 * using existing test suites. Does not change product behavior.
 *
 * Usage: node scripts/run-coverage-baseline.cjs
 * Output: coverage/ (lcov, json-summary, text report)
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const c8Bin = require.resolve('c8/bin/c8.js');
const tsNodeBin = require.resolve('ts-node/dist/bin.js');
const electronRunner = path.join(root, 'tests/run-electron-node-test.cjs');

const INCLUDE = [
  'main/routes/auth.ts',
  'main/routes/bills.ts',
  'main/services/tax-engine.ts',
  'main/middleware/security.ts',
];

const SUITES = [
  {
    label: 'tax-engine',
    clean: true,
    args: [tsNodeBin, '--transpile-only', '-P', 'tests/tsconfig.json', 'tests/tax-engine.test.ts'],
  },
  {
    label: 'security-hardening',
    clean: false,
    args: [process.execPath, electronRunner, 'tests/security-hardening.test.ts'],
  },
  {
    label: 'staff-authz',
    clean: false,
    args: [process.execPath, electronRunner, 'tests/staff-authz.test.ts'],
  },
  {
    label: 'authz-matrix-phase3',
    clean: false,
    args: [process.execPath, electronRunner, 'tests/authz-matrix-phase3.test.ts'],
  },
  {
    label: 'integration-payments',
    clean: false,
    args: [process.execPath, electronRunner, 'tests/integration-payments.test.ts'],
  },
  {
    label: 'issue-214-payment-integrity',
    clean: false,
    args: [process.execPath, electronRunner, 'tests/issue-214-payment-integrity.test.ts'],
  },
];

function runSuite({ label, clean, args }) {
  console.log(`\n=== Coverage suite: ${label} ===\n`);
  const c8Args = [
    c8Bin,
    clean ? '--clean=true' : '--clean=false',
    ...INCLUDE.flatMap((file) => ['--include', file]),
    '--exclude',
    'tests/**',
    '--exclude',
    'dist/**',
    '--reports-dir',
    'coverage',
    '--reporter',
    'text-summary',
    ...args,
  ];

  const result = spawnSync(process.execPath, c8Args, {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
    timeout: 600_000,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`Coverage suite "${label}" killed by signal: ${result.signal}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Coverage suite "${label}" failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

for (const suite of SUITES) {
  runSuite(suite);
}

console.log('\n=== M1 coverage baseline — combined report ===\n');
const report = spawnSync(
  process.execPath,
  [
    c8Bin,
    'report',
    '--reports-dir',
    'coverage',
    '--reporter',
    'text',
    '--reporter',
    'json-summary',
    '--reporter',
    'lcov',
  ],
  { stdio: 'inherit', cwd: root },
);

if (report.status !== 0) {
  process.exit(report.status ?? 1);
}

console.log('\nCoverage artifacts written to coverage/');
