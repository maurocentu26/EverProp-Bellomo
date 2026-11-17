import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// EVP-145: next.config.ts runs as plain module code; `next` is only imported as a type, so nothing is required.
const context = { exports: {}, process: { env: {} }, require: (name) => { throw new Error(`unexpected import ${name}`); } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const rules = await context.exports.default.headers();

/** What Next sends for a path: every matching rule in order, the last value of a key wins. */
function headersFor(path) {
  const sent = {};
  for (const rule of rules) {
    const re = new RegExp(`^${rule.source.replace(/\/:path\*$/, '(/.*)?').replace(/^\/\(\(\?!/, '/((?!')}$`);
    if (re.test(path)) for (const { key, value } of rule.headers) sent[key.toLowerCase()] = value;
  }
  return sent;
}

test('EVP-145: panel, widget and callbacks get HSTS, nosniff and a referrer policy without losing their own rules', () => {
  for (const path of ['/login', '/admin', '/admin/conversaciones', '/widget/abc']) {
    const h = headersFor(path);
    assert.equal(h['strict-transport-security'], 'max-age=31536000; includeSubDomains', path);
    assert.equal(h['x-content-type-options'], 'nosniff', path);
    assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin', path);
  }
  assert.equal(headersFor('/admin')['x-frame-options'], 'DENY');
  assert.equal(headersFor('/admin')['content-security-policy'], "frame-ancestors 'none'");
  // The widget stays embeddable by the allowed sites.
  assert.equal(headersFor('/widget/abc')['x-frame-options'], undefined);
  assert.equal(headersFor('/widget/abc')['content-security-policy'], "frame-ancestors 'self'");
  // Instagram's callback keeps its narrower referrer: the baseline must come before it.
  assert.equal(headersFor('/integrations/instagram/callback')['referrer-policy'], 'origin');
});
