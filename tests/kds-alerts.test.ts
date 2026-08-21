/**
 * KDS-ALERTS — source contracts + identity strategy docs.
 * Usage: npm run test:kds-alerts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const lib = read('frontend/src/lib/kds-alerts.ts');
const hook = read('frontend/src/hooks/useKdsAlerts.ts');
const workspace = read('frontend/src/components/kds/KdsWorkspace.tsx');
const header = read('frontend/src/components/kds/KdsHeader.tsx');
const kanban = read('frontend/src/components/kds/KdsKanbanBoard.tsx');
const tabs = read('frontend/src/components/kds/KdsTabsView.tsx');
const en = read('frontend/src/lib/i18n/en.json');

assert.match(lib, /class KdsAlertTracker/, 'KdsAlertTracker present');
assert.match(lib, /items\.length === 0/, 'empty hydrate stays unarmed');
assert.match(lib, /playKdsAlertBeep/, 'beep helper present');
assert.match(lib, /KDS_SOUND_STORAGE_KEY/, 'sound storage key');
assert.match(hook, /useKdsAlerts/, 'useKdsAlerts hook');
assert.match(hook, /KdsAlertTracker/, 'hook uses tracker');
assert.match(hook, /playKdsAlertBeep/, 'hook can play sound');
assert.match(workspace, /useKdsAlerts/, 'workspace wires alerts');
assert.match(workspace, /highlightOrderIds/, 'workspace passes highlights');
assert.match(header, /kds-sound-toggle/, 'header sound toggle');
assert.match(header, /kds\.soundOn/, 'sound on label');
assert.match(kanban, /kdsNewTicketCardClass/, 'kanban highlight class');
assert.match(tabs, /kdsNewTicketCardClass/, 'tabs highlight class');
assert.match(en, /"kds\.soundOn"/, 'en sound on');
assert.match(en, /"kds\.newTicket"/, 'en new ticket');

// Must not clear seen on reconnect inside connection hook
const conn = read('frontend/src/hooks/useKdsConnection.ts');
assert.doesNotMatch(conn, /KdsAlertTracker/, 'alerts stay outside useKdsConnection');
assert.doesNotMatch(conn, /kds_sound_alerts/, 'sound toggle not in connection hook');

// No schema / outbox coupling
assert.doesNotMatch(lib, /kds_delivery_outbox/, 'no outbox coupling');
assert.doesNotMatch(hook, /kds_delivery_outbox/, 'hook no outbox coupling');

console.log('✅ KDS-ALERTS source contracts passed');
