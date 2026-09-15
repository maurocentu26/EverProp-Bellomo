import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/push-registration.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const scope = { exports: {}, setTimeout, clearTimeout };
vm.runInNewContext(source, scope);
const { registerNotificationWorker } = scope.exports;
test('worker registration timeout allows the UI to recover', async () => {
  await assert.rejects(registerNotificationWorker({ register: () => new Promise(() => {}), ready: Promise.resolve({}) }, 5), /Volvé a intentarlo/);
});
test('worker activation timeout allows the UI to recover', async () => {
  await assert.rejects(registerNotificationWorker({ register: async () => ({}), ready: new Promise(() => {}) }, 5), /Volvé a intentarlo/);
});
test('ready worker is returned and browser errors are propagated', async () => {
  const registration = {};
  assert.equal(await registerNotificationWorker({ register: async () => registration, ready: Promise.resolve(registration) }), registration);
  await assert.rejects(registerNotificationWorker({ register: async () => { throw Error('Registration denied'); }, ready: Promise.resolve({}) }), /Registration denied/);
});
