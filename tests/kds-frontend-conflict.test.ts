import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'frontend/src/hooks/useKdsConnection.ts'), 'utf8');
const conflictBranch = source.match(/if \(statusCode === 409\) \{[\s\S]*?\n\s*return;/)?.[0] || '';

assert.match(conflictBranch, /await fetchOrdersRest\(\);/, 'KDS conflicts refresh REST state even with an active WebSocket');
assert.doesNotMatch(conflictBranch, /wsRef\.current === null/, 'KDS conflict refresh is not gated on WebSocket absence');
console.log('✅ KDS frontend conflict refresh regression test passed');

const kdsPage = fs.readFileSync(
  path.join(process.cwd(), 'frontend/src/app/(dashboard)/kds/page.tsx'),
  'utf8',
);
assert.match(kdsPage, /usePlatformComposition/, 'KDS dashboard uses platform composition');
assert.match(
  kdsPage,
  /isFeatureAvailable\(\s*['"]kds['"]\s*,[^)]*verticalId/,
  'KDS availability passes composition verticalId',
);
assert.doesNotMatch(
  kdsPage,
  /isFeatureAvailable\(\s*['"]kds['"]\s*,\s*true\s*\)/,
  'KDS fetch failure must not fail-open without verticalId',
);
console.log('✅ KDS dashboard composition fail-closed contract passed');
