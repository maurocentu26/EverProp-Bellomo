import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/statistics-series.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { groupStatisticsSeries } = context.exports;
const series = length => Array.from({ length }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 15 + i)).toISOString().slice(0, 10), leads: i % 9, period_won: i % 3 }));

test('daily and seven-day bins conserve counts, dates, zeros and the final partial interval', () => {
  for (const length of [0, 1, 7, 31, 32, 90, 366]) {
    const input = series(length);
    for (const metric of ['leads', 'period_won']) {
      const { step, bins } = groupStatisticsSeries(input, metric);
      assert.equal(step, length > 31 ? 7 : 1);
      assert.equal(bins.reduce((sum, bin) => sum + bin.value, 0), input.reduce((sum, row) => sum + row[metric], 0));
      assert.equal(bins[0]?.from, input[0]?.date);
      assert.equal(bins.at(-1)?.to, input.at(-1)?.date);
      assert.equal(bins.length, Math.ceil(length / step));
    }
  }
});
