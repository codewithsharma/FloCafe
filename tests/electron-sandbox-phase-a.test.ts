/**
 * P0.6 Phase A — primary BrowserWindow sandbox:true + navigation guards.
 * Usage: node tests/run-electron-node-test.cjs tests/electron-sandbox-phase-a.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-electron-sandbox-a-'));

Module._load = function (requestName: string, parent: unknown, isMain: boolean) {
  if (requestName === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

import {
  getPrimaryRendererWebPreferences,
  attachRendererNavigationGuards,
} from '../main/security/browser-window-security';
import { isAllowedRendererNavigation } from '../main/security/url-allowlist';

type NavHandler = (event: { preventDefault: () => void }, url: string) => void;

function createMockWebContents() {
  const handlers: Record<string, NavHandler[]> = {};
  return {
    on(event: string, handler: NavHandler) {
      (handlers[event] ||= []).push(handler);
    },
    emit(event: string, url: string): boolean {
      let prevented = false;
      const fakeEvent = { preventDefault: () => { prevented = true; } };
      for (const handler of handlers[event] || []) {
        handler(fakeEvent, url);
      }
      return !prevented;
    },
    handlerCount(event: string): number {
      return (handlers[event] || []).length;
    },
  };
}

function main(): void {
  console.log('P0.6 Phase A electron sandbox / navigation tests');
  console.log('='.repeat(60));

  const prefs = getPrimaryRendererWebPreferences(path.join(testDir, 'preload.js'));
  assert.equal(prefs.sandbox, true, 'primary window sandbox:true');
  assert.equal(prefs.contextIsolation, true, 'contextIsolation remains true');
  assert.equal(prefs.nodeIntegration, false, 'nodeIntegration remains false');
  assert.ok(typeof prefs.preload === 'string' && prefs.preload.length > 0, 'preload path set');
  console.log('   ✓ primary BrowserWindow webPreferences hardened');

  const port = 3001;
  const localIp = '192.168.1.40';
  assert.equal(isAllowedRendererNavigation(`http://localhost:${port}/`, port, localIp), true);
  assert.equal(isAllowedRendererNavigation(`http://localhost:${port}/pos`, port, localIp), true);
  assert.equal(isAllowedRendererNavigation(`http://127.0.0.1:${port}/settings`, port, localIp), true);
  assert.equal(isAllowedRendererNavigation(`http://${localIp}:${port}/kds`, port, localIp), true);
  assert.equal(isAllowedRendererNavigation('https://evil.example/', port, localIp), false);
  assert.equal(isAllowedRendererNavigation('http://evil.example:3001/', port, localIp), false);
  assert.equal(isAllowedRendererNavigation('file:///etc/passwd', port, localIp), false);
  assert.equal(isAllowedRendererNavigation(`http://localhost:${port + 1}/`, port, localIp), false);
  console.log('   ✓ allowed local navigation; external/untrusted denied');

  const wc = createMockWebContents();
  attachRendererNavigationGuards(wc as any, {
    getPort: () => port,
    getLocalIp: () => localIp,
  });
  assert.equal(wc.handlerCount('will-navigate'), 1, 'will-navigate attached');
  assert.equal(wc.handlerCount('will-redirect'), 1, 'will-redirect attached');

  assert.equal(wc.emit('will-navigate', `http://localhost:${port}/orders`), true, 'local navigate allowed');
  assert.equal(wc.emit('will-navigate', 'https://attacker.test/phish'), false, 'external navigate blocked');
  assert.equal(wc.emit('will-redirect', `http://127.0.0.1:${port}/login`), true, 'local redirect allowed');
  assert.equal(wc.emit('will-redirect', 'https://evil.example/steal'), false, 'untrusted redirect blocked');
  assert.equal(wc.emit('will-redirect', 'file:///tmp/x'), false, 'file redirect blocked');
  console.log('   ✓ will-navigate / will-redirect fail closed for untrusted origins');

  // KDS port policy: dedicated KDS window uses KDS listen port
  const kdsPort = 3002;
  assert.equal(isAllowedRendererNavigation(`http://${localIp}:${kdsPort}/kds`, kdsPort, localIp), true);
  assert.equal(isAllowedRendererNavigation(`http://localhost:${port}/`, kdsPort, localIp), false);
  console.log('   ✓ KDS-port navigation policy intact');

  // Source contract: main window must not hard-code sandbox:false
  const indexSrc = fs.readFileSync(path.join(__dirname, '../main/index.ts'), 'utf8');
  assert.equal(/sandbox:\s*false/.test(indexSrc), false, 'main/index.ts must not set sandbox:false');
  assert.match(indexSrc, /getPrimaryRendererWebPreferences|sandbox:\s*true/, 'main window uses hardened prefs');
  assert.match(indexSrc, /attachRendererNavigationGuards/, 'main window attaches navigation guards');
  console.log('   ✓ main/index.ts source contract');

  console.log('✅ P0.6 Phase A electron sandbox tests passed!');
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  main();
} catch (err) {
  console.error(err);
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
}
