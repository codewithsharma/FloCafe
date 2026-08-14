/**
 * Phase 4.8 — Reports multi-day UTC export range.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/phase-4.8-reports-date-range.test.ts
 *    or: npm run test:phase-4.8
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-4.8-range-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const { assert, assertEqual, getResults } = require('./helpers/test-setup');

const ROOT = path.join(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend/src');

function readFrontend(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
}

function main() {
  console.log('Phase 4.8 — Reports multi-day export range');
  console.log('='.repeat(60));

  const helperPath = path.join(FRONTEND, 'lib/reports-date-range.ts');
  assert(fs.existsSync(helperPath), 'reports-date-range helper exists');

  if (fs.existsSync(helperPath)) {
    const {
      MAX_REPORTS_CSV_RANGE_DAYS,
      inclusiveCalendarDays,
      reportsCsvRangeError,
    } = require('../frontend/src/lib/reports-date-range');

    assertEqual(MAX_REPORTS_CSV_RANGE_DAYS, 93, 'client cap matches backend 93 days');
    assertEqual(inclusiveCalendarDays('2026-01-01', '2026-01-01'), 1, 'same-day range is 1 day');
    assertEqual(
      inclusiveCalendarDays('2026-01-01', '2026-04-03'),
      93,
      '93-day window is valid length',
    );
    assertEqual(inclusiveCalendarDays('2026-01-01', '2026-04-04'), 94, '94-day window is 94');
    assertEqual(reportsCsvRangeError('2026-01-01', '2026-01-01'), null, 'same-day allowed');
    assertEqual(reportsCsvRangeError('2026-01-01', '2026-04-03'), null, '93-day allowed');
    assert(reportsCsvRangeError('2026-01-01', '2026-04-04') !== null, '94-day rejected');
    assert(reportsCsvRangeError('2026-01-10', '2026-01-01') !== null, 'reversed range rejected');
  }

  const page = readFrontend('app/(dashboard)/reports/page.tsx');
  assert(page.includes('type="date"'), 'native date inputs remain');
  assert(
    page.includes('endDate') || page.includes('exportEndDate'),
    'Reports page has an end date',
  );
  assert(
    page.includes('downloadBillsCsvExport(startDate, endDate)') ||
      page.includes('downloadBillsCsvExport(selectedDate, endDate)') ||
      /downloadBillsCsvExport\(\s*\w+\s*,\s*\w+\s*\)/.test(page),
    'CSV export passes start and end separately',
  );
  assert(
    !page.includes('downloadBillsCsvExport(selectedDate, selectedDate)'),
    'CSV export is not locked to a single selectedDate twice',
  );
  assert(
    page.includes('reportsCsvRangeError') || page.includes('MAX_REPORTS_CSV_RANGE_DAYS'),
    'client validates range before export',
  );
  assert(
    page.includes('start_date: selectedDate') === false ||
      page.includes('end_date: endDate') ||
      page.includes('end_date:'),
    'topProducts can use the export window',
  );

  const i18nEn = readFrontend('lib/i18n/en.json');
  const i18nEs = readFrontend('lib/i18n/es.json');
  const i18nPt = readFrontend('lib/i18n/pt.json');
  assert(i18nEn.includes('"reports.exportStartDate"'), 'en start date label');
  assert(i18nEn.includes('"reports.exportEndDate"'), 'en end date label');
  assert(i18nEn.includes('"reports.exportRangeTooLong"'), 'en range-too-long message');
  assert(i18nEs.includes('"reports.exportStartDate"'), 'es start date label');
  assert(i18nEs.includes('"reports.exportEndDate"'), 'es end date label');
  assert(i18nEs.includes('"reports.exportRangeTooLong"'), 'es range-too-long message');
  assert(i18nPt.includes('"reports.exportStartDate"'), 'pt start date label');
  assert(i18nPt.includes('"reports.exportEndDate"'), 'pt end date label');
  assert(i18nPt.includes('"reports.exportRangeTooLong"'), 'pt range-too-long message');

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Phase 4.8 reports date range tests passed.');
}

main();
