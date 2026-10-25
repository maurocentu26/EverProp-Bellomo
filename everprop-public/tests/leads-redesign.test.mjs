import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('../src/components/admin/NewLeadForm.tsx', import.meta.url), 'utf8');
function formView({ fail = false } = {}) {
  const state = [], calls = [], errors = [];
  let cursor = 0, values = { name: 'Cliente ejemplo', phone: '3415550100', email: '', origin: 'WhatsApp', stage: 'new', priority: 'NORMAL', budget: '1200', currency: 'USD', notes: 'Consultar lote', agentId: 'a1' };
  const jsx = (type, props) => ({ type, props });
  const components = new Proxy({}, { get: (_, key) => key });
  let schema;
  const dependencies = {
    react: { useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; }, useEffect: () => {}, useMemo: fn => fn(), useRef: initial => { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-hook-form': { Controller: 'Controller', useForm: () => ({ control: {}, register: () => ({}), watch: name => values[name], formState: { errors: {} }, handleSubmit: (onValid, onError) => () => { const parsed = schema.safeParse(values); return parsed.success ? onValid(parsed.data) : onError({ phone: { message: 'Contacto inválido' } }); } }) },
    '@hookform/resolvers/zod': { zodResolver: value => { schema = value; } },
    zod: require('zod'),
    'next/navigation': { useRouter: () => ({ push: url => calls.push(['navigate', url]), refresh: () => {} }) },
    'next/link': { default: 'Link' },
    'lucide-react': components,
    sonner: { toast: { success: () => {}, error: message => errors.push(message) } },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { id: 'a1', name: 'Asesor ejemplo' }, isAdvisor: true }) },
    '@/hooks/use-lead-advisors': { useLeadAdvisors: () => ({ advisors: [], error: '' }) },
    '@/lib/data-mode': { isMockDataMode: false },
    '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
    '@/components/admin/LeadTable': { STAGE_LABELS: { new: { label: 'Nuevo' } } },
    '@/lib/lead-interests': { isProjectUnit: () => false },
    '@/lib/everprop-api': { createEverpropLead: async data => { calls.push(['save', data]); if (fail) throw Error('Sin conexión'); return { id: 'created' }; } },
  };
  const context = { exports: {}, console: { error: () => {} }, Date, crypto: { randomUUID: () => "new-lead" }, require: name => dependencies[name] || components };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const render = () => { cursor = 0; return context.exports.NewLeadForm({}); };
  const text = node => node == null ? '' : ['string', 'number'].includes(typeof node) ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && predicate(node)) return node;
    for (const child of Array.isArray(node) ? node : [node.props?.children]) { const result = find(child, predicate); if (result) return result; }
  }
  const submit = () => find(render(), node => node.type === 'form').props.onSubmit();
  const button = label => find(render(), node => node.type === 'Button' && text(node).includes(label));
  return { render, submit, button, text, find, calls, errors, setValues: data => { values = { ...values, ...data }; } };
}

test('EVP-69 validates contact, reviews every value, cancels without writing and confirms the reviewed data', async () => {
  const view = formView();
  view.setValues({ phone: '', email: '' });
  view.submit();
  assert.equal(view.find(view.render(), node => node.type === 'Dialog').props.open, false);
  assert.equal(view.calls.length, 0);
  view.setValues({ phone: '3415550100' });
  view.submit();
  const copy = view.text(view.render());
  for (const expected of ['Cliente ejemplo', '3415550100', 'WhatsApp', 'Nuevo', 'Asesor ejemplo', 'Normal', 'USD', '1.200', 'Consultar lote', 'Sin categoría', 'Sin activo nuevo seleccionado']) assert.ok(copy.includes(expected), expected);
  assert.equal(view.calls.length, 0);
  view.button('Volver a editar').props.onClick();
  assert.equal(view.find(view.render(), node => node.type === 'Dialog').props.open, false);
  view.submit();
  const confirm = view.button('Confirmar y guardar').props.onClick;
  const saving = confirm();
  await confirm();
  assert.equal(view.button('Guardando').props.disabled, true);
  await saving;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.calls.filter(call => call[0] === 'save').length, 1);
  assert.equal(view.calls[0][1].name, 'Cliente ejemplo');
  assert.equal(view.calls[0][1].phone, '3415550100');
});

test('EVP-69 API failure leaves the review and draft available for retry', async () => {
  const view = formView({ fail: true });
  view.submit();
  view.button('Confirmar y guardar').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(view.errors.some(error => error.includes('Sin conexión')));
  assert.equal(view.find(view.render(), node => node.type === 'Dialog').props.open, true);
  assert.equal(view.button('Confirmar y guardar').props.disabled, false);
  assert.ok(view.text(view.render()).includes('Cliente ejemplo'));
  assert.equal(view.calls.some(call => call[0] === 'navigate'), false);
});

const dates = { exports: {}, Intl, Date };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/lead-follow-up.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, dates);
test('EVP-69 dates use the Argentine weekday, day/month and 24-hour time across UTC midnight', () => {
  assert.equal(dates.exports.formatArgentinaDateTime('2026-10-27T13:00:00Z'), 'Martes 27/10, 10:00');
  assert.equal(dates.exports.formatArgentinaDateTime('2026-10-28T01:00:00Z'), 'Martes 27/10, 22:00');
  assert.equal(dates.exports.formatArgentinaDateTime('invalid'), 'Fecha inválida');
});

test('EVP-69 cancelling a visit identifies client, unit, contacts and Argentine date before writing', async () => {
  const state = [], calls = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const components = new Proxy({}, { get: (_, key) => key });
  const dependencies = {
    react: { useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; }, useMemo: fn => fn(), useEffect: () => {}, useRef: () => ({ current: null }) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': components,
    sonner: { toast: { success: () => {}, error: () => {} } },
    '@/lib/utils': { cn: (...args) => args.join(' ') },
    '@/lib/lead-follow-up': dates.exports,
  };
  const context = { exports: {}, Date, require: name => dependencies[name] || components };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/components/admin/VisitManager.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  const visit = { id: 'v1', leadName: 'Cliente ejemplo', scheduledAt: '2026-10-27T13:00:00Z', phone: '3415550100', email: 'cliente@example.test', propertyId: 'p1', notes: 'Consultar medidas', status: 'scheduled' };
  const render = () => { cursor = 0; return context.exports.default({ title: 'Visitas', subtitle: '', visits: [visit], propertyOptions: [{ id: 'p1', title: 'Lote 12' }], onSchedule: () => {}, onDelete: id => calls.push(id) }); };
  const text = node => node == null ? '' : typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
  function find(node, predicate) { if (!node || typeof node !== 'object') return; if (!Array.isArray(node) && predicate(node)) return node; for (const child of Array.isArray(node) ? node : [node.props?.children]) { const found = find(child, predicate); if (found) return found; } }
  const button = label => find(render(), node => node.type === 'Button' && text(node).includes(label));
  button('Cancelar cita').props.onClick();
  assert.equal(calls.length, 0);
  const review = text(find(render(), node => node.type === 'DialogDescription'));
  for (const value of ['Cliente ejemplo', 'Martes 27/10, 10:00', '3415550100', 'cliente@example.test', 'Lote 12', 'Consultar medidas']) assert.ok(review.includes(value), value);
  button('Volver sin cancelar').props.onClick();
  assert.equal(calls.length, 0);
  button('Cancelar cita').props.onClick();
  await button('Sí, cancelar cita').props.onClick();
  assert.deepEqual(calls, ['v1']);
});
