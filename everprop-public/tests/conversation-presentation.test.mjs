import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/conversation-presentation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { conversationTab, conversationReason } = context.exports;

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
