/**
 * V1-UI — Cart panel + KDS Tabs layout source contracts.
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/v1-ui-cart-kds-tabs-layout.test.ts
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const cart = read('frontend/src/components/pos/CartPanel.tsx');
const tabs = read('frontend/src/components/kds/KdsTabsView.tsx');
const kanban = read('frontend/src/components/kds/KdsKanbanBoard.tsx');

console.log('V1-UI cart + KDS Tabs layout contracts');

assert.match(cart, /data-testid="pos-cart-line"/, 'cart lines expose pos-cart-line');
assert.match(cart, /data-testid="pos-cart-panel"/, 'cart panel test id preserved');
assert.match(cart, /overflow-y-auto/, 'cart keeps single scroll owner');
assert.match(cart, /min-h-12/, 'primary actions stay touch-sized');
assert.doesNotMatch(
  cart,
  /onEditItem[\s\S]*?bg-flo-warning-subtle/,
  'Edit control is not loud warning fill',
);
assert.match(cart, /data-testid="pos-cart-line"[^>]*border-b border-flo-border/, 'cart lines use list separators not bulky nested cards');

const ticket = read('frontend/src/components/kds/KdsTicketCard.tsx');
assert.match(ticket, /data-kds-ticket-meta/, 'shared ticket exposes stable meta region');
assert.match(ticket, /data-kds-ticket-age/, 'shared ticket exposes fixed age/overdue region');
assert.match(tabs, /KdsTicketCard/, 'tabs use shared ticket card');
assert.match(tabs, /KDS_BOARD_STATUS|border \$\{board/, 'tabs use board status chrome');

// Kanban must remain a separate view but share ticket chrome
assert.match(kanban, /KdsTicketCard/, 'kanban uses shared ticket card');
assert.match(kanban, /border-2|useDraggable/, 'kanban keeps drag plumbing');

console.log('✅ V1-UI cart + KDS Tabs layout contracts passed');
