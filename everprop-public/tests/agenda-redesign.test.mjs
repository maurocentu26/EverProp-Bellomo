import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props });
const components = new Proxy({}, { get: (_, key) => key });
const dates = { exports: {}, Intl, Date };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/lead-follow-up.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, dates);

test('EVP-71 month grid begins on Monday in every month', () => {
  const context = { exports: {}, require: () => components, Date };
  const source = fs.readFileSync(new URL('../src/components/admin/CalendarAgenda.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source + '\nexports.grid = getMonthGrid;', { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  for (let month = 0; month < 12; month++) {
    const grid = context.exports.grid(new Date(2026, month, 15));
    assert.equal(grid[0].date.getDay(), 1);
    assert.equal(grid.length, 42);
    assert.equal(grid.filter(day => day.current).length, new Date(2026, month + 1, 0).getDate());
  }
});

test('EVP-71 samples are mock-only, relative, assigned to Lucas and do not resurrect cancelled samples', () => {
  let leads = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, name: `Cliente ${i}`, agentId: 'usr-sales', propertyIds: [`p${i}`], visits: [] }));
  const stored = new Map(), mode = { isMockDataMode: false };
  let writes = 0;
  const deps = {
    '@/data/admin-sample': { leads, properties: leads.map(lead => ({ id: lead.propertyIds[0], title: `Unidad ${lead.id}` })) },
    '@/lib/admin-storage': { loadLeadList: () => leads, saveLeadList: rows => { leads = rows; writes++; } },
    '@/lib/data-mode': mode, '@/lib/lead-follow-up': dates.exports,
  };
  const context = { exports: {}, Date, require: name => deps[name], window: { localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/mock-agenda.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const now = new Date('2026-10-25T13:00:00-03:00');
  context.exports.seedMockAgenda(now); assert.equal(writes, 0);
  mode.isMockDataMode = true;
  context.exports.seedMockAgenda(now);
  const visits = leads.flatMap(lead => lead.visits);
  assert.equal(visits.length, 6);
  assert.equal(Date.parse(visits[0].scheduledAt) - now.getTime(), 90 * 60000);
  assert.deepEqual(visits.map(visit => dates.exports.toArgentinaDateTimeInputValue(new Date(visit.scheduledAt)).slice(0, 10)), ['2026-10-25', '2026-10-25', '2026-10-26', '2026-10-28', '2026-10-24', '2026-10-27']);
  assert.equal(visits[4].status, 'completed'); assert.equal(visits[5].status, 'cancelled');
  for (const visit of visits) { assert.equal(visit.agentId, 'usr-sales'); assert.ok(visit.propertyTitle); }
  leads[0].visits = [];
  context.exports.seedMockAgenda(now);
  assert.equal(leads[0].visits.length, 0); assert.equal(writes, 1);
  context.exports.seedMockAgenda(new Date('2026-10-26T13:00:00-03:00'));
  assert.equal(leads.flatMap(lead => lead.visits).length, 6); assert.equal(writes, 2);
});
function view(file, overrides = {}) {
  const state = [], callbacks = [], calls = [], effects = [];
  let cursor = 0;
  const deps = {
    react: { useState: initial => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; }, useMemo: fn => fn(), useCallback: fn => { callbacks.push(fn); return fn; }, useEffect: fn => effects.push(fn), useRef: initial => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: 'Link' },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { id: 'a1', name: 'Asesor ejemplo' }, isAdvisor: true }) },
    '@/hooks/use-lead-advisors': { useLeadAdvisors: () => ({ advisors: [], error: '' }) },
    '@/lib/dashboard-context': { useDashboardMode: () => ({ globalSelectedAgentId: 'all' }) },
    '@/lib/data-mode': { isMockDataMode: false },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/lib/lead-follow-up': dates.exports,
    '@/lib/everprop-api': { loadEverpropLeads: async () => [], loadEverpropCatalog: async () => ({ properties: [] }), loadEverpropVisits: async () => [], createEverpropVisit: async data => calls.push(data) },
    sonner: { toast: { success: () => {}, error: () => {} } },
    ...overrides,
  };
  const context = { exports: {}, Date, Intl, require: name => deps[name] || components, window: { dispatchEvent: () => {} }, Event: class {}, BroadcastChannel: class { postMessage() {} close() {} } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../src/components/admin/${file}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const render = () => { cursor = 0; return (context.exports.default || context.exports.NewVisitModal)({ open: true, onOpenChange: () => {} }); };
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && predicate(node)) return node;
    for (const child of Array.isArray(node) ? node : [node.props?.children]) { const found = find(child, predicate); if (found) return found; }
  }
  const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  const button = label => find(render(), node => ['Button', 'button'].includes(node.type) && text(node).trim() === label);
  return { render, find, text, button, callbacks, calls, effects };
}

