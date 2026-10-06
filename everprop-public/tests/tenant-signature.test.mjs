import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const load = (file, modules = {}) => {
  const context = { exports: {}, TextEncoder, Uint8Array, Headers, globalThis: { crypto: globalThis.crypto }, Math, Date, String, Array, Object, process,
    require: (name) => modules[name] ?? require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
};
const sig = load('../src/lib/tenant-signature.ts');
const { proxy } = load('../src/proxy.ts', { '@/lib/tenant-signature': sig });
const { NextRequest } = require('next/server');

const VECTOR = 'e7caf0c4a65532e66a13ebab806916dd9919b60c9459c4897570ce2aadb7bece';

test('the signature matches the API implementation (same vector as PanelSignedHostTest)', async () => {
  assert.equal(await sig.signPanelHost('hierros.panel.test', 1791200000, 'test-panel-key'), VECTOR);
});

test('the host comes from the Host header, without port, and only plain domains pass', () => {
  assert.equal(sig.hostFromHeader('Hierros.Panel.Test:443'), 'hierros.panel.test');
  assert.equal(sig.hostFromHeader('[::1]:3000'), null);
  assert.equal(sig.hostFromHeader('evil.test\nx'), null);
  assert.equal(sig.hostFromHeader(null), null);
});

// next start builds request.nextUrl from the server's own hostname (localhost): the proxy must sign the Host header.
const call = async (hostHeader, extra = {}) => {
  const request = new NextRequest('http://localhost:3000/api/v1/auth/me', { headers: { host: hostHeader, ...extra } });
  const response = await proxy(request);
  const forwarded = Object.fromEntries([...response.headers].filter(([name]) => name.startsWith('x-middleware-request-x-eversys')));
  return { status: response.status, forwarded };
};

test('the proxy signs the domain the user is on, not the server hostname', async () => {
  process.env.TENANT_PANEL_SIGNING_KEY = 'test-panel-key';
  try {
    const { status, forwarded } = await call('hierros.panel.test');
    assert.equal(status, 200);
    assert.equal(forwarded['x-middleware-request-x-eversys-panel-host'], 'hierros.panel.test');
    assert.match(forwarded['x-middleware-request-x-eversys-panel-signature'], /^[0-9a-f]{64}$/);
  } finally { delete process.env.TENANT_PANEL_SIGNING_KEY; }
});

test('browser-sent channel headers are dropped, and a bad Host is refused when the channel is on', async () => {
  const forged = { 'x-eversys-panel-host': 'other.test', 'x-eversys-panel-timestamp': '1', 'x-eversys-panel-signature': 'f'.repeat(64) };
  const off = await call('hierros.panel.test', forged);
  assert.deepEqual(off.forwarded, {}, 'without key nothing is forwarded, forged values included');
  process.env.TENANT_PANEL_SIGNING_KEY = 'test-panel-key';
  try {
    const on = await call('hierros.panel.test', forged);
    assert.equal(on.forwarded['x-middleware-request-x-eversys-panel-host'], 'hierros.panel.test');
    assert.equal((await call('[::1]')).status, 404);
  } finally { delete process.env.TENANT_PANEL_SIGNING_KEY; }
});
