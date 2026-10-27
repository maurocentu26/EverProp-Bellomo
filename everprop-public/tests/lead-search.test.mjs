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
const helpers = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'normalizeLeadSearch').map(node => node.getText(tree)).join('\n');
function search(searchQuery, overrides = {}) {
  const context = {
    exports: {}, searchQuery,
    allLeads: [
      { id: 'lucia', name: 'Lucía Méndez', email: undefined, phone: '3885550107', propertyIds: ['p1'], stage: 'new', origin: 'WhatsApp', agentId: 'a1' },
      { id: 'jorge', name: 'Jorge Paz', email: 'jorge@example.com', phone: undefined, propertyIds: [], stage: 'contacted', origin: 'Instagram', agentId: 'a2' },
    ],
    catalogProperties: [{ id: 'p1', title: 'Lote Cañadón' }],
    originFilter: 'all', advisorFilter: 'all', activeStage: 'all', assetType: 'all', followUpFilter: 'all', isAdvisor: false, isMockDataMode: true,
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
