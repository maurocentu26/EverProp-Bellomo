import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function page(hash = '', failure = null) {
  const state = [];
  const calls = [];
  const history = [];
  let cursor = 0;
  const context = {
    exports: {}, URLSearchParams, Error,
    window: { location: { hash }, history: { replaceState: (...args) => history.push(args) } },
    FormData: class { constructor(form) { return new Map(Object.entries(form)); } },
    require(name) {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'react') return {
        useSyncExternalStore: (_, getSnapshot) => getSnapshot(),
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = value; }];
        },
      };
      if (name === 'next/link') return { default: 'a' };
      if (name === '@/lib/everprop-api') return { apiFetch: async (path, init) => {
        calls.push({ path, init });
        if (failure && path !== '/sanctum/csrf-cookie') throw failure;
        return { message: 'Solicitud procesada' };
      } };
      throw Error(`Unexpected dependency ${name}`);
    },
  };
  const source = fs.readFileSync(new URL('../src/app/recuperar/page.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, predicate);
      if (found) return found;
    }
  }
  const render = () => { cursor = 0; return context.exports.default(); };
  const submit = data => find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {}, currentTarget: data });
  return { calls, history, render, find, submit };
}

test('request obtains CSRF, trims email, sends no token, and shows generic acknowledgement', async () => {
  const form = page();
  await form.submit({ email: '  advisor@example.test  ' });
  assert.equal(form.calls[0].path, '/sanctum/csrf-cookie');
  assert.equal(form.calls[1].path, '/api/v1/auth/forgot-password');
  assert.deepEqual(JSON.parse(form.calls[1].init.body), { email: 'advisor@example.test' });
  assert.equal(form.find(form.render(), node => node.props?.role === 'status').props.children, 'Solicitud procesada');
  assert.equal(form.history.length, 0);
});

test('reset confirms password locally and sends fragment token only in the POST body', async () => {
  const token = 'a'.repeat(64);
  const form = page(`#token=${token}&email=advisor%40example.test`);
  await form.submit({ password: 'Replacement123', password_confirmation: 'different' });
  assert.equal(form.calls.length, 0);
  assert.match(form.find(form.render(), node => node.props?.role === 'alert').props.children, /no coinciden/);
  await form.submit({ password: 'Replacement123', password_confirmation: 'Replacement123' });
  assert.equal(form.calls[1].path, '/api/v1/auth/reset-password');
  assert.deepEqual(JSON.parse(form.calls[1].init.body), { password: 'Replacement123', password_confirmation: 'Replacement123', token, email: 'advisor@example.test' });
  assert.deepEqual(form.history[0], [null, '', '/recuperar']);
});

test('API failure stays visible and preserves the form and link for retry', async () => {
  const form = page('#token=abc&email=advisor%40example.test', new Error('El enlace venció'));
  await form.submit({ password: 'Replacement123', password_confirmation: 'Replacement123' });
  assert.equal(form.find(form.render(), node => node.props?.role === 'alert').props.children, 'El enlace venció');
  assert.ok(form.find(form.render(), node => node.type === 'form'));
  assert.equal(form.history.length, 0);
});