test('EVP-71 sorts activities, preserves overdue status and reviews cancellation before writing', async () => {
  const today = dates.exports.toArgentinaDateTimeInputValue().slice(0, 10);
  const previous = new Date(); previous.setDate(previous.getDate() - 1);
  const yesterday = dates.exports.toArgentinaDateTimeInputValue(previous).slice(0, 10);
  const rows = [
    { id: 'later', leadName: 'Cliente tarde', scheduledAt: `${today}T18:00:00-03:00`, status: 'scheduled' },
    { id: 'early', leadName: 'Cliente temprano', scheduledAt: `${today}T10:00:00-03:00`, status: 'scheduled', propertyTitle: 'Unidad 12A', phone: '123', email: 'cliente@example.test', notes: 'Acceso norte' },
    { id: 'old', leadName: 'Anterior', scheduledAt: `${yesterday}T10:00:00-03:00`, status: 'scheduled' },
  ];
  const calls = [];
  const v = view('CalendarAgenda', { '@/lib/everprop-api': { loadEverpropVisits: async () => rows, cancelEverpropVisit: async id => calls.push(id) } });
  v.render(); await v.callbacks[0]();
  const list = v.find(v.render(), node => node.props?.className === 'agenda-list');
  assert.ok(v.text(list).indexOf('Cliente temprano') < v.text(list).indexOf('Cliente tarde'));
  v.find(list, node => node.type === 'button' && v.text(node) === 'Cancelar cita').props.onClick();
  const review = v.find(v.render(), node => node.type === 'Dialog');
  for (const value of ['Cliente temprano', 'Unidad 12A', '123', 'cliente@example.test', 'Acceso norte', '10:00']) assert.ok(v.text(review).includes(value), value);
  assert.equal(calls.length, 0);
  v.button('Conservar cita').props.onClick();
  assert.equal(v.find(v.render(), node => node.type === 'Dialog').props.open, false);
  v.button('Pendientes').props.onClick();
  assert.ok(v.text(v.render()).includes('Cliente temprano'));
  v.button('Día').props.onClick();
  v.button('Anterior').props.onClick();
  assert.ok(v.text(v.render()).includes('Anterior'));
  const pastList = v.find(v.render(), node => node.props?.className === 'agenda-list');
  assert.ok(v.text(pastList).includes('Programada'));
  assert.ok(v.text(pastList).includes('Anterior'));
  assert.ok(v.find(pastList, node => node.type === 'button' && v.text(node) === 'Cancelar cita'));
});

test('EVP-71 creating a visit reviews all fields, supports editing and blocks duplicate submissions', async () => {
  const v = view('NewVisitModal');
  v.render(); v.effects[0](); await new Promise(resolve => setImmediate(resolve));
  const change = (id, value) => v.find(v.render(), node => node.props?.id === id).props.onChange({ target: { value } });
  change('visit-guest', 'Cliente ejemplo'); change('visit-phone', '3415550100');
  const dateFields = v.find(v.render(), node => node.type === 'DateTimeFields');
  dateFields.props.onValueChange('2099-10-27T10:00');
  const submit = () => v.find(v.render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  await submit();
  assert.equal(v.calls.length, 0);
  const review = v.find(v.render(), node => node.type === 'dl');
  for (const value of ['Cliente ejemplo', '3415550100', 'Sin correo', '10:00', 'Asesor ejemplo']) assert.ok(v.text(review).includes(value), value);
  v.button('Volver a editar').props.onClick();
  assert.equal(v.find(v.render(), node => node.type === 'dl'), undefined);
  await submit();
  await Promise.all([submit(), submit()]);
  assert.equal(v.calls.length, 1);
  assert.equal(v.calls[0].guest_name, 'Cliente ejemplo');
});
