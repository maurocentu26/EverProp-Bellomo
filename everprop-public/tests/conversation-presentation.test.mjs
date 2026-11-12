import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {}, URLSearchParams };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/conversation-presentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { conversationTab, conversationReason, visibleConversations, unansweredFor, filterFromHash } = context.exports;

test('EVP-125: the possible-leads view lists every state, shows the unanswered wait and opens from the menu hash', () => {
  const items = [{ state: 'AI_ACTIVE' }, { state: 'WAITING_HUMAN' }];
  assert.equal(visibleConversations(items, 'human', '').length, 1);
  assert.equal(visibleConversations(items, 'human', '', true).length, 2);
  const now = new Date('2026-11-12T12:00:00Z');
  assert.equal(unansweredFor('2026-11-12T11:59:40Z', now), 'Sin respuesta hace instantes');
  assert.equal(unansweredFor('2026-11-12T11:35:00Z', now), 'Sin respuesta hace 25 min');
  assert.equal(unansweredFor('2026-11-12T07:00:00Z', now), 'Sin respuesta hace 5 h');
  assert.equal(unansweredFor('2026-11-10T11:00:00Z', now), 'Sin respuesta hace 2 d');
  assert.equal(filterFromHash('#filtro=posibles-leads'), 'leads');
  assert.equal(filterFromHash('#q=lote'), null);
});

test('each real state belongs to exactly one tray; pending control is never shown as AI or confirmed control', () => {
  const states = ['AI_ACTIVE', 'WAITING_TOOL', 'WAITING_HUMAN', 'TRANSITION_PENDING', 'HUMAN_ACTIVE', 'CLOSED'];
  assert.deepEqual(states.map(conversationTab), ['ai', 'ai', 'human', 'human', 'human', 'closed']);
  assert.equal(conversationReason({ state: 'TRANSITION_PENDING' }), 'Esperando control humano');
  const counts = ['human', 'ai', 'closed'].map(tab => states.filter(state => conversationTab(state) === tab).length);
  assert.deepEqual(counts, [3, 2, 1]);
});

test('reason labels describe returned state without inventing an AI handoff or visit intent', () => {
  assert.equal(conversationReason({ state: 'WAITING_HUMAN', out_of_hours: true }), 'Espera respuesta · fuera de horario');
  assert.equal(conversationReason({ state: 'WAITING_HUMAN' }), 'Espera respuesta');
  assert.equal(conversationReason({ state: 'WAITING_TOOL' }), 'IA consultando datos');
  assert.equal(conversationReason({ state: 'AI_ACTIVE' }), 'Atención automática');
  assert.equal(conversationReason({ state: 'HUMAN_ACTIVE' }), 'Atención del asesor');
  assert.equal(conversationReason({ state: 'CLOSED' }), 'Conversación cerrada');
});
