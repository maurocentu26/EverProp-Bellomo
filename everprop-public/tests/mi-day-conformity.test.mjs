import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function load(path, dependencies = {}) {
  const context = { exports: {}, Date, Intl, require: name => dependencies[name] };
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.exports;
}
const followUp = load('src/lib/lead-follow-up.ts');
const { commercialQueueGroups } = load('src/lib/commercial-queue.ts', { './lead-follow-up': followUp });
const now = new Date('2026-10-25T15:00:00Z');
const leads = ['current', 'new', 'today', 'late'].map(id => ({ id, name: id, companyId: 'c1', stage: 'new', propertyIds: [] }));
const records = ['current', 'today', 'late'].map(id => ({ id, leadId: id, companyId: 'c1', type: 'call', occurredAt: '2026-10-24T12:00:00Z', nextContactAt: id === 'late' ? '2026-10-24T12:00:00Z' : id === 'today' ? now.toISOString() : undefined }));
const groups = commercialQueueGroups(leads, records, now);
test('Mi Día orders overdue, today, new and current; traffic counts share the queue', () => {
  assert.deepEqual(Array.from(groups.all, item => item.lead.id), ['late', 'today', 'new', 'current']);
  assert.deepEqual(['overdue', 'today', 'new'].map(key => groups[key].length), [1, 1, 1]);
});
const jsx = (type, props) => ({ type, props });
const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(text).join(' ') : typeof node.type === 'function' ? text(node.type(node.props)) : text(node.props?.children);
const nodes = node => node == null || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : typeof node.type === 'function' ? [node, ...nodes(node.type(node.props))] : [node, ...nodes(node.props?.children)];
function renderCockpit({ rows = leads, contacts = records, properties = [], projects = [], selected = {} } = {}) {
  let index = 0;
  const state = [rows, contacts, properties, projects, { data: [{ lead: rows[0], scheduledAt: now.toISOString() }], meta: { total: 1 } }, false, '', now, true, 'u', '', 'all', selected, null, null, false, rows.length];
  const component = load('src/components/admin/advisor/AdvisorCockpit.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: { useState: () => [state[index++], () => {}], useMemo: fn => fn(), useEffect: () => {} },
    'next/link': { default: 'Link' }, 'lucide-react': {}, sonner: {},
    '@/lib/release-visibility': {}, '@/hooks/use-collections': { useCollections: () => ({ installments: [] }) },
    '@/data/admin-sample': {}, '@/lib/admin-storage': {}, '@/lib/installment-notifications': { getTodayDateString: () => '2026-10-25' }, '@/lib/notifications': {},
    '@/lib/commercial-queue': { commercialDay: () => '2026-10-25', commercialQueueGroups: () => commercialQueueGroups(rows, contacts, now) },
    '@/lib/lead-follow-up': followUp, '@/lib/data-mode': { isMockDataMode: false }, '@/lib/everprop-api': {},
    '@/hooks/use-current-session': { useCurrentSession: () => ({ user: { id: 'u', name: 'Nombre Completo', role: 'ADVISOR' } }) },
    '@/lib/dashboard-context': { useDashboardMode: () => ({ globalSelectedAgentId: 'all' }) }, '@/hooks/use-lead-advisors': { useLeadAdvisors: () => ({ advisors: [] }) },
    '@/components/admin/LeadFollowUpEditor': {}, '@/components/admin/LeadStageUpdateModal': {}, '@/components/admin/advisor/AdminMonthBalanceWidget': {}, '@/components/admin/advisor/AdvisorDayGuide': {},
    '@/lib/advisor-day-guide': { leadInitials: name => name[0] }, '@/components/ui/button': {}, '@/lib/utils': { cn: (...parts) => parts.join(' ') }, '@/lib/inventory-labels': load('src/lib/inventory-labels.ts'),
  });
  return component.default();
}
test('rendered board includes all four follow-up states, exact date, full name and four traffic counts', () => {
  const rendered = renderCockpit();
  const content = text(rendered).replace(/\s+/g, ' ');
  for (const label of ['Vencido', 'Vence hoy', 'Sin contacto previo', 'Al día', 'Bienvenido, Nombre Completo', '24/10', 'Mi agenda']) assert.ok(content.includes(label), label);
  const traffic = nodes(rendered).find(node => node.props?.className === 'day-traffic');
  const cards = nodes(traffic).filter(node => node.type === 'button');
  assert.equal(cards.length, 4);
  for (const card of cards) assert.equal(text(nodes(card).find(node => node.type === 'strong')), '1');
  assert.match(text(cards[3]), /Cita agendada para hoy/);
});
test('QA visual is absent and guide can open only by explicit action', () => {
  for (const path of ['src/components/admin/MainLayout.tsx', 'src/app/login/page.tsx']) assert.doesNotMatch(read(path), /QA visual|Entorno aislado/i);
  const guide = read('src/components/admin/advisor/AdvisorDayGuide.tsx');
  assert.match(guide, /useState\(false\)/);
  assert.equal(guide.match(/setOpen\(true\)/g)?.length, 1);
  assert.doesNotMatch(guide, /claimDayGuide|autoOpened/);
  assert.match(guide, /Empezar a llamar/);
});


