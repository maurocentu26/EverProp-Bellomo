import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {}, URLSearchParams };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/conversation-presentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { leadConversationHref, conversationSearchFromHash, conversationLeadFromHash, visibleConversations } = context.exports;

test('lead navigation carries an encoded search in the fragment, not in the server query', () => {
  const href = leadConversationHref({ phone: '+54 (11) 5555-0123', email: 'ignored@example.test' });
  const url = new URL(href, 'https://panel.example.test');
  assert.equal(url.pathname, '/admin/conversaciones');
  assert.equal(url.search, '');
  assert.equal(conversationSearchFromHash(url.hash), '55550123');
  assert.equal(leadConversationHref({ phone: '+54 9 11 5555-0123' }), href);
  assert.equal(conversationSearchFromHash(new URL(leadConversationHref({ phone: '---', email: ' ana+ventas@example.test ' }), url).hash), 'ana+ventas@example.test');
  assert.equal(leadConversationHref({ phone: '12', email: '' }), null);
  assert.equal(leadConversationHref({}), null);
});

test('EVP-91: the lead id travels in the fragment only when it is a UUID', () => {
  const id = '6f1c2b3a-1d2e-4f50-8a9b-0c1d2e3f4a5b';
  const url = new URL(leadConversationHref({ id, phone: '+54 388 123-4567' }), 'https://panel.example.test');
  assert.equal(url.search, '');
  assert.equal(conversationLeadFromHash(url.hash), id);
  assert.equal(conversationSearchFromHash(url.hash), '81234567');
  assert.equal(conversationLeadFromHash(new URL(leadConversationHref({ id: 'L-1', phone: '+54 388 123-4567' }), url).hash), null);
  assert.equal(conversationLeadFromHash('#lead=../../x'), null);
  assert.equal(conversationLeadFromHash(''), null);
});

test('fragment search is bounded, ignores short terms and cannot select a conversation', () => {
  assert.equal(conversationSearchFromHash('#q=%20x%20'), '');
  assert.equal(conversationSearchFromHash('#c=00000000-0000-0000-0000-000000000000'), '');
  assert.equal(conversationSearchFromHash('#q=' + 'x'.repeat(200)).length, 100);
  assert.equal(conversationSearchFromHash('#q=ana%26state%3DCLOSED'), 'ana&state=CLOSED');
});

test('search shows all returned states for advisor selection; clearing restores the chosen tray', () => {
  const items = ['HUMAN_ACTIVE', 'AI_ACTIVE', 'CLOSED'].map((state, id) => ({ id: String(id), state }));
  assert.deepEqual(Array.from(visibleConversations(items, 'human', 'ana'), x => x.id), ['0', '1', '2']);
  assert.deepEqual(Array.from(visibleConversations(items, 'human', ''), x => x.id), ['0']);
  assert.equal(visibleConversations([], 'human', 'ana').length, 0);
  assert.equal(items.length, 3);
});

const inbox = fs.readFileSync(new URL('../src/components/admin/conversations/ConversationInbox.tsx', import.meta.url), 'utf8');
const refreshBody = inbox.slice(inbox.indexOf('  const refreshList ='), inbox.indexOf('  const refreshThread =')).match(/async \(\) => \{([\s\S]*)\}, \[/)[1];

function refreshHarness() {
  const pending = [];
  const state = { items: [], key: null, error: '' };
  const request = { current: 0 };
  const make = (search, ready = true) => new Function('user', 'searchReady', 'listRequest', 'listConversations', 'filter', 'search', 'setListError', 'setItems', 'setListKey', 'setRefreshedAt', `return async () => {${refreshBody}}`)({}, ready, request,
    (filter, term) => new Promise((resolve, reject) => pending.push({ filter, term, resolve, reject })), 'all', search,
    value => { state.error = value; }, value => { state.items = value; }, value => { state.key = value; }, () => {});
  return { make, pending, state };
}

test('contextual lookup waits for initialization and late failure cannot cover newer results', async () => {
  const h = refreshHarness();
  await h.make('', false)();
  assert.equal(h.pending.length, 0);
  const old = h.make('old')();
  const current = h.make('current')();
  h.pending[1].resolve({ data: [{ id: 'current-thread' }] });
  await current;
  h.pending[0].reject(new Error('late failure'));
  await old;
  assert.equal(h.state.error, '');
  assert.equal(h.state.key, 'all:current');
  assert.equal(h.state.items[0].id, 'current-thread');
});

test('latest failure clears obsolete rows; pending search and filter never expose old results', async () => {
  const h = refreshHarness();
  h.state.items = [{ id: 'old-thread' }];
  const current = h.make('new')();
  h.pending[0].reject(new Error('provider unavailable'));
  await current;
  assert.equal(h.state.items.length, 0);
  assert.match(h.state.error, /No pudimos actualizar/);
  const expression = inbox.match(/const resultsReady = (.*);/)[1];
  const ready = new Function('searchReady', 'listKey', 'filter', 'search', 'query', 'MIN_SEARCH', `return ${expression}`);
  assert.equal(ready(true, 'all:old', 'all', 'new', 'new', 2), false);
  assert.equal(ready(true, 'all:new', 'all', 'new', 'typing', 2), false);
  assert.equal(ready(true, 'mine:new', 'all', 'new', 'new', 2), false);
  assert.equal(ready(true, 'all:new', 'all', 'new', 'new', 2), true);
});
