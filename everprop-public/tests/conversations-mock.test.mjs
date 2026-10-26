import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, mock = true) {
  const calls = [];
  const context = { exports: {}, URLSearchParams, require(name) {
    if (name.endsWith('/data-mode')) return { isMockDataMode: mock };
    if (name.endsWith('/everprop-api')) return { apiFetch: async (...args) => { calls.push(args); if (mock) throw new Error('Mock reached API'); return { data: [] }; } };
    throw new Error(`Unexpected import: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return { api: context.exports, calls };
}

test('mock inbox has five synthetic contacts, channels, filters, handoff and all three speakers', async () => {
  const { api, calls } = load('conversations-api');
  const { data } = await api.listConversations('all');
  assert.equal(data.length, 5);
  assert.deepEqual(new Set(data.map(row => row.channel)), new Set(['WHATSAPP', 'WEB_CHAT']));
  assert.equal((await api.listConversations('waiting')).data.length, 1);
  assert.equal((await api.listConversations('mine')).data.length, 1);
  assert.equal((await api.listConversations('unread')).data.length, 1);
  assert.equal((await api.listConversations('all', 'Lucía')).data.length, 1);
  assert.equal((await api.listConversations('all', 'inexistente')).data.length, 0);
  const first = await api.getConversationMessages(data[0].id);
  assert.equal(first.conversation.handoff.reason, 'USER_REQUEST');
  assert.match(first.conversation.handoff.summary, /12 de Las Moras/);
  const human = await api.getConversationMessages(data[1].id);
  assert.deepEqual(new Set(human.data.map(row => row.sender)), new Set(['CONTACT', 'BOT', 'USER']));
  assert.equal((await api.getConversationMessages(data[1].id, 3)).data.length, 1);
  assert.equal(calls.length, 0);
});

test('every mock conversation action stays local; sends deduplicate and state survives polling', async () => {
  const { api, calls } = load('conversations-api');
  const id = (await api.listConversations('waiting')).data[0].id;
  assert.equal((await api.takeOver(id)).data.confirmed, true);
  assert.equal((await api.getConversationMessages(id)).conversation.state, 'HUMAN_ACTIVE');
  const suggestion = (await api.suggestReply(id)).data;
  assert.match(suggestion.text, /12 de Las Moras/);
  const sent = await api.sendReply(id, suggestion.text, 'reply-1', suggestion.suggestion_id);
  assert.equal((await api.sendReply(id, suggestion.text, 'reply-1')).data.replayed, true);
  assert.equal((await api.sendReply(id, suggestion.text, 'reply-1')).data.sequence, sent.data.sequence);
  await api.addNote(id, 'Nota interna', 'note-1');
  assert.equal((await api.getConversationMessages(id)).data.at(-1).direction, 'INTERNAL');
  const template = (await api.listTemplates(id)).data[0];
  await api.sendTemplate(id, template, ['Lucía'], 'template-1');
  assert.equal((await api.resolveUnknownSends(id)).data.resolved, 0);
  await assert.rejects(api.sendAttachment(id, {}, '', 'file-1'), /modo API/);
  await assert.rejects(api.openConversationLead(id), /modo API/);
  await api.resumeAi(id, 'Prueba');
  assert.equal((await api.getConversationMessages(id)).conversation.state, 'AI_ACTIVE');
  await api.closeConversation(id);
  const epoch = (await api.getConversationMessages(id)).conversation.epoch;
  await assert.rejects(api.reopenConversation(id, epoch - 1), /cambió/);
  await api.reopenConversation(id, epoch);
  assert.equal((await api.getConversationMessages(id)).conversation.state, 'WAITING_HUMAN');
  assert.equal(calls.length, 0);
});

test('mock visit starts requested with exact unit and slot; confirmation and decline stay local', async () => {
  const { api, calls } = load('assistant-api');
  const visit = (await api.listVisitRequests()).data[0];
  assert.equal((await api.listVisitRequests()).data.length, 3);
  assert.equal((await api.listVisitRequests('CONFIRMED')).data.length, 3);
  assert.deepEqual(new Set((await api.listVisitRequests()).data.map(item => item.property.code)), new Set(['12', '12A', '4B']));
  assert.equal(visit.conversation_id, 'mock-conversation-1');
  assert.equal(visit.property.code, '12');
  assert.equal(visit.property.title, 'Las Moras');
  assert.equal(visit.status, 'REQUESTED');
  assert.match(api.formatSlot(visit.slots[0]), /10:30/);
  await assert.rejects(api.confirmVisitRequest(visit.id, 'invalid'));
  await assert.rejects(api.confirmVisitRequest(visit.id, '2000-01-01T00:00:00Z'));
  await api.confirmVisitRequest(visit.id, new Date(Date.now() + 86400000).toISOString());
  assert.equal((await api.listVisitRequests()).data.length, 2);
  const confirmed = (await api.listVisitRequests('CONFIRMED')).data.find(item => item.id === visit.id);
  assert.equal(confirmed.visit_id, 'mock-scheduled-visit-1');
  assert.ok(confirmed.scheduled_at);
  const declined = load('assistant-api');
  await declined.api.declineVisitRequest(visit.id);
  assert.equal((await declined.api.listVisitRequests('DECLINED')).data.length, 1);
  assert.equal(calls.length + declined.calls.length, 0);
});

test('API mode never serves synthetic conversations or visits and preserves endpoints', async () => {
  const conversations = load('conversations-api', false);
  assert.equal((await conversations.api.listConversations('all')).data.length, 0);
  await conversations.api.suggestReply('real-id');
  assert.equal(conversations.calls[1][0], '/api/v1/admin/conversations/real-id/suggestion');
  const visits = load('assistant-api', false);
  assert.equal((await visits.api.listVisitRequests()).data.length, 0);
  await visits.api.confirmVisitRequest('real-id', '2026-10-26T13:30:00Z');
  await visits.api.declineVisitRequest('real-id');
  assert.equal(visits.calls[0][0], '/api/v1/admin/visit-requests?status=REQUESTED');
  assert.equal(visits.calls[1][0], '/api/v1/admin/visit-requests/real-id/confirm');
  assert.equal(visits.calls[2][0], '/api/v1/admin/visit-requests/real-id/decline');
});


test('visit slots use Argentine dates and 24-hour time without a technical timezone', () => {
  const { api } = load('assistant-api');
  assert.equal(api.formatSlot({ start_utc: '2026-10-26T13:30:00Z', end_utc: '2026-10-26T14:00:00Z', timezone: 'America/Argentina/Buenos_Aires' }), 'Lunes 26/10, de 10:30 a 11:00');
  assert.equal(api.formatSlot({ start_utc: '2026-10-27T02:30:00Z', end_utc: '2026-10-27T02:45:00Z', timezone: 'UTC' }), 'Lunes 26/10, de 23:30 a 23:45');
});
