import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dates = { exports: {}, Date };
vm.runInNewContext(compile(source('../src/lib/installment-notifications.ts')), dates);
test('EVP-72 amounts keep unknown currency and es-AR precision', () => {
  const format = dates.exports.formatInstallmentAmount;
  assert.equal(format(1234.5, 'USD'), 'USD 1.234,50');
  assert.equal(format(1234.5, 'ARS'), 'ARS 1.234,50');
  for (const currency of [null, undefined, 'EUR']) assert.equal(format(1234.5, currency), '1.234,50 · Moneda sin confirmar');
});
test('EVP-72 cards, plurals, payment and plan reviews only write on confirmation', async () => {
  const states = []; let cursor = 0, writes = 0, planWrites = 0;
  const installments = [
    { id: 'paid', status: 'PAID', dueDate: '2020-01-01' },
    { id: 'cancelled', status: 'CANCELLED', dueDate: '2020-01-01' },
    { id: 'next', status: 'PENDING', dueDate: '2099-01-01' },
    { id: 'urgent', status: 'OVERDUE', dueDate: '2026-01-01' },
  ].map(row => ({ ...row, agreementId: 'a1', leadId: 'l1', currency: 'USD', amountExpected: 1250, amountPaid: 250, installmentNumber: 4, daysOverdue: 1 }));
  const jsx = (type, props) => ({ type, props });
  const components = new Proxy({}, { get: (_, key) => key });
  const deps = {
    react: { useState: initial => { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = value; }]; }, useMemo: fn => fn(), useEffect: () => {} },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { id: 'u1', name: 'Asesor' }, isAdmin: true }) },
    '@/hooks/use-collections': { useCollections: () => ({ agreements: [{ id: 'a1', publicId: 'A-1', projectName: 'Proyecto', propertyTitle: 'Unidad 3', totalInstallments: 24 }], installments, loading: false, canWrite: true, setInstallments: () => {}, refresh: async () => {} }) },
    '@/hooks/use-collection-action': { useCollectionAction: () => ({ run: fn => fn(), saving: false }) },
    '@/lib/installment-notifications': dates.exports,
    '@/lib/data-mode': { isMockDataMode: false },
    '@/lib/collections-api': { recordInstallmentPayment: async () => { writes++; return installments; }, createAgreementWithInstallments: async () => { planWrites++; return { installments }; } },
    sonner: { toast: { success() {}, error() {} } },
  };
  const context = { exports: {}, Date, require: name => deps[name] || components };
  vm.runInNewContext(compile(source('../src/app/admin/cobranzas/page.tsx')), context);
  const render = () => { cursor = 0; return context.exports.default(); };
  render(); states[0] = [{ id: 'l1', name: 'Cliente prueba con apellido largo', phone: '5491100000000' }];
  // Locate loading state by its initial true value rather than relying on field order.
  for (let i = 0; i < states.length; i++) if (states[i] === true) states[i] = false;
  const nodes = root => !root || typeof root !== 'object' ? [] : Array.isArray(root) ? root.flatMap(nodes) : [root, ...nodes(root.props?.children)];
  const text = root => !root ? '' : typeof root === 'string' || typeof root === 'number' ? String(root) : Array.isArray(root) ? root.map(text).join(' ') : text(root.props?.children);
  const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node).trim() === label);
  let tree = render();
  assert.equal(nodes(tree).filter(node => node.type === 'table').length, 0);
  const cards = nodes(tree).filter(node => node.props?.className === 'collections-installment');
  assert.equal(cards.length, 4);
  for (const value of ['Cliente prueba con apellido largo', '5491100000000', 'Proyecto', 'Unidad 3', 'Cuota 4 de 24', 'Vencimiento:', 'USD 1.250,00', 'WhatsApp', 'Registrar pago', 'Ver cliente']) assert.ok(text(cards.find(card => text(card).includes('Registrar pago'))).replace(/\s+/g, ' ').includes(value), value);
  installments[0].serverManaged = true; installments[0].paidThisMonth = 250;
  tree = render(); assert.match(text(tree).replace(/\s+/g, ' '), /1 cuota con pagos/); assert.match(text(tree).replace(/\s+/g, ' '), /\+ ARS 0,00/);
  installments[1].serverManaged = true; installments[1].paidThisMonth = 50;
  assert.match(text(render()).replace(/\s+/g, ' '), /2 cuotas con pagos/);
  const originalDue = installments[2].dueDate;
  const originalClosedDates = installments.slice(0,2).map(inst => inst.dueDate);
  installments.slice(0,2).forEach(inst => { inst.dueDate = dates.exports.getTodayDateString(); });
  installments[2].dueDate = dates.exports.getTodayDateString();
  const pendingSummary = nodes(render()).find(node => node.type === 'article' && text(node).includes('Por cobrar este mes'));
  assert.match(text(pendingSummary).replace(/\s+/g,' '), /USD 1.000,00/);
  assert.match(text(pendingSummary).replace(/\s+/g,' '), /1 cuota pendiente/);
  installments[2].currency = 'ARS';
  assert.match(text(nodes(render()).find(node => node.type === 'article' && text(node).includes('Por cobrar este mes'))).replace(/\s+/g,' '), /\+ ARS 1.000,00/);
  installments[2].currency = null;
  assert.match(text(nodes(render()).find(node => node.type === 'article' && text(node).includes('Por cobrar este mes'))).replace(/\s+/g,' '), /USD 0,00/);
  installments[2].currency = 'USD'; installments[2].dueDate = originalDue;
  installments.slice(0,2).forEach((inst,index) => { inst.dueDate = originalClosedDates[index]; });
  const priority = nodes(tree).find(node => node.props?.className === 'collections-priority');
  assert.match(text(priority), /Cuota vencida con saldo/); assert.match(text(priority), /USD 1.000,00/);
  button(priority, 'Registrar pago').props.onClick(); tree = render();
  assert.equal(writes, 0);
  nodes(tree).find(node => node.type === 'form' && node.props.className === 'collections-payment-form').props.onSubmit({ preventDefault() {} });
  tree = render(); assert.equal(writes, 0);
  const dialog = nodes(tree).find(node => node.props?.className === 'collections-dialog');
  for (const value of ['Cliente prueba', 'Unidad 3', 'A-1', '4', '24', 'USD 1.000,00', 'Transferencia bancaria', 'S/N', 'Sin notas', 'Asesor']) assert.ok(text(dialog).includes(value), value);
  button(dialog, 'Volver a editar').props.onClick(); tree = render(); assert.equal(writes, 0);
  button(nodes(tree).find(node => node.props?.className === 'collections-dialog'), 'Cancelar').props.onClick();
  tree = render(); assert.equal(writes, 0);
  button(nodes(tree).find(node => node.props?.className === 'collections-priority'), 'Registrar pago').props.onClick();
  tree = render(); nodes(tree).find(node => node.type === 'form' && node.props.className === 'collections-payment-form').props.onSubmit({ preventDefault() {} });
  tree = render(); await button(nodes(tree).find(node => node.props?.className === 'collections-dialog'), 'Confirmar pago').props.onClick();
  assert.equal(writes, 1);
  const stateNames = [...source('../src/app/admin/cobranzas/page.tsx').matchAll(/const \[(\w+),[^\]]+\] = useState/g)].map(match => match[1]);
  const set = (name, value) => { const index = stateNames.indexOf(name); assert.ok(index >= 0, name); states[index] = value; };
  set('fullLead', { id: 'l1', name: 'Cliente prueba', interests: [{ id: 'i1', projectId: 'p1', propertyTitle: 'Unidad 3' }] });
  set('allProjects', [{ id: 'p1', name: 'Proyecto' }]);
  button(render(), 'Nuevo Plan de Cobro').props.onClick();
  set('newAgrStartDate', '2026-12-20'); set('newAgrDueDay', 25);
  set('newAgrTotalPrice', 1000); set('newAgrDownPayment', 0); set('newAgrTotalInstallments', 12); set('monthlyRatePct', 1);
  const form = () => nodes(render()).find(node => node.type === 'form' && node.props.className.includes('collections-plan-form'));
  await form().props.onSubmit({ preventDefault() {} });
  assert.equal(planWrites, 0);
  tree = render();
  let review = nodes(tree).find(node => node.props?.['aria-label'] === 'Confirmar plan de cobro');
  for (const value of ['Cliente prueba', 'Proyecto', 'Unidad 3', 'ARS', 'Cuota 1 de 12', 'ARS 93,34', '25/01/2027']) assert.ok(text(review).replace(/\s+/g, ' ').includes(value), value);
  button(review, 'Volver a editar plan').props.onClick();
  assert.equal(planWrites, 0);
  await form().props.onSubmit({ preventDefault() {} });
  await form().props.onSubmit({ preventDefault() {} });
  assert.equal(planWrites, 1);

});
