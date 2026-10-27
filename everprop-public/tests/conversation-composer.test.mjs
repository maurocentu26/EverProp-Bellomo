import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real composer handlers with hooks in memory, without network or effects.
function inbox() {
  const state = [];
  Object.assign(state, { 5: true, 6: [{ id: 'chat', state: 'HUMAN_ACTIVE', channel: 'WEB_CHAT', contact_name: 'Cliente' }], 7: 'all:', 11: 'chat', 13: 'HUMAN_ACTIVE', 16: true, 22: 'Mi borrador' });
  const refs = [];
  let cursor = 0, refCursor = 0;
  const sends = [];
  const jsx = (type, props) => ({ type, props });
  const api = {
    CONVERSATION_TABS: [], CHANNEL_LABELS: {}, STATE_LABELS: {},
    conversationTab: () => 'human', conversationReason: () => '',
    initials: () => 'C', previewText: () => '', sameDay: () => true, clockTime: () => '',
    listConversations: async () => ({ data: state[6] }),
    visibleConversations: items => items,
    suggestReply: async () => ({ data: { suggestion_id: 'suggestion', text: 'Respuesta sugerida' } }),
    sendReply: async (...args) => sends.push(args),
    threadCursor: () => 0, mergeMessages: () => [], MESSAGE_PAGE: 100,
    getConversationMessages: async () => ({ data: [], conversation: { state: 'HUMAN_ACTIVE', epoch: 1, ai_enabled: true, copilot_enabled: true } }),
  };
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      Fragment: 'Fragment', useEffect: () => {}, useCallback: fn => fn,
      useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
      useRef: initial => { const i = refCursor++; return refs[i] ??= { current: i === 3 ? 'chat' : initial }; },
    },
    'lucide-react': new Proxy({}, { get: () => 'Icon' }),
    sonner: { toast: { success: () => {}, error: error => { throw new Error(error); } } },
    'next/navigation': { useRouter: () => ({}) },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { id: 'advisor', apiRole: 'ADVISOR' } }) },
    '@/lib/conversations-api': api,
    '@/lib/conversation-presentation': api,
    '@/components/admin/assistant/VisitRequestsBoard': { VisitRequestsBoard: 'VisitRequestsBoard' },
  };
  const context = { exports: {}, require: name => deps[name], window: { setTimeout: () => {} } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/components/admin/conversations/ConversationInbox.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const render = () => { cursor = refCursor = 0; return context.exports.ConversationInbox(); };
  const text = node => !node ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (!Array.isArray(node) && predicate(node)) return node;
    for (const child of Array.isArray(node) ? node : [node.props?.children]) { const found = find(child, predicate); if (found) return found; }
  }
  const button = label => find(render(), node => node.type === 'button' && text(node).includes(label));
  const draft = () => find(render(), node => node.type === 'textarea').props.value;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const suggest = async () => { button('Sugerir').props.onClick(); await settle(); };
  const send = async () => { find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await settle(); };
  return { render, text, find, button, draft, suggest, send, sends };
}

test('available suggestion appears as a card and preserves draft until explicitly used', async () => {
  const view = inbox();
  assert.equal(view.button('Usar esta respuesta'), undefined);
  await view.suggest();
  const card = view.find(view.render(), node => node.props?.['aria-label'] === 'Sugerencia del copiloto');
  assert.match(view.text(card), /Respuesta sugerida/);
  assert.ok(view.button('Escribir otra'));
  assert.equal(view.draft(), 'Mi borrador');
  assert.equal(view.sends.length, 0);
  view.button('Usar esta respuesta').props.onClick();
  assert.equal(view.draft(), 'Respuesta sugerida');
  await view.send();
  assert.equal(view.sends[0][1], 'Respuesta sugerida');
  assert.equal(view.sends[0][3], 'suggestion');
});

test('discard preserves draft; unused suggestion is not attributed to manual replies', async () => {
  const view = inbox();
  await view.suggest();
  view.button('Escribir otra').props.onClick();
  assert.equal(view.draft(), 'Mi borrador');
  assert.equal(view.button('Usar esta respuesta'), undefined);
  await view.suggest();
  await view.send();
  assert.equal(view.sends[0][1], 'Mi borrador');
  assert.equal(view.sends[0][3], undefined);
});
