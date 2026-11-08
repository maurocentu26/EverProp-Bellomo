import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real composer handlers with hooks in memory, without network or effects.
function inbox(messages = []) {
  const state = [];
  Object.assign(state, { 5: true, 7: [{ id: 'chat', state: 'HUMAN_ACTIVE', channel: 'WEB_CHAT', contact_name: 'Cliente' }], 8: 'all:', 12: 'chat', 14: 'HUMAN_ACTIVE', 16: true, 17: true, 23: 'Mi borrador' });
  const refs = [];
  state[21] = messages;
  let cursor = 0, refCursor = 0;
  const sends = [];
  const jsx = (type, props) => ({ type, props });
  const api = {
    CONVERSATION_TABS: [], CHANNEL_LABELS: {}, STATE_LABELS: {},
    conversationTab: () => 'human', conversationReason: () => '',
    initials: () => 'C', previewText: () => '', sameDay: () => true, clockTime: () => '', dayLabel: () => 'Today',
    messageDescription: message => message.text || `Shared description: ${message.event_kind}`,
    listConversations: async () => ({ data: state[7] }),
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
    'next/link': { default: 'Link' },
    '@base-ui/react/dialog': { Dialog: { Popup: 'SheetPopup', Portal: 'SheetPortal', Backdrop: 'SheetBackdrop' } },
    '@/components/ui/sheet': Object.fromEntries(['Sheet','SheetTrigger','SheetPortal','SheetOverlay','SheetClose','SheetTitle','SheetDescription'].map(name => [name,name])),
    '@/components/theme/PanelTextSize': { PanelTextSizeControl: 'TextSizeControl', usePanelTextSize: () => 'actual' },
    '@/components/theme/ThemeToggle': { ThemeToggle: 'ThemeToggle' },
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
  return { render, text, find, button, draft, suggest, send, sends, state };
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

test('client drawer stays mounted and opening or dismissing it preserves the reply draft', () => {
  const view = inbox();
  assert.equal(view.render().type, 'Sheet');
  assert.equal(view.render().props.open, false);
  assert.equal(view.find(view.render(), node => node.type === 'SheetPortal').props.keepMounted, true);
  view.render().props.onOpenChange(true);
  assert.equal(view.render().props.open, true);
  assert.equal(view.draft(), 'Mi borrador');
  view.render().props.onOpenChange(false);
  assert.equal(view.render().props.open, false);
  assert.equal(view.draft(), 'Mi borrador');
  assert.equal(view.sends.length, 0);
});

test('EVP-104: actions menu supports keyboard ArrowDown/Escape and resume AI dialog has aria-modal and Escape close', () => {
  const view = inbox();
  const moreBtn = view.button('Más');
  assert.ok(moreBtn, 'Should render Más trigger button');
  assert.equal(moreBtn.props['aria-haspopup'], 'menu');
  moreBtn.props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  let tree = view.render();
  const menu = view.find(tree, node => node.props?.role === 'menu' && node.props?.['aria-label'] === 'Acciones disponibles');
  assert.ok(menu, 'ArrowDown on Más trigger must open actions menu');
  menu.props.onKeyDown({ key: 'Escape', preventDefault() {} });
  assert.equal(view.find(view.render(), node => node.props?.role === 'menu' && node.props?.['aria-label'] === 'Acciones disponibles'), undefined, 'Escape must close actions menu');

  view.button('Más').props.onClick();
  const resumeItem = view.find(view.render(), node => node.props?.role === 'menuitem' && view.text(node).includes('Pasar a IA'));
  assert.ok(resumeItem, 'Should render Pasar a IA menuitem when human is in control and AI enabled');
  resumeItem.props.onClick();
  tree = view.render();
  const dialog = view.find(tree, node => node.props?.role === 'dialog' && node.props?.['aria-labelledby'] === 'resume-title');
  assert.ok(dialog, 'Should open resume AI dialog');
  assert.equal(dialog.props['aria-modal'], 'true', 'Resume AI dialog must have aria-modal="true"');
  dialog.props.onKeyDown({ key: 'Escape', preventDefault() {} });
  assert.equal(view.find(view.render(), node => node.props?.role === 'dialog' && node.props?.['aria-labelledby'] === 'resume-title'), undefined, 'Escape must close resume AI dialog');
});

test('nontext bubbles use the shared description without changing the composer draft', () => {
  const view = inbox([{ sequence: 1, direction: 'INBOUND', sender: 'CONTACT', text: null, event_kind: 'CONTACT', status: 'RECEIVED', at: '2026-11-03T12:00:00Z' }]);
  assert.match(view.text(view.render()), /Shared description: CONTACT/);
  assert.equal(view.draft(), 'Mi borrador');
  assert.equal(view.sends.length, 0);
});

test('EVP-67: "/" filters quick replies and picking one replaces the search', () => {
  const view = inbox();
  view.state[23] = '/llame';
  const panel = view.find(view.render(), node => node.props?.['aria-label'] === 'Respuestas rápidas' && node.props?.role === 'group');
  assert.ok(panel, 'typing / opens the quick replies');
  const picks = [];
  view.find(panel, node => { if (node.type === 'button' && node.props.className === 'conversation-quick-item') picks.push(node); return false; });
  assert.equal(picks.length, 1);
  picks[0].props.onClick();
  assert.equal(view.draft(), '¿Te queda bien que te llame? Pasame el mejor horario.');
  assert.equal(view.sends.length, 0);
});

test('EVP-67: on a wide screen the client docks beside the chat instead of opening the modal drawer', () => {
  const view = inbox();
  view.find(view.render(), node => node.props?.id === 'conversation-client-toggle').props.onClick();
  assert.equal(view.render().props.open, true, 'narrow screens use the drawer');
  view.state[40] = true; // wide (min-width: 1280px) with the regular text size
  const tree = view.render();
  assert.equal(tree.props.open, false);
  const docked = view.find(tree, node => node.props?.className === 'conversation-client-docked');
  assert.ok(view.find(docked, node => node.type === 'VisitRequestsBoard'), 'docked panel shows the visits');
  const drawer = view.find(tree, node => node.type === 'SheetPortal');
  assert.equal(view.find(drawer, node => node.type === 'VisitRequestsBoard'), undefined, 'never mounted twice');
  assert.equal(view.draft(), 'Mi borrador');
});
