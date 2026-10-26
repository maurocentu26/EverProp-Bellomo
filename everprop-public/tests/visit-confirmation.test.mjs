import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the component handlers with hook state; no browser or API is required.
function board({ fail = false, readOnly = false, conversationId, extraItems = [], mock = true, apiItems = [], visits = [], conversations = [] } = {}) {
  const item = { id: 'request-1', status: 'REQUESTED', created_at: '2026-10-24T12:00:00Z', property: { code: '12B', title: 'Unidad completa' }, contact: { name: 'Cliente de prueba', unverified: [] }, slots: [], conversation_id: 'conversation-1' };
  const other = { ...item, id: "other-request", conversation_id: "conversation-2", contact: { ...item.contact, name: "Otra conversación" } };
  const state = [[item, other, ...extraItems], '', { 'request-1': '2026-10-26T10:30' }, null, false, '', 'pending', null, false, ''];
  let cursor = 0;
  const calls = [];
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = value; }]; }, useEffect: () => {}, useCallback: fn => fn },
    'next/link': { default: 'Link' },
    'lucide-react': { CalendarCheck: 'Icon', RefreshCw: 'Icon' },
    sonner: { toast: { success: () => {}, error: () => {} } },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { apiRole: readOnly ? 'READ_ONLY' : 'ADVISOR' } }) },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogTitle'].map(key => [key, key])),
    '@/components/ui/button': { Button: 'Button' },
    '@/lib/data-mode': { isMockDataMode: mock },
    '@/lib/everprop-api': { loadEverpropVisits: async () => visits },
    '@/lib/conversations-api': { listConversations: async () => ({ data: conversations }) },
    '@/lib/assistant-api': {
      confirmVisitRequest: async (...args) => { calls.push(args); if (fail) throw new Error('network'); },
      listVisitRequests: async status => ({ data: apiItems.filter(item => item.status === status) }),
      formatSlot: () => '', slotToLocalInput: value => value,
    },
  };
  const context = { exports: {}, require: name => dependencies[name], Date };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/components/admin/assistant/VisitRequestsBoard.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const render = () => { cursor = 0; return context.exports.VisitRequestsBoard({ conversationId, channelLabel: "WhatsApp" }); };
  const text = node => node == null ? '' : ['string', 'number'].includes(typeof node) ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (!Array.isArray(node) && predicate(node)) return node;
    for (const child of Array.isArray(node) ? node : [node.props?.children]) { const found = find(child, predicate); if (found) return found; }
  }
  const button = label => find(render(), node => ['button', 'Button'].includes(node.type) && text(node).includes(label));
  return { render, text, find, button, calls, state };
}

test('review identifies client, complete unit and date before any write; cancel does not confirm', () => {
  const view = board();
  view.button('Confirmar').props.onClick();
  assert.equal(view.calls.length, 0);
  const copy = view.text(view.render());
  assert.match(copy, /Cliente de prueba/);
  assert.match(copy, /12B.*Unidad completa/);
  assert.match(copy, /26 de octubre de 2026/);
  view.button('Todavía no').props.onClick();
  assert.equal(view.calls.length, 0);
});

test('confirm sends the reviewed request and date once; error leaves review open for retry', async () => {
  const view = board({ fail: true });
  view.button('Confirmar').props.onClick();
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
  assert.equal(board({ readOnly: true }).button('Confirmar'), undefined);
});


test('embedded client panel only shows requests for the selected conversation without confirming on render', () => {
  const view = board({ conversationId: 'conversation-1' });
  const copy = view.text(view.render());
  assert.match(copy, /Sobre este cliente/);
  assert.match(copy, /Interés solicitado.*12B/);
  assert.match(copy, /Solicitada · por confirmar/);
  assert.match(copy, /WhatsApp/);
  assert.doesNotMatch(copy, /Otra conversación/);
  assert.equal(view.calls.length, 0);
});

