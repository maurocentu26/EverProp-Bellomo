import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/advisor-day-guide.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { dayPriorities, priorityReason, claimDayGuide, leadInitials } = context.exports;

test('round keeps board order, excludes current contacts, handles zero to four and does not mutate the queue', () => {
  const queue = [3, 3, 2, 1, 1, 0].map((priorityWeight, id) => ({ lead: { id }, priorityWeight }));
  assert.deepEqual(Array.from(dayPriorities(queue), item => item.lead.id), [0, 1, 2, 3]);
  assert.equal(queue.length, 6);
  assert.equal(dayPriorities([]).length, 0);
  assert.equal(dayPriorities(queue.slice(2, 4)).length, 2);
  assert.equal(dayPriorities(queue.slice(5)).length, 0);
});

test('opening marks seen immediately, reload/close do not reopen; user and new day are independent', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(claimDayGuide(storage, 'user-a', '2026-10-24'), true);
  assert.equal(data.get('user-a'), '2026-10-24');
  assert.equal(claimDayGuide(storage, 'user-a', '2026-10-24'), false);
  assert.equal(claimDayGuide(storage, 'user-b', '2026-10-24'), true);
  assert.equal(claimDayGuide(storage, 'user-a', '2026-10-25'), true);
});

test('reasons explain priority without reporting a successful result', () => {
  assert.match(priorityReason({ isOverdue: true, isDueToday: true }), /vencido/);
  assert.match(priorityReason({ isDueToday: true }), /hoy/);
  assert.match(priorityReason({ isNew: true }), /primera respuesta/);
  assert.match(priorityReason({}), /próximo paso/);
});

test('guide welcome pluralizes round and pending counts independently', () => {
  const source = fs.readFileSync(new URL('../src/components/admin/advisor/AdvisorDayGuide.tsx', import.meta.url), 'utf8');
  for (const [count, expected] of [[0, '0 prioridades de 0 pendientes'], [1, '1 prioridad de 1 pendiente'], [2, '2 prioridades de 2 pendientes'], [5, '4 prioridades de 5 pendientes']]) {
    const queue = Array.from({ length: count }, (_, id) => ({ lead: { id: String(id), name: `Cliente ${id}` }, priorityWeight: 1 }));
    let hook = 0;
    const jsx = (type, props) => ({ type, props });
    const dependencies = {
      'react/jsx-runtime': { jsx, jsxs: jsx },
      react: { useState: () => [[true, dayPriorities(queue), -1, {}, null][hook++], () => {}], useRef: () => ({ current: '' }), useEffect: () => {} },
      'next/link': { default: 'Link' },
      'lucide-react': {},
      '@/lib/advisor-day-guide': context.exports,
      '@/components/admin/LeadFollowUpEditor': { LeadFollowUpEditor: 'Editor' },
    '@/components/admin/LeadMessagesLink': { LeadMessagesLink: 'LeadMessagesLink' },
      '@/components/ui/button': { Button: 'Button' },
      '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogTitle', 'DialogTrigger'].map(key => [key, key])),
    };
    const component = { exports: {}, require: name => dependencies[name] };
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText, component);
    const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
    const rendered = component.exports.AdvisorDayGuide({ userId: 'test', day: '2026-10-24', queue, ready: true, onSave: () => {} });
    assert.ok(text(rendered).includes(expected), expected);
    assert.ok(text(rendered).includes(count === 1 ? 'Empezamos por tu prioridad' : `Empezamos por tus ${Math.min(count, 4)} prioridades`));
  }
});


test('initials use first letters of words, preserve accents and accept empty names', () => {
  assert.equal(leadInitials('  Ana   Ruiz '), 'AR');
  assert.equal(leadInitials('Érica'), 'É');
  assert.equal(leadInitials(''), '');
});

test('overdue reason uses the recorded deadline, not a made-up waiting age', () => {
  assert.equal(priorityReason({ isOverdue: true, state: { detail: 'Venció hace 4 días' } }), 'Venció hace 4 días');
});


function guideHarness(queue, onSave = async () => {}) {
  const source = fs.readFileSync(new URL('../src/components/admin/advisor/AdvisorDayGuide.tsx', import.meta.url), 'utf8');
  const state = [true, dayPriorities(queue), -1, {}, null];
  let hook = 0;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: () => { const index = hook++; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; }, useRef: () => ({ current: null }), useEffect: () => {} },
    'next/link': { default: 'Link' }, 'lucide-react': {}, '@/lib/advisor-day-guide': context.exports,
    '@/components/admin/LeadFollowUpEditor': { LeadFollowUpEditor: 'Editor' },
    '@/components/admin/LeadMessagesLink': { LeadMessagesLink: 'LeadMessagesLink' },
    '@/components/ui/button': { Button: 'Button' },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogTitle', 'DialogTrigger'].map(key => [key, key])),
  };
  const component = { exports: {}, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, component);
  const render = () => { hook = 0; return component.exports.AdvisorDayGuide({ userId: 'u1', day: '2026-10-24', queue, ready: true, onSave }); };
  const nodes = root => root == null || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)];
  const text = root => root == null ? '' : typeof root !== 'object' ? String(root) : Array.isArray(root) ? root.map(text).join('') : text(root.props?.children);
  const button = label => nodes(render()).find(node => node.type === 'Button' && text(node).trim() === label);
  return { state, render, nodes, text, button };
}

