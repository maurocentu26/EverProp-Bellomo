import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {}, Intl, Date, Math };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/notification-tray.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { isForMe, notificationKind, urgencyLabel, dayGroup, timeLabel, groupByDay } = context.exports;

// 11:20 in Buenos Aires (UTC-3).
const now = new Date('2026-11-10T14:20:00Z');

test('EVP-119: "Para mí" keeps directed events and unknown types, and leaves team and system events in "Todas"', () => {
  for (const type of ['LEAD_CREATED', 'LEAD_REASSIGNED', 'FOLLOW_UP_WARNING', 'REENGAGE', 'CONVERSATION_NEEDS_ATTENTION', 'installment_overdue', 'SOMETHING_NEW']) assert.equal(isForMe(type), true, type);
  for (const type of ['LEAD_CREATED_UNASSIGNED', 'PUBLIC_LEAD_RECEIVED', 'FOLLOW_UP_TEAM', 'INTEGRATION_REVOKED', 'INFO', null, '']) assert.equal(isForMe(type), false, String(type));
});

test('EVP-119: kind and urgency come from the event type, case-insensitively', () => {
  assert.equal(notificationKind('CONVERSATION_REOPENED'), 'conv');
  assert.equal(notificationKind('installment_due_today'), 'pay');
  assert.equal(notificationKind('VISIT_REQUESTED'), 'visit');
  assert.equal(notificationKind('REENGAGE'), 'lead');
  assert.equal(notificationKind(undefined), 'sys');
  assert.equal(urgencyLabel('installment_overdue'), 'Vencida');
  assert.equal(urgencyLabel('CONVERSATION_NEEDS_ATTENTION'), 'Sin responder');
  assert.equal(urgencyLabel('LEAD_CREATED'), null);
});

test('EVP-119: days and times use Buenos Aires, relative only within the first hour', () => {
  assert.equal(dayGroup('2026-11-10T03:30:00Z', now), 'Hoy'); // 00:30 local
  assert.equal(dayGroup('2026-11-10T02:30:00Z', now), 'Ayer'); // 23:30 local the day before
  assert.equal(dayGroup('2026-11-08T15:00:00Z', now), 'Anteriores');
  assert.equal(timeLabel('2026-11-10T14:19:40Z', now), 'Recién');
  assert.equal(timeLabel('2026-11-10T14:02:00Z', now), 'hace 18 min');
  assert.equal(timeLabel('2026-11-10T11:00:00Z', now), '08:00');
  assert.equal(timeLabel('2026-11-09T21:05:00Z', now), 'ayer, 18:05');
  assert.match(timeLabel('2026-11-07T16:05:00Z', now), /^7 nov\.?, 13:05$/);
});

test('EVP-119: groups keep their order, skip empty days and list newest first across offsets', () => {
  const groups = groupByDay([{ timestamp: '2026-11-10T09:00:00-03:00' }, { timestamp: '2026-11-01T13:00:00Z' }, { timestamp: '2026-11-10T13:00:00Z' }], now);
  assert.deepEqual(Array.from(groups, (group) => group.label), ['Hoy', 'Anteriores']);
  assert.deepEqual(Array.from(groups[0].items, (item) => item.timestamp), ['2026-11-10T13:00:00Z', '2026-11-10T09:00:00-03:00']);
});