test('an unrelated conversation has no pending visits and read-only embedded panel cannot confirm', () => {
  const view = board({ conversationId: 'missing', readOnly: true });
  assert.match(view.text(view.render()), /No hay solicitudes pendientes/);
  assert.doesNotMatch(view.text(view.render()), /Cliente de prueba|Otra conversación/);
  assert.equal(board({ conversationId: 'conversation-1', readOnly: true }).button('Revisar y confirmar'), undefined);
});

test('another time preserves the request until reviewed and saved; readonly hides all writing controls', () => {
  const view = board();
  view.button('Proponer otro horario').props.onClick();
  const input = view.find(view.render(), node => node.type === 'input');
  input.props.onChange({ target: { value: '2026-10-27T16:00' } });
  assert.equal(view.calls.length, 0);
  view.button('Revisar y confirmar').props.onClick();
  assert.equal(view.state[3].date, new Date('2026-10-27T16:00').toISOString());
  assert.equal(view.state[0][0].status, 'REQUESTED');
  assert.equal(view.calls.length, 0);
  const readonly = board({ readOnly: true });
  assert.equal(readonly.button('Otro horario'), undefined);
  assert.equal(readonly.button('Proponer otro horario'), undefined);
  assert.equal(readonly.find(readonly.render(), node => node.type === 'input'), undefined);
});

test('confirmed and past tabs use persisted states; a requested slot never supplies a confirmed date or author', () => {
  const base = { property: { code: '4B', title: 'Torre Sur' }, contact: { name: 'Confirmado', unverified: [] }, slots: [{ start_utc: '2099-01-01T10:00:00Z' }], conversation_id: 'c' };
  const view = board({ extraItems: [
    { ...base, id: 'confirmed', status: 'CONFIRMED', confirmed_by: 'Sofía', scheduled_at: '2099-01-02T14:00:00Z' },
    { ...base, id: 'missing', status: 'CONFIRMED' },
    { ...base, id: 'past', status: 'CONFIRMED', scheduled_at: '2000-01-02T14:00:00Z' },
    { ...base, id: 'declined', status: 'DECLINED' },
    { ...base, id: 'expired', status: 'REQUESTED', slots: [{ start_utc: '2000-01-01T10:00:00Z', end_utc: '2000-01-01T11:00:00Z' }] },
  ] });
  view.button('Confirmadas').props.onClick();
  const copy = view.text(view.render());
  assert.match(copy, /Confirmada por Sofía/);
  assert.match(copy, /Horario acordado no disponible/);
  assert.match(copy, /autor no disponible/);
  assert.doesNotMatch(copy, /Cliente de prueba/);
  view.button('Pasadas').props.onClick();
  assert.match(view.text(view.render()), /Rechazada/);
  assert.match(view.text(view.render()), /Solicitada · horario vencido/);
  assert.equal(view.calls.length, 0);
});

test('API board joins exact visit and conversation IDs and never substitutes assigned advisor for confirmer', async () => {
  const row = { id: 'confirmed', status: 'CONFIRMED', visit_id: 'visit-2', conversation_id: 'conversation-2', contact: { name: 'Cliente', unverified: [] }, property: { code: '12A', title: 'Las Moras' }, slots: [] };
  const view = board({ mock: false, apiItems: [row], visits: [
    { id: 'visit-1', scheduledAt: '2000-01-01T00:00:00Z' },
    { id: 'visit-2', scheduledAt: '2099-01-01T14:00:00Z', agentName: 'No es autor' },
  ], conversations: [{ id: 'conversation-2', channel: 'WHATSAPP' }] });
  view.button('Actualizar').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.state[0][0].scheduled_at, '2099-01-01T14:00:00Z');
  assert.equal(view.state[0][0].channel, 'WhatsApp');
  assert.equal(view.state[0][0].confirmed_by, undefined);
  assert.equal(view.calls.length, 0);
});
