import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {}, Intl, Date, Math, Number };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/lead-follow-up.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { getLeadFollowUpState, needsFollowUp } = context.exports;

const now = new Date('2026-10-20T15:00:00Z');
const contact = (days) => [{ id: 'f', leadId: 'L', type: 'call', occurredAt: new Date(now.getTime() - days * 86400000 - 60000).toISOString() }];

test('EVP-50: leads need follow-up from day 2, matching the push alerts', () => {
  const at = (days) => getLeadFollowUpState(contact(days), 'L', undefined, now);
  assert.equal(at(1).title, 'Al día');
  assert.equal(needsFollowUp(at(1)), false);
  assert.equal(at(2).title, 'Necesita contacto');
  assert.equal(needsFollowUp(at(2)), true);
  assert.equal(at(5).title, 'Enfriándose');
  assert.equal(at(8).kind, 'dueSoon');
  assert.equal(at(11).kind, 'overdue');
  assert.equal(needsFollowUp(getLeadFollowUpState([], 'L', undefined, now)), true);
});
