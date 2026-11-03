import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/topbar-scroll.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { nextTopbarState } = context.exports;
const page = { maxScroll: 2000, height: 72 };
const read = (state, y, extra = page) => {
  const next = nextTopbarState(state, { y, ...extra });
  return { hidden: next.hidden, anchor: next.anchor };
};

test('hides when scrolling down and shows when scrolling up', () => {
  const down = read({ hidden: false, anchor: 200 }, 300);
  assert.equal(down.hidden, true);
  assert.equal(read(down, 280).hidden, false);
});

test('small movements do not change the state, but slow scrolling adds up', () => {
  assert.deepEqual(read({ hidden: true, anchor: 500 }, 495), { hidden: true, anchor: 500 });
  assert.equal(read({ hidden: true, anchor: 500 }, 492).hidden, false);
});

test('stays visible near the top and on pages that barely scroll', () => {
  assert.equal(read({ hidden: true, anchor: 200 }, 72).hidden, false);
  assert.equal(read({ hidden: false, anchor: 90 }, 120, { maxScroll: 140, height: 72 }).hidden, false);
});

test('overscroll past either end does not count as a direction change', () => {
  assert.deepEqual(read({ hidden: true, anchor: 2000 }, 2050), { hidden: true, anchor: 2000 });
  assert.equal(read({ hidden: true, anchor: 500 }, -40).hidden, false);
});
