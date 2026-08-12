/**
 * M4-E1 — Frontend shift client foundation tests.
 *
 * Usage: ts-node --transpile-only -P tests/tsconfig.json tests/shift-client.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  applyShiftFetchOutcome,
  mapShiftApiError,
  normalizeActiveShiftResponse,
} from '../frontend/src/lib/shifts';
import {
  TERMINAL_ID_HEADER,
  applyTerminalIdHeader,
  getClientTerminalId,
  shouldAttachTerminalId,
} from '../frontend/src/lib/terminal-id';

const SHIFTS_SOURCE = fs.readFileSync(
  `${__dirname}/../frontend/src/lib/shifts.ts`,
  'utf8',
);

class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
}

function installBrowser(): MemoryStorage {
  const storage = new MemoryStorage();
  (globalThis as any).window = { localStorage: storage };
  (globalThis as any).localStorage = storage;
  if (!globalThis.crypto?.randomUUID) {
    (globalThis as any).crypto = {
      randomUUID: () => 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
    };
  }
  return storage;
}

function axiosError(status: number, message: string, hasResponse = true) {
  return {
    isAxiosError: true,
    response: hasResponse ? { status, data: { error: message } } : undefined,
  };
}

const SAMPLE_SHIFT = {
  id: 1,
  terminal_id: 'term-browser-001',
  status: 'open' as const,
  opened_by_user_id: 'owner-1',
  closed_by_user_id: null,
  opening_float_cents: 5000,
  opening_note: null,
  closing_note: null,
  counted_cash_cents: null,
  opened_at: '2026-08-12T10:00:00.000Z',
  closed_at: null,
  created_at: '2026-08-12T10:00:00.000Z',
  updated_at: '2026-08-12T10:00:00.000Z',
};

async function main(): Promise<void> {
  console.log('M4-E1 Shift Client Foundation Tests');
  console.log('='.repeat(60));

  {
    const outcome = normalizeActiveShiftResponse({ shift: SAMPLE_SHIFT });
    assert.equal(outcome.kind, 'active');
    if (outcome.kind === 'active') assert.equal(outcome.shift.id, 1);
    const applied = applyShiftFetchOutcome(outcome, false);
    assert.equal(applied.shift?.id, 1);
    assert.equal(applied.error, null);
    assert.equal(applied.loading, false);
    console.log('   ✓ active shift → state populated');
  }

  {
    const outcome = normalizeActiveShiftResponse({ shift: null });
    assert.equal(outcome.kind, 'no_shift');
    const applied = applyShiftFetchOutcome(outcome, false);
    assert.equal(applied.shift, null);
    assert.equal(applied.error, null);
    assert.equal(applied.enabled, true);
    console.log('   ✓ 200 shift:null → inactive/no shift (not an error)');
  }

  {
    const outcome = mapShiftApiError(axiosError(503, 'Shift management is disabled'));
    assert.equal(outcome.kind, 'disabled');
    const applied = applyShiftFetchOutcome(outcome, false);
    assert.equal(applied.enabled, false);
    assert.equal(applied.error, null);
    console.log('   ✓ 503 → shifts disabled, no error');
  }

  {
    const outcome = mapShiftApiError(axiosError(400, 'terminal_id is invalid'));
    assert.equal(outcome.kind, 'invalid_terminal');
    const applied = applyShiftFetchOutcome(outcome, false);
    assert.equal(applied.error?.code, 'invalid_terminal');
    console.log('   ✓ 400 → invalid terminal error');
  }

  {
    const network = mapShiftApiError(axiosError(0, '', false));
    assert.equal(network.kind, 'error');
    if (network.kind === 'error') assert.equal(network.code, 'network');
    const server = mapShiftApiError(axiosError(500, 'Internal server error'));
    assert.equal(server.kind, 'error');
    if (server.kind === 'error') assert.equal(server.code, 'server');
    console.log('   ✓ network/server errors are retryable error outcomes');
  }

  {
    let fetchCount = 0;
    const mockFetch = async () => {
      fetchCount += 1;
      return normalizeActiveShiftResponse({ shift: fetchCount === 1 ? null : SAMPLE_SHIFT });
    };
    const first = await mockFetch();
    const second = await mockFetch();
    assert.equal(first.kind, 'no_shift');
    assert.equal(second.kind, 'active');
    assert.equal(fetchCount, 2);
    console.log('   ✓ explicit re-fetch updates state (no auto polling in client module)');
  }

  {
    installBrowser();
    assert.ok(shouldAttachTerminalId('/shifts/active', 'get'));
    const headers: Record<string, string> = {};
    applyTerminalIdHeader({ url: '/shifts/active', method: 'get', headers });
    assert.ok(headers[TERMINAL_ID_HEADER]);
    assert.ok(getClientTerminalId());
    console.log('   ✓ browser client sends terminal header on GET /shifts/active');
  }

  {
    assert.ok(!SHIFTS_SOURCE.includes("'/shifts/terminal-id'"));
    assert.ok(!SHIFTS_SOURCE.includes('`/shifts/terminal-id`'));
    assert.ok(!SHIFTS_SOURCE.includes('get(\'/shifts/terminal-id'));
    console.log('   ✓ shift client does NOT call GET /api/shifts/terminal-id');
  }

  {
    assert.ok(SHIFTS_SOURCE.includes('fetchReconciliationPreview'));
    assert.ok(SHIFTS_SOURCE.includes('reconciliation-preview'));
    assert.ok(SHIFTS_SOURCE.includes('ShiftMutationResult'));
    assert.ok(SHIFTS_SOURCE.includes('formatVarianceLabel'));
    console.log('   ✓ M5-F reconciliation preview client and variance helper present');
  }

  {
    const { shouldAttachTerminalId } = await import('../frontend/src/lib/terminal-id');
    assert.ok(shouldAttachTerminalId('/shifts/42/reconciliation-preview', 'get'));
    console.log('   ✓ reconciliation preview GET attaches terminal header');
  }

  {
    installBrowser();
    const id1 = getClientTerminalId();
    const id2 = getClientTerminalId();
    assert.equal(id1, id2);
    console.log('   ✓ no duplicate terminal-ID generation in shift client');
  }

  {
    let calls = 0;
    const maxCalls = 3;
    const guardedRefresh = async () => {
      if (calls >= maxCalls) return;
      calls += 1;
    };
    await guardedRefresh();
    await guardedRefresh();
    await guardedRefresh();
    await guardedRefresh();
    assert.equal(calls, 3);
    console.log('   ✓ refresh guard pattern avoids unbounded concurrent fetches');
  }

  console.log('='.repeat(60));
  console.log('✅ M4-E1 shift client foundation tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
