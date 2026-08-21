/**
 * V1-UI — KDS hybrid redesign source contracts.
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/v1-ui-kds-hybrid-redesign.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const theme = read('frontend/src/lib/kds-board-theme.ts');
const ticket = read('frontend/src/components/kds/KdsTicketCard.tsx');
const workspace = read('frontend/src/components/kds/KdsWorkspace.tsx');
const header = read('frontend/src/components/kds/KdsHeader.tsx');
const tabs = read('frontend/src/components/kds/KdsTabsView.tsx');
const kanban = read('frontend/src/components/kds/KdsKanbanBoard.tsx');
const column = read('frontend/src/components/kds/KdsColumn.tsx');
const modal = read('frontend/src/components/kds/KdsItemModal.tsx');
const conn = read('frontend/src/hooks/useKdsConnection.ts');

console.log('V1-UI KDS hybrid redesign contracts');

assert.match(theme, /KDS_BOARD_STATUS/, 'board status theme present');
assert.match(theme, /kdsBoardTicketAgeClass/, 'board age class helper');
assert.match(ticket, /data-testid="kds-ticket-card"/, 'shared ticket test id');
assert.match(ticket, /data-kds-ticket-age/, 'overdue/timer region');
assert.match(ticket, /truncate/, 'order number truncates instead of overlapping age');
assert.match(ticket, /KdsTicketCard/, 'ticket component export');

assert.match(workspace, /data-testid="kds-board"/, 'board region marker');
assert.doesNotMatch(
  workspace,
  /["'`]dark kds-board|className="dark /,
  'board must not force dark — follows Flo theme',
);
assert.match(header, /bg-flo-surface/, 'header stays Flo surface');

assert.match(tabs, /KdsTicketCard/, 'tabs use shared ticket');
assert.match(tabs, /KDS_BOARD_STATUS/, 'tabs use board status theme');
assert.match(kanban, /KdsTicketCard/, 'kanban uses shared ticket');
assert.match(column, /KDS_BOARD_STATUS/, 'columns use board theme');
assert.match(theme, /dark:text-amber-200|dark:bg-amber-500/, 'board status colors are theme-aware');
assert.doesNotMatch(
  modal,
  /className="dark /,
  'modal must not force dark — follows Flo theme',
);

assert.doesNotMatch(conn, /KDS_BOARD_STATUS/, 'connection hook stays theme-free');
assert.match(conn, /STATUS_ORDER/, 'status machine preserved');
assert.match(conn, /computeKdsReconnectDelayMs/, 'reconnect helper preserved');

console.log('✅ V1-UI KDS hybrid redesign contracts passed');
