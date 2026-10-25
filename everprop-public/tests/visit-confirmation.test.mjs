import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the component handlers with hook state; no browser or API is required.
function board({ fail = false, readOnly = false } = {}) {
  const item = { id: 'request-1', property: { code: '12B', title: 'Unidad completa' }, contact: { name: 'Cliente de prueba', unverified: [] }, slots: [], conversation_id: 'conversation-1' };
  const state = [[item], '', { 'request-1': '2026-10-26T10:30' }];
  let cursor = 0;
  const calls = [];
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; }, useEffect: () => {}, useCallback: fn => fn },
    'next/link': { default: 'Link' },
    'lucide-react': { CalendarCheck: 'Icon', RefreshCw: 'Icon' },
    sonner: { toast: { success: () => {}, error: () => {} } },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { apiRole: readOnly ? 'READ_ONLY' : 'ADVISOR' } }) },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogTitle'].map(key => [key, key])),
    '@/components/ui/button': { Button: 'Button' },
    '@/lib/assistant-api': {
      confirmVisitRequest: async (...args) => { calls.push(args); if (fail) throw new Error('network'); },
      listVisitRequests: async () => ({ data: [] }),
      formatSlot: () => '', slotToLocalInput: value => value,
    },
  };
  const context = { exports: {}, require: name => dependencies[name], Date };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/components/admin/assistant/VisitRequestsBoard.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const render = () => { cursor = 0; return context.exports.VisitRequestsBoard(); };
  const text = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (!Array.isArray(node) && predicate(node)) return node;
    for (const child of Array.isArray(node) ? node : [node.props?.children]) { const found = find(child, predicate); if (found) return found; }
  }
  const button = label => find(render(), node => ['button', 'Button'].includes(node.type) && text(node).includes(label));
  return { render, text, find, button, calls };
}

test('review identifies client, complete unit and date before any write; cancel does not confirm', () => {
  const view = board();
  view.button('Revisar y confirmar').props.onClick();
  assert.equal(view.calls.length, 0);
  const copy = view.text(view.render());
  assert.match(copy, /Cliente de prueba/);
  assert.match(copy, /12B.*Unidad completa/);
  assert.match(copy, /26 de octubre de 2026/);
  assert.match(copy, /hora argentina/);
  view.button('Todavía no').props.onClick();
  assert.equal(view.calls.length, 0);
});

test('confirm sends the reviewed request and date once; error leaves review open for retry', async () => {
  const view = board({ fail: true });
  view.button('Revisar y confirmar').props.onClick();
  view.button('Confirmar y agendar').props.onClick();
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0][0], 'request-1');
  assert.equal(view.calls[0][1], new Date('2026-10-26T10:30').toISOString());
  assert.equal(view.button('Confirmando').props.disabled, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(view.text(view.render()), /No se pudo confirmar/);
  assert.ok(view.button('Confirmar y agendar'));
});

test('read-only role keeps confirmation action hidden', () => {
  assert.equal(board({ readOnly: true }).button('Revisar y confirmar'), undefined);
});
