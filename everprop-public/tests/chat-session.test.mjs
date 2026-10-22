import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {}, JSON, Date, Boolean };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/chat-session.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { chatStorageKey, pickStore, loadToken, saveToken, dropToken } = context.exports;

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const blocked = () => { throw new Error('SecurityError'); };
const throwing = () => ({ getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() {} });
const key = chatStorageKey('widget-a');
const load = (...args) => ({ ...loadToken(...args) }); // plain object across the vm boundary

test('EVP-20: a saved session survives closing the tab and, past the server expiry, reports it ran out', () => {
  const store = memory();
  saveToken(store, key, 'tok-1', 1_000);
  assert.deepEqual(load(store, key, 999), { token: 'tok-1', expired: false });
  assert.deepEqual(load(store, key, 1_000), { token: null, expired: true }, 'the widget shows "venció", not the welcome');
  assert.equal(store.getItem(key), null, 'an expired token is removed, never reused');
  assert.deepEqual(load(store, key, 1_000), { token: null, expired: false }, 'said once; afterwards nothing is saved');
});

test('EVP-20: each widget keeps its own session; a failed token never erases a newer one from another tab', () => {
  const store = memory();
  saveToken(store, key, 'tok-a', 5_000);
  assert.deepEqual(load(store, chatStorageKey('widget-b'), 1), { token: null, expired: false });
  saveToken(store, key, 'tok-new', 5_000); // another tab started over
  dropToken(store, key, 'tok-a');
  assert.equal(load(store, key, 1).token, 'tok-new');
  dropToken(store, key, 'tok-new');
  assert.equal(load(store, key, 1).token, null);
});

test('EVP-20: blocked storage falls back, and with none the chat says it cannot keep the conversation', () => {
  const session = memory();
  assert.equal(pickStore([blocked, () => session]), session);
  assert.equal(pickStore([blocked, throwing]), null);
  assert.deepEqual(load(null, key, 1), { token: null, expired: false });
  saveToken(null, key, 'tok', 5); // no-op, no throw
});

test('EVP-20: a corrupt value is discarded and the old bare sessionStorage token is migrated once', () => {
  const store = memory();
  store.setItem(key, '{not json');
  assert.deepEqual(load(store, key, 1), { token: null, expired: false });
  assert.equal(store.getItem(key), null);

  const legacy = memory();
  legacy.setItem(key, 'old-bare-token');
  assert.equal(load(store, key, 1_000, legacy).token, 'old-bare-token');
  assert.equal(legacy.getItem(key), null, 'moved, not copied');
  assert.equal(JSON.parse(store.getItem(key)).expiresAt, 1_000 + 24 * 60 * 60 * 1000, 'capped at the server TTL');

  // localStorage blocked: sessionStorage is both the store and the legacy place; the bare token is kept, not erased.
  const only = memory();
  only.setItem(key, 'old-bare-token');
  assert.equal(load(only, key, 1_000, only).token, 'old-bare-token');
  assert.equal(JSON.parse(only.getItem(key)).token, 'old-bare-token');
});
