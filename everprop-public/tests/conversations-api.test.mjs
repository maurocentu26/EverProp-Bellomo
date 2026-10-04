import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [];
const context = {
  exports: {}, URLSearchParams,
  require(name) {
    if (name.endsWith('/everprop-api')) return { apiFetch: async (path, init = {}) => { calls.push({ path, init }); return { data: [] }; } };
    throw new Error(`unexpected import ${name}`);
  },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/conversations-api.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const api = context.exports;

test('inbox filters map to the API query contract', () => {
  assert.equal(api.conversationQuery('all'), '/api/v1/admin/conversations');
  assert.equal(api.conversationQuery('waiting'), '/api/v1/admin/conversations?state=WAITING_HUMAN');
  assert.equal(api.conversationQuery('mine'), '/api/v1/admin/conversations?mine=1');
  assert.equal(api.conversationQuery('unread'), '/api/v1/admin/conversations?unread=1');
});

test('an unconfirmed send is never presented as sent and inbound has no delivery label', () => {
  assert.equal(api.deliveryLabel({ direction: 'OUTBOUND', status: 'UNKNOWN' }), 'Envío sin confirmar');
  assert.equal(api.deliveryLabel({ direction: 'OUTBOUND', status: 'CANCELLED' }), 'Descartado');
  assert.equal(api.deliveryLabel({ direction: 'INBOUND', status: 'RECEIVED' }), null);
  assert.equal(api.STATE_LABELS.TRANSITION_PENDING, 'Tomando control…');
});

test('reply reuses the draft idempotency key and ids are URL-encoded', async () => {
  await api.sendReply('abc/..', 'hola', 'draft-key-000000001');
  const call = calls.at(-1);
  assert.equal(call.path, '/api/v1/admin/conversations/abc%2F../messages');
  assert.deepEqual(JSON.parse(call.init.body), { text: 'hola', idempotency_key: 'draft-key-000000001' });
});

test('internal notes go to their own endpoint, never the reply one, and do not hold the polling cursor', async () => {
  await api.addNote('abc/..', 'ojo con el 12B', 'note-key-000000001');
  const call = calls.at(-1);
  assert.equal(call.path, '/api/v1/admin/conversations/abc%2F../notes');
  assert.deepEqual(JSON.parse(call.init.body), { text: 'ojo con el 12B', idempotency_key: 'note-key-000000001' });
  assert.equal(api.deliveryLabel({ direction: 'INTERNAL', status: 'RECEIVED' }), null);
  assert.equal(api.threadCursor([{ sequence: 1, direction: 'INBOUND', status: 'RECEIVED' }, { sequence: 2, direction: 'INTERNAL', status: 'RECEIVED' }]), 2);
});

const msg = (sequence, direction, status, text = `m${sequence}`) => ({ sequence, direction, sender: direction === 'INBOUND' ? 'CONTACT' : 'USER', text, status, at: '' });

test('polling resumes after the last message, or before the oldest send that can still change', () => {
  assert.equal(api.threadCursor([]), 0);
  assert.equal(api.threadCursor([msg(1, 'INBOUND', 'RECEIVED'), msg(2, 'OUTBOUND', 'SENT')]), 2);
  assert.equal(api.threadCursor([msg(1, 'INBOUND', 'RECEIVED'), msg(2, 'OUTBOUND', 'QUEUED'), msg(3, 'OUTBOUND', 'UNKNOWN'), msg(4, 'INBOUND', 'RECEIVED')]), 1);
});

test('merging keeps order and lets a newer delivery status replace the old copy', () => {
  const merged = api.mergeMessages([msg(1, 'INBOUND', 'RECEIVED'), msg(2, 'OUTBOUND', 'QUEUED')], [msg(2, 'OUTBOUND', 'SENT'), msg(3, 'INBOUND', 'RECEIVED')]);
  assert.equal(merged.map((m) => `${m.sequence}:${m.status}`).join(' '), '1:RECEIVED 2:SENT 3:RECEIVED');
});

test('incremental reads pass the cursor and the list preview names who spoke', async () => {
  calls.length = 0;
  await api.getConversationMessages('a b', 41);
  assert.equal(calls[0].path, '/api/v1/admin/conversations/a%20b/messages?after=41');
  assert.equal(api.previewText({ last_message: { sender: 'BOT', text: 'Hola\n  ¿en qué\tte ayudo?' } }), 'IA: Hola ¿en qué te ayudo?');
  assert.equal(api.previewText({ last_message: { sender: 'CONTACT', text: null } }), '[contenido no textual]');
  assert.equal(api.previewText({ last_message: null }), '');
});
