import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/app/admin/leads/page.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let filter;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'filteredLeads') filter = node.initializer.arguments[0].getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(filter, 'Use the actual list filtering callback');
const helperNames = new Set(['normalizeLeadSearch', 'getLeadCreatedTimestamp', 'compareLeadCreatedAt']);
const helpers = tree.statements.filter(node => ts.isFunctionDeclaration(node) && helperNames.has(node.name?.text)).map(node => node.getText(tree)).join('\n');
function search(searchQuery, overrides = {}) {
  const context = {
    exports: {}, searchQuery,
    allLeads: [
      { id: 'lucia', name: 'Lucía Méndez', email: undefined, phone: '3885550107', propertyIds: ['p1'], stage: 'new', origin: 'WhatsApp', agentId: 'a1' },
      { id: 'jorge', name: 'Jorge Paz', email: 'jorge@example.com', phone: undefined, propertyIds: [], stage: 'contacted', origin: 'Instagram', agentId: 'a2' },
    ],
    catalogProperties: [{ id: 'p1', title: 'Lote Cañadón' }],
    originFilter: 'all', advisorFilter: 'all', activeStage: 'all', assetType: 'all', followUpFilter: 'all', followUps: [], sortOrder: 'newest', isAdvisor: false, isMockDataMode: true,
    getLeadFollowUpState: () => ({ kind: 'none' }),
    ...overrides,
  };
  vm.runInNewContext(ts.transpileModule(`${helpers}\nexports.result = (${filter})();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return Array.from(context.exports.result, lead => lead.id);
}

test('EVP-69 list search accepts names and property titles without accents', () => {
  for (const query of ['lucia', '  LUCÍA  ', 'me\u0301ndez', 'mendez', 'canadon', 'CAÑADÓN']) assert.deepEqual(search(query), ['lucia'], query);
});

test('EVP-69 search retains phone, email, empty and combined filter behavior', () => {
  assert.deepEqual(search('5550107'), ['lucia']);
  assert.deepEqual(search('JORGE@EXAMPLE.COM'), ['jorge']);
  assert.deepEqual(search('   '), ['lucia', 'jorge']);
  assert.deepEqual(search('inexistente'), []);
  assert.deepEqual(search('lucia', { originFilter: 'Instagram' }), []);
  assert.deepEqual(search('lucia', { advisorFilter: 'a2' }), []);
  assert.deepEqual(search('lucia', { activeStage: 'contacted' }), []);
  assert.deepEqual(search('lucia', { isAdvisor: true, user: { id: 'a2' } }), []);
  assert.deepEqual(search('', { isAdvisor: true, user: { id: 'a2' } }), ['jorge']);
});

test('lead list defaults to newest first and supports oldest, follow-up priority, fallback dates, and accessible sort controls', () => {
  const leadsWithDates = [
    { id: 'old', name: 'Viejo', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'mid-activity', name: 'Intermedio', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', lastActivity: '2026-10-15T10:00:00Z' },
    { id: 'nodate', name: 'Sin fecha', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', lastActivity: 'fecha-invalida' },
    { id: 'new', name: 'Nuevo', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-11-10T10:00:00Z' },
  ];

  // Default newest first for admin and advisor, keeping missing/invalid dates last.
  assert.deepEqual(search('', { allLeads: leadsWithDates, isAdvisor: false }), ['new', 'mid-activity', 'old', 'nodate']);
  assert.deepEqual(search('', { allLeads: leadsWithDates, isAdvisor: true, user: { id: 'a1' } }), ['new', 'mid-activity', 'old', 'nodate']);

  // Oldest first also keeps missing/invalid dates at the end.
  assert.deepEqual(search('', { allLeads: leadsWithDates, sortOrder: 'oldest' }), ['old', 'mid-activity', 'new', 'nodate']);

  // Priority sorts overdue -> dueSoon -> none -> current and breaks ties by newest createdAt first.
  const priorityLeads = [
    { id: 'cur', name: 'Al día', propertyIds: [], stage: 'contacted', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-11-19T10:00:00Z' },
    { id: 'none', name: 'Sin seg', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-11-18T10:00:00Z' },
    { id: 'over-old', name: 'Vencido viejo', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'due', name: 'Por vencer', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-11-15T10:00:00Z' },
    { id: 'over-new', name: 'Vencido nuevo', propertyIds: [], stage: 'new', origin: 'WhatsApp', agentId: 'a1', createdAt: '2026-11-12T10:00:00Z' },
  ];
  const stateById = {
    cur: 'current',
    none: 'none',
    'over-old': 'overdue',
    due: 'dueSoon',
    'over-new': 'overdue',
  };
  assert.deepEqual(
    search('', {
      allLeads: priorityLeads,
      sortOrder: 'priority',
      getLeadFollowUpState: (_followUps, id) => ({ kind: stateById[id] || 'none' }),
    }),
    ['over-new', 'over-old', 'due', 'none', 'cur'],
  );

  assert.ok(source.includes('aria-label="Ordenar clientes"'));
  assert.ok(source.includes('role="status"'));
});
