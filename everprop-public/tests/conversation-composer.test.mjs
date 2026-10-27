import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real composer handlers with hooks in memory, without network or effects.
function inbox({ readOnly = false } = {}) {
  const state = [];
  Object.assign(state, { 5: [{ id: 'chat', state: 'HUMAN_ACTIVE', channel: 'WEB_CHAT', contact_name: 'Cliente' }], 9: 'chat', 11: 'HUMAN_ACTIVE', 14: true, 20: 'Mi borrador' });
  const refs = [];
  let cursor = 0, refCursor = 0;
  const sends = [];
  const jsx = (type, props) => ({ type, props });
  const api = {
    CONVERSATION_TABS: [], CHANNEL_LABELS: {}, STATE_LABELS: {},
    conversationTab: () => 'human', conversationReason: () => '',
    initials: () => 'C', previewText: () => '', sameDay: () => true, clockTime: () => '',
    listConversations: async () => ({ data: state[5] }),
    suggestReply: async () => ({ data: { suggestion_id: 'suggestion', text: 'Respuesta sugerida' } }),
    sendReply: async (...args) => sends.push(args),
    threadCursor: () => 0, mergeMessages: () => [], MESSAGE_PAGE: 100,
    getConversationMessages: async () => ({ data: [], conversation: { state: 'HUMAN_ACTIVE', epoch: 1, ai_enabled: true, copilot_enabled: true } }),
  };
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      Fragment: 'Fragment', useEffect: () => {}, useLayoutEffect: () => {}, useCallback: fn => fn,
      useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
      useRef: initial => { const i = refCursor++; return refs[i] ??= { current: i === 3 ? 'chat' : initial }; },
    },
    'lucide-react': new Proxy({}, { get: () => 'Icon' }),
    sonner: { toast: { success: () => {}, error: error => { throw new Error(error); } } },
    'next/navigation': { useRouter: () => ({}) },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { id: 'advisor', apiRole: readOnly ? 'READ_ONLY' : 'ADVISOR' } }) },
    '@/lib/conversations-api': api,
    '@/lib/conversation-presentation': api,
    '@/components/ui/dialog': { Dialog: 'Dialog', DialogContent: 'DialogContent', DialogTitle: 'DialogTitle', DialogDescription: 'DialogDescription' },
    '@/components/admin/assistant/VisitRequestsBoard': { VisitRequestsBoard: 'VisitRequestsBoard' },
  };
  const context = { exports: {}, require: name => deps[name], window: { setTimeout: () => {}, matchMedia: () => ({ matches: false }) } };
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

test('internal note disables attachments and preserves the client draft', () => {
  const view = inbox();
  view.button('Nota interna').props.onClick();
  assert.equal(view.button('Adjuntar').props.disabled, true);
  assert.match(view.text(view.button('Adjuntar')), /Volvé a responder al cliente/);
  view.button('Responder al cliente').props.onClick();
  assert.equal(view.draft(), 'Mi borrador');
});

test('read-only users can inspect the client but cannot send or mutate conversations', () => {
  const view = inbox({ readOnly: true });
  assert.equal(view.find(view.render(), node => node.type === 'textarea'), undefined);
  assert.equal(view.button('Ver cliente').props.disabled, false);
  for (const label of ['Respuestas rápidas', 'Nota interna', 'Adjuntar', 'Sugerir', 'Tomar control', 'Pasar a IA', 'Cerrar conversación']) {
    assert.equal(view.button(label).props.disabled, true, label);
    assert.match(view.text(view.button(label)), /Permiso de solo lectura/);
  }
});

test('client action restores focus to the visible client panel; cancellation returns to actions', () => {
  const view = inbox();
  const trigger = {}, clientBack = {};
  view.button('Acciones').props.ref.current = trigger;
  view.button('Atrás al chat').props.ref.current = clientBack;
  view.button('Ver cliente').props.onClick();
  const popup = view.find(view.render(), node => node.type === 'DialogContent');
  assert.equal(popup.props.finalFocus(), clientBack);
  assert.equal(popup.props.finalFocus(), trigger);
});