const roundQueue = () => [0, 1].map(id => ({ lead: { id: `lead-${id}`, name: `Cliente ${id}`, phone: '+54 341 5550000' }, priorityWeight: 1, isNew: true }));

test('client step shows one central accessible name and reason, with only back and progress in the top bar', () => {
  const guide = guideHarness(roundQueue());
  guide.button('Empezar').props.onClick();
  const nodes = guide.nodes(guide.render());
  const client = nodes.find(node => node.props?.className === 'day-guide-client');
  assert.equal(nodes.filter(node => node.type === 'DialogTitle').length, 1);
  assert.equal(nodes.filter(node => node.type === 'DialogDescription').length, 1);
  assert.equal(guide.text(guide.nodes(client).find(node => node.type === 'DialogTitle')), 'Cliente 0');
  assert.equal(guide.text(guide.nodes(client).find(node => node.type === 'DialogDescription')), priorityReason(roundQueue()[0]));
  assert.equal(guide.text(nodes.find(node => node.props?.className === 'day-guide-top')), '‹ AtrásPaso 1 de 2');
  assert.match(guide.text(client), /\+54 341 5550000/);
});

test('guide skips without saving and finishes honestly without a success check', () => {
  let saves = 0;
  const guide = guideHarness(roundQueue(), async () => { saves++; });
  guide.button('Empezar').props.onClick();
  guide.button('Saltar por ahora').props.onClick();
  assert.equal(guide.state[2], 1);
  guide.button('Saltar por ahora').props.onClick();
  assert.equal(saves, 0);
  assert.match(guide.text(guide.render()), /0 seguimientos registrados · 2 contactos saltados/);
  assert.match(guide.text(guide.render()), /Quedan 2 contactos prioritarios/);
  assert.doesNotMatch(guide.text(guide.render()), /Listo|resueltos/);
});

test('guide records only after successful persistence; failure/cancel keep the client and draft editor', async () => {
  let fail = true;
  const saves = [];
  const guide = guideHarness(roundQueue(), async (followUp, lead) => { if (fail) throw new Error('server unavailable'); saves.push([followUp, lead.id]); });
  guide.button('Empezar').props.onClick();
  guide.button('¿Qué pasó? Registrar resultado').props.onClick();
  let editor = guide.nodes(guide.render()).find(node => node.type === 'Editor');
  await assert.rejects(editor.props.onConfirm({ result: 'No atendió' }), /server unavailable/);
  assert.equal(guide.state[2], 0);
  assert.equal(Object.keys(guide.state[3]).length, 0);
  assert.equal(guide.state[4].id, 'lead-0');
  fail = false;
  await editor.props.onConfirm({ result: 'No atendió' });
  assert.equal(saves[0][1], 'lead-0');
  assert.equal(guide.state[3]['lead-0'], 'recorded');
  assert.equal(guide.state[4], null);
  assert.match(guide.text(guide.render()), /Listo · seguimiento guardado/);
  assert.doesNotMatch(guide.text(guide.render()), /resuelto/);
  guide.button('Listo · seguir').props.onClick();
  guide.button('¿Qué pasó? Registrar resultado').props.onClick();
  editor = guide.nodes(guide.render()).find(node => node.type === 'Editor');
  editor.props.onClose();
  assert.equal(guide.state[2], 1);
  assert.equal(guide.state[3]['lead-1'], undefined);
});

test('refreshing the queue does not reorder the captured round', () => {
  const queue = roundQueue();
  const guide = guideHarness(queue);
  guide.button('Empezar').props.onClick();
  queue.reverse();
  assert.equal(guide.state[1][0].lead.id, 'lead-0');
  assert.match(guide.text(guide.render()), /Cliente 0/);
});


test('messages carries the current client without saving or advancing the guided round', () => {
  let saves = 0;
  const guide = guideHarness(roundQueue(), async () => { saves++; });
  guide.button('Empezar').props.onClick();
  const action = guide.nodes(guide.render()).find(node => node.type === 'LeadMessagesLink');
  assert.equal(action.props.lead.id, 'lead-0');
  assert.equal(guide.state[2], 0);
  assert.equal(saves, 0);
  assert.equal(Object.keys(guide.state[3]).length, 0);
});
