import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name, dependencies = {}) {
  const context = { exports: {}, Date, Intl, require: key => dependencies[key] };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const { commercialDay, commercialQueueItem: item, commercialQueueGroups: groups, hasRecordedContact } = load('commercial-queue', { './lead-follow-up': load('lead-follow-up') });
const now = new Date('2026-09-14T15:00:00Z');
const lead = { id: 'lead-a', companyId: 'tenant-a', stage: 'new' };
const contact = (extra = {}) => ({ id: 'contact', leadId: lead.id, companyId: lead.companyId, type: 'call', occurredAt: '2026-09-13T15:00:00Z', ...extra });

test('business day uses Argentina at the UTC date boundary', () => {
  assert.equal(commercialDay('2026-09-15T01:00:00Z'), '2026-09-14');
  assert.equal(item(lead, [contact({ nextContactAt: '2026-09-15T01:00:00Z' })], now).isDueToday, true);
});
test('strict overdue > today > new ordering, including commitments before ten days', () => {
  const overdue = item(lead, [contact({ nextContactAt: '2026-09-13T18:00:00Z' })], now);
  const today = item(lead, [contact({ nextContactAt: '2026-09-14T18:00:00Z' })], now);
  const fresh = item(lead, [], now);
  assert.equal(overdue.isOverdue, true);
  assert.ok(overdue.priorityWeight > today.priorityWeight);
  assert.ok(today.priorityWeight > fresh.priorityWeight);
});
test('old commitments are superseded and approaching ten days is not due today', () => {
  const old = contact({ occurredAt: '2026-09-05T12:00:00Z', nextContactAt: '2026-09-14T18:00:00Z' });
  assert.equal(item(lead, [old, contact()], now).isDueToday, false);
  assert.equal(item(lead, [contact({ occurredAt: '2026-09-05T12:00:00Z' })], now).isDueToday, false);
});
test('notes and other tenants do not satisfy the contact requirement', () => {
  const records = [contact({ type: 'note' }), contact({ companyId: 'tenant-b' })];
  assert.equal(hasRecordedContact(records, lead), false);
  assert.equal(item(lead, records, now).isNew, true);
  assert.equal(hasRecordedContact([contact()], lead), true);
  assert.equal(item(lead, [contact()], now).isNew, false);
});

test('a creation timestamp does not hide a new lead awaiting first contact', () => {
  assert.equal(item({ ...lead, followUpUpdatedAt: now.toISOString() }, [], now).isNew, true);
});

test('green requires a recorded contact without overdue or today commitments', () => {
  assert.equal(item(lead, [contact()], now).isCurrent, true);
  assert.equal(item(lead, [], now).isCurrent, false);
  assert.equal(item(lead, [contact({ nextContactAt: now.toISOString() })], now).isCurrent, false);
  assert.equal(item(lead, [contact({ nextContactAt: '2026-09-12T12:00:00Z' })], now).isCurrent, false);
});


test('a note or creation timestamp cannot conceal an actual overdue contact', () => {
  const old = contact({ occurredAt: '2026-08-31T15:00:00Z' });
  const note = contact({ id: 'note', type: 'note', occurredAt: now.toISOString() });
  const result = item({ ...lead, followUpUpdatedAt: now.toISOString() }, [old, note], now);
  assert.equal(result.state.kind, 'overdue');
  assert.equal(result.isOverdue, true);
  assert.equal(item({ ...lead, followUpUpdatedAt: now.toISOString() }, [note], now).state.kind, 'none');
});

test('card and detail agree on commitments, and overdue excludes today', () => {
  const expired = item(lead, [contact({ nextContactAt: '2026-09-12T15:00:00Z' })], now);
  assert.equal(expired.state.kind, 'overdue');
  const today = item(lead, [contact({ nextContactAt: now.toISOString() })], now);
  assert.equal(today.state.title, 'Vence hoy');
  const both = item(lead, [contact({ occurredAt: '2026-08-31T15:00:00Z', nextContactAt: now.toISOString() })], now);
  assert.equal(both.isOverdue, true);
  assert.equal(both.isDueToday, false);
});

test('cards and tabs partition the same open lead list without omitting current leads', () => {
  const rows = ['late', 'today', 'new', 'current', 'closed'].map(id => ({ ...lead, id, stage: id === 'closed' ? 'closing' : 'new' }));
  const followups = [
    contact({ leadId: 'late', occurredAt: '2026-08-31T15:00:00Z', nextContactAt: now.toISOString() }),
    contact({ leadId: 'today', nextContactAt: now.toISOString() }),
    contact({ leadId: 'current' }),
    contact({ leadId: 'closed', occurredAt: '2026-08-31T15:00:00Z' }),
  ];
  const g = groups(rows, followups, now);
  assert.equal(g.all.length, 4);
  assert.equal(g.overdue.length, 1);
  assert.equal(g.today.length, 1);
  assert.equal(g.new.length, 1);
  assert.equal(new Set([...g.overdue, ...g.today, ...g.new].map(i => i.lead.id)).size, 3);
  assert.equal(groups(rows, [...followups, contact({ leadId: 'new' })], now).new.length, 0);
});

test('same-time interactions consistently use the latest persisted sequence', () => {
  const before = contact({ id: 'z', sequence: 1, nextContactAt: '2026-09-12T15:00:00Z' });
  const after = contact({ id: 'a', sequence: 2 });
  assert.equal(item(lead, [before, after], now).isOverdue, false);
});

test('won and discarded clients never enter the actionable queue', () => {
  const result = groups([{ ...lead, stage: 'discarded' }, { ...lead, id: 'won', stage: 'closing' }], [contact({ nextContactAt: '2026-09-01T12:00:00Z' })], now);
  assert.equal(result.all.length, 0);
  assert.equal(result.overdue.length, 0);
  assert.equal(result.new.length, 0);
});
