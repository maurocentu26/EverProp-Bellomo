import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/text-size-preference.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { createTextSizePreferences, textSizeKey } = context.exports;
test('preferences persist independently for each user and reset to actual', () => {
  const values = new Map();
  const storage = () => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  const preferences = createTextSizePreferences(storage);
  assert.equal(preferences.read('a'), 'actual');
  assert.equal(preferences.write('a', 'grande'), true);
  assert.equal(preferences.read('b'), 'actual');
  assert.equal(createTextSizePreferences(storage).read('a'), 'grande');
  preferences.write('a', 'actual');
  assert.equal(preferences.read('a'), 'actual');
  values.set(textSizeKey('b'), 'invalid');
  assert.equal(preferences.read('b'), 'actual');
});
test('blocked storage keeps the chosen size for the session without leaking users', () => {
  const preferences = createTextSizePreferences(() => { throw Error('blocked'); });
  assert.equal(preferences.read('a'), 'actual');
  assert.equal(preferences.write('a', 'grande'), false);
  assert.equal(preferences.read('a'), 'grande');
  assert.equal(preferences.read('b'), 'actual');
  preferences.clearTemporary('a');
  assert.equal(preferences.read('a'), 'actual');
});