test('traffic palette meets AA in both themes and mobile keeps a two by two grid', () => {
  const css = read('src/app/admin-design.css');
  const luminance = hex => {
    const rgb = hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const [background, foreground] of [['ffe4e6','9f1239'],['fef3c7','92400e'],['dbeafe','1e40af'],['d1fae5','065f46'],['4c172b','fecdd3'],['422c15','fde68a'],['172e50','bfdbfe'],['12382c','a7f3d0']]) {
    const values = [luminance(background), luminance(foreground)].sort((a,b) => b-a);
    assert.ok((values[0] + .05) / (values[1] + .05) >= 4.5);
    assert.ok(css.includes(`#${background}`) && css.includes(`#${foreground}`));
  }
  assert.match(css, /@media \(width < 768px\) \{\s*\.day-traffic \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('property labels, pills and WhatsApp add prefixes only when missing', () => {
  const properties = [
    { id: 'p1', projectId: 'project', sectorName: 'Manzana AP8', unitNumber: 'Lote 18', price: 100, currency: 'USD' },
    { id: 'p2', projectId: 'project', sectorName: 'AP9', unitNumber: '19', price: 200, currency: 'USD' },
    { id: 'p3', projectId: 'project', sectorName: 'manzana AP10', unitNumber: 'Departamento 2', propertyType: 'apartment', price: 300, currency: 'USD' },
  ];
  const row = { ...leads[1], phone: '+543755555555', propertyIds: properties.map(p => p.id) };
  for (const [id, label] of [['p1', 'Manzana AP8 · Lote 18'], ['p2', 'Manzana AP9 · Lote 19'], ['p3', 'manzana AP10 · Departamento 2']]) {
    const rendered = renderCockpit({ rows: [row], contacts: [], properties, projects: [{ id: 'project', name: 'Loteo San Pablo 1' }], selected: { new: id } });
    const content = text(rendered);
    assert.doesNotMatch(content, /Manzana Manzana|Lote Lote|Departamento Departamento/i);
    const pill = nodes(rendered).find(node => node.type === 'button' && node.props['aria-pressed'] === true && text(node).includes('San Pablo'));
    // Parts render as separate unbreakable chunks; CSS draws the "·" between them.
    assert.equal(text(pill), ['Loteo San Pablo 1', ...label.split(' · ')].join(' '));
    const whatsapp = nodes(rendered).find(node => node.type === 'a' && node.props.href?.startsWith('https://wa.me/'));
    const message = new URL(whatsapp.props.href).searchParams.get('text');
    assert.ok(message.includes(`Loteo San Pablo 1 · ${label}`));
    assert.doesNotMatch(message, /Manzana Manzana|Lote Lote/i);
  }
});

test('card states equal traffic counts even when contacted clients have no follow-up history', () => {
  const rows = [...leads,
    { ...leads[0], id: 'contacted-unknown', stage: 'contacted' },
    { ...leads[0], id: 'contacted-activity', stage: 'contacted', lastActivity: '2026-10-23T12:00:00Z' },
    { ...leads[0], id: 'contacted-date', stage: 'contacted', lastContactAt: '2026-10-22T12:00:00Z' },
  ];
  const rendered = renderCockpit({ rows });
  const result = nodes(rendered).find(node => node.props?.id === 'commercial-lead-results');
  const cards = nodes(result).filter(node => node.type === 'article');
  const count = label => cards.filter(card => nodes(card).some(node => node.type === 'span' && text(node) === label)).length;
  const traffic = nodes(rendered).find(node => node.props?.className === 'day-traffic');
  const counts = nodes(traffic).filter(node => node.type === 'strong').map(node => Number(text(node)));
  assert.deepEqual([count('Vencido'), count('Vence hoy'), count('Sin contacto previo')], counts.slice(0, 3));
  assert.equal(count('Al día'), cards.length - counts.slice(0, 3).reduce((sum, value) => sum + value, 0));
  const cardFor = id => cards.find(card => nodes(card).some(node => node.props?.href === `/admin/leads/${id}`));
  assert.match(text(cardFor('new')), /Todavía no hay contactos registrados/);
  assert.doesNotMatch(text(cardFor('contacted-unknown')), /Último contacto|Todavía no hay contactos/);
  assert.match(text(cardFor('contacted-activity')), /Último contacto:.*23\/10/);
  assert.match(text(cardFor('contacted-date')), /Último contacto:.*22\/10/);
});
