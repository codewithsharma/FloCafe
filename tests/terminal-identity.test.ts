/**
 * M4-D1 — Browser terminal identity + POS header attribution.
 *
 * Usage: ts-node --transpile-only -P tests/tsconfig.json tests/terminal-identity.test.ts
 */
import * as assert from 'node:assert/strict';
import {
  TERMINAL_ID_HEADER,
  TERMINAL_ID_STORAGE_KEY,
  applyTerminalIdHeader,
  getClientTerminalId,
  isValidClientTerminalId,
  shouldAttachTerminalId,
} from '../frontend/src/lib/terminal-id';
import api from '../frontend/src/lib/api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

function installBrowser(): MemoryStorage {
  const storage = new MemoryStorage();
  (globalThis as any).window = { localStorage: storage };
  (globalThis as any).localStorage = storage;
  return storage;
}

function uninstallBrowser(): void {
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
}

function runRequestInterceptor(config: { url?: string; method?: string; headers?: Record<string, string> }) {
  const interceptors = (api.interceptors.request as unknown as {
    handlers: Array<{ fulfilled?: (value: typeof config) => typeof config }>;
  }).handlers;
  const fulfilled = interceptors.find((handler) => typeof handler?.fulfilled === 'function')?.fulfilled;
  assert.ok(fulfilled, 'POS api client must register a request interceptor');
  return fulfilled(config);
}

async function main(): Promise<void> {
  console.log('M4-D1 Terminal Identity Tests');
  console.log('='.repeat(60));

  assert.equal(TERMINAL_ID_STORAGE_KEY, 'flo_terminal_id');
  assert.equal(TERMINAL_ID_HEADER, 'X-Flo-Terminal-Id');
  console.log('   ✓ storage key is flo_terminal_id (not cloud_pos_id / user / JWT)');

  uninstallBrowser();
  assert.equal(getClientTerminalId(), null, 'SSR / no window must not invent a terminal id');
  const ssrHeaders: Record<string, string> = {};
  applyTerminalIdHeader({ url: '/orders', method: 'post', headers: ssrHeaders });
  assert.equal(ssrHeaders[TERMINAL_ID_HEADER], undefined);
  console.log('   ✓ missing browser storage does not attach a terminal header');

  const storage = installBrowser();
  let fetchCalled = false;
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ terminal_id: 'host-should-not-be-used' }) };
  };

  const generated = getClientTerminalId();
  assert.ok(generated);
  assert.match(generated!, UUID_PATTERN);
  assert.equal(storage.getItem(TERMINAL_ID_STORAGE_KEY), generated);
  assert.equal(fetchCalled, false, 'browser POS must not call GET /api/shifts/terminal-id');
  console.log('   ✓ browser generates a crypto UUID and never inherits the host terminal');

  const persisted = getClientTerminalId();
  assert.equal(persisted, generated, 'refresh/reload reuses the stored UUID');
  storage.setItem(TERMINAL_ID_STORAGE_KEY, generated!);
  assert.equal(getClientTerminalId(), generated);
  console.log('   ✓ terminal id survives simulated refresh/reload');

  storage.setItem(TERMINAL_ID_STORAGE_KEY, '../etc/passwd');
  const repaired = getClientTerminalId();
  assert.ok(repaired);
  assert.match(repaired!, UUID_PATTERN);
  assert.notEqual(repaired, '../etc/passwd');
  assert.equal(isValidClientTerminalId('../etc/passwd'), false);
  assert.equal(isValidClientTerminalId(''), false);
  assert.equal(isValidClientTerminalId(generated!), true);
  assert.equal(isValidClientTerminalId(`term-${generated}`), true);
  console.log('   ✓ malformed stored ids are rejected and replaced');

  (globalThis as any).fetch = originalFetch;

  const attachCases: Array<[string, string, boolean]> = [
    ['post', '/orders', true],
    ['POST', '/api/orders', true],
    ['post', 'http://192.168.1.5:3001/api/orders', true],
    ['post', '/bills/12/payments', true],
    ['post', '/bills/12/payment', true],
    ['post', '/api/bills/99/payments', true],
    ['get', '/shifts/active', true],
    ['post', '/shifts/open', true],
    ['post', '/shifts/7/close', true],
    ['get', '/orders', false],
    ['post', '/orders/1/items', false],
    ['post', '/bills/generate', false],
    ['get', '/shifts/terminal-id', false],
    ['get', '/shifts', false],
    ['get', '/shifts/7', false],
    ['post', '/shifts/7/force-close', false],
    ['get', '/products', false],
    ['post', '/auth/login', false],
    ['get', '/settings/business', false],
  ];
  for (const [method, url, expected] of attachCases) {
    assert.equal(
      shouldAttachTerminalId(url, method),
      expected,
      `${method} ${url} attach=${expected}`,
    );
  }
  console.log('   ✓ header is limited to POS order create, payments, and shift identity routes');

  storage.clear();
  const orderHeaders: Record<string, string> = {};
  applyTerminalIdHeader({ url: '/orders', method: 'post', headers: orderHeaders });
  assert.match(orderHeaders[TERMINAL_ID_HEADER], UUID_PATTERN);
  const catalogHeaders: Record<string, string> = {};
  applyTerminalIdHeader({ url: '/products', method: 'get', headers: catalogHeaders });
  assert.equal(catalogHeaders[TERMINAL_ID_HEADER], undefined);
  const hostLookupHeaders: Record<string, string> = { Authorization: 'Bearer test' };
  applyTerminalIdHeader({ url: '/shifts/terminal-id', method: 'get', headers: hostLookupHeaders });
  assert.equal(hostLookupHeaders[TERMINAL_ID_HEADER], undefined);
  console.log('   ✓ applyTerminalIdHeader sets X-Flo-Terminal-Id only where needed');

  storage.clear();
  const intercepted = runRequestInterceptor({ url: '/orders', method: 'post', headers: {} });
  assert.match(String(intercepted.headers?.[TERMINAL_ID_HEADER] || ''), UUID_PATTERN);
  const skipped = runRequestInterceptor({ url: '/products', method: 'get', headers: {} });
  assert.equal(skipped.headers?.[TERMINAL_ID_HEADER], undefined);
  console.log('   ✓ POS axios interceptor wires terminal attribution');

  uninstallBrowser();
  console.log('='.repeat(60));
  console.log('✅ M4-D1 terminal identity tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
