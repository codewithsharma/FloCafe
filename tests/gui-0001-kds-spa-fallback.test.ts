/**
 * GUI-0001 — SPA fallback must serve /kds (not exclude it for WebSocket).
 */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert').strict;

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  }
  return originalLoad.apply(this, arguments as any);
};

const { resolveStaticPage, SPA_FALLBACK_PATH } = require('../main/server');

assert.ok(SPA_FALLBACK_PATH, 'SPA_FALLBACK_PATH exported');
assert.equal(SPA_FALLBACK_PATH.test('/kds'), true, '/kds must match SPA fallback');
assert.equal(SPA_FALLBACK_PATH.test('/kds/'), true, '/kds/ must match SPA fallback');
assert.equal(SPA_FALLBACK_PATH.test('/kds-standalone/'), true);
assert.equal(SPA_FALLBACK_PATH.test('/api/orders'), false, '/api must not match SPA fallback');
assert.equal(SPA_FALLBACK_PATH.test('/api/kds/tickets'), false);

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-kds-static-'));
fs.writeFileSync(path.join(fixture, 'index.html'), 'root');
fs.mkdirSync(path.join(fixture, 'kds'));
fs.writeFileSync(path.join(fixture, 'kds', 'index.html'), 'kds');

assert.equal(resolveStaticPage(fixture, '/kds'), path.join(fixture, 'kds', 'index.html'));
assert.equal(resolveStaticPage(fixture, '/kds/'), path.join(fixture, 'kds', 'index.html'));

fs.rmSync(fixture, { recursive: true, force: true });
console.log('✅ GUI-0001 KDS SPA fallback tests passed');
