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
