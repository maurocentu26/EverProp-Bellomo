import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync(new URL('../src/lib/push-registration.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const scope = { exports: {}, setTimeout, clearTimeout, atob, crypto: globalThis.crypto, TextEncoder, Uint8Array };
vm.runInNewContext(source, scope);
const { registerNotificationWorker, pushBlocker, currentPushState, activatePush, deactivatePush } = scope.exports;
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

// ── Device alerts: "active" only when the server confirms this device ──
const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const env = (over = {}) => ({ secure: true, serviceWorker: true, pushManager: true, notification: true, appleMobile: false, standalone: false, permission: 'default', ...over });
function device({ permission = 'granted', existing = null, server = [], postFails = 0 } = {}) {
  const log = [];
  let local = existing && { endpoint: existing, toJSON: () => ({ endpoint: existing }), unsubscribe: async () => { log.push('unsubscribe'); local = null; return true; } };
  const registered = new Set(server);
  const deps = {
    requestPermission: async () => { log.push('permission'); return permission; },
    registration: async () => { log.push('registration'); return { pushManager: {
      getSubscription: async () => local,
      subscribe: async () => { log.push('subscribe'); local = { endpoint: 'https://push.example/new', toJSON: () => ({ endpoint: 'https://push.example/new' }), unsubscribe: async () => { local = null; return true; } }; return local; },
    } }; },
    config: async () => ({ enabled: true, publicKey: KEY, subscriptionHashes: [...registered] }),
    register: async (json) => { log.push('post'); if (postFails-- > 0) throw new Error('500'); registered.add(`h:${json.endpoint}`); },
    hash: async (endpoint) => `h:${endpoint}`,
  };
  return { deps, log, registered };
}

test('permission granted but nothing registered on the server is NOT active', async () => {
  const { deps } = device({ existing: 'https://push.example/old', server: [] });
  assert.equal(await currentPushState(env({ permission: 'granted' }), deps), 'inactive');
});

test('a local subscription the server does not list is not active; one it lists is', async () => {
  assert.equal(await currentPushState(env({ permission: 'granted' }), device({ existing: 'https://push.example/a', server: ['h:https://push.example/b'] }).deps), 'inactive');
  assert.equal(await currentPushState(env({ permission: 'granted' }), device({ existing: 'https://push.example/a', server: ['h:https://push.example/a'] }).deps), 'active');
});

test('activation asks permission first, subscribes, registers and is active only after the server confirms', async () => {
  const { deps, log } = device();
  const result = await activatePush(deps, KEY);
  assert.equal(result.state, 'active');
  assert.equal(log[0], 'permission');
  assert.equal(log.join(' '), 'permission registration subscribe post');
});

test('a failed POST is an error, never success, and the retry reuses the local subscription', async () => {
  const { deps, log } = device({ postFails: 1 });
  const failed = await activatePush(deps, KEY);
  assert.equal(failed.state, 'error');
  assert.match(failed.message, /Reintentá/);
  const retried = await activatePush(deps, KEY);
  assert.equal(retried.state, 'active');
  assert.equal(log.filter((step) => step === 'subscribe').length, 1);
});

test('a server that accepts the POST but does not list the device is not active', async () => {
  const { deps } = device();
  deps.register = async () => {};
  assert.equal((await activatePush(deps, KEY)).state, 'error');
});

test('denied permission is blocked and nothing is subscribed', async () => {
  const { deps, log } = device({ permission: 'denied' });
  assert.equal((await activatePush(deps, KEY)).state, 'blocked');
  assert.equal(log.join(' '), 'permission');
  assert.equal(pushBlocker(env({ permission: 'denied' })), 'blocked');
});

test('iPhone outside the installed app is asked to install; unsupported browsers say so', () => {
  assert.equal(pushBlocker(env({ appleMobile: true, standalone: false, pushManager: false })), 'install');
  assert.equal(pushBlocker(env({ appleMobile: true, standalone: true })), null);
  assert.equal(pushBlocker(env({ pushManager: false })), 'unsupported');
  assert.equal(pushBlocker(env({ secure: false })), 'unsupported');
});

test('deactivation removes the server registration before the browser subscription', async () => {
  const { deps, log } = device({ existing: 'https://push.example/old', server: ['h:https://push.example/old'] });
  const removed = [];
  await deactivatePush({ registration: deps.registration, unregister: async (endpoint) => { log.push('delete'); removed.push(endpoint); } });
  assert.equal(removed[0], 'https://push.example/old');
  assert.ok(log.indexOf('delete') < log.indexOf('unsubscribe'));
  await deactivatePush({ registration: deps.registration, unregister: async () => { throw new Error('must not be called without a subscription'); } });
});
