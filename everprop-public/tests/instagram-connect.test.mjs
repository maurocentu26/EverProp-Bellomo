import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const button = (tree, label) => nodes(tree).find(n => n.type === 'button' && text(n) === label);
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function mount(name, { forbidden = false, callback = '', fail = false } = {}) {
  const state = [], refs = [], effects = [], calls = [], locations = [], history = [];
  let cursor = 0, refCursor = 0;
  const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
  class ApiError extends Error { constructor() { super('private provider details'); this.status = 403; } }
  const data = { enabled: true, connections: [{ id: 'synthetic-connection', username: 'synthetic_business', display_name: 'Instagram synthetic_business', status: 'ACTIVE', token_status: 'UNKNOWN', expires_at: null }] };
  const context = { exports: {}, URL, URLSearchParams, AbortSignal, Date, window: {
    location: { search: callback, pathname: '/integrations/instagram/callback', assign: value => locations.push(value) },
    history: { replaceState: (...args) => history.push(args) },
  }, require(module) {
    if (module === 'react') return { useRef(value) { const i = refCursor++; return refs[i] ??= { current: value }; }, useEffect: fn => effects.push(fn), useState(value) { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], value => state[i] = value]; } };
    if (module === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (module === 'next/link') return { default: 'a' };
    if (module === '@/lib/data-mode') return { isMockDataMode: false };
    if (module === './SettingsConfirmation') return { SettingsConfirmation: props => props.open ? jsx('dialog', { children: [props.title, jsx('button', { children: 'Confirmar', onClick: props.onConfirm }), jsx('button', { children: 'Cancelar', onClick: props.onCancel })] }) : null };
    if (module === '@/lib/everprop-api') return { EverpropApiError: ApiError, async apiFetch(path, options) {
      calls.push({ path, options }); if (forbidden || fail) throw new ApiError();
      return { data: path.endsWith('/authorize') ? { authorization_url: 'https://www.instagram.com/oauth/authorize?state=synthetic' } : path.endsWith('/connect') ? data.connections[0] : data };
    } };
    throw new Error(module);
  } };
  const source = fs.readFileSync(new URL(`../src/components/admin/${name}.tsx`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return { calls, locations, history, effects, render() { cursor = 0; refCursor = 0; effects.length = 0; return context.exports[name](); }, async load() { for (const effect of [...effects]) effect(); await settle(); } };
}

test('IG identity is visible and unknown expiry requests reconnection', async () => {
  const p = mount('InstagramConnect'); p.render(); await p.load();
  assert.match(text(p.render()), /@synthetic_business/);
  assert.match(text(p.render()), /Vigencia sin confirmar/);
  assert.doesNotMatch(text(p.render()), /sin vencimiento|private provider/);
});
test('IG connection requires confirmation; cancel never authorizes', async () => {
  const p = mount('InstagramConnect'); p.render(); await p.load();
  button(p.render(), 'Conectar Instagram').props.onClick();
  assert.equal(p.calls.length, 1); button(p.render(), 'Cancelar').props.onClick(); assert.equal(p.calls.length, 1);
  button(p.render(), 'Conectar Instagram').props.onClick(); await button(p.render(), 'Confirmar').props.onClick(); await settle();
  assert.equal(p.calls[1].options.method, 'POST'); assert.equal(p.locations.length, 1);
});
test('IG forbidden config exposes no action or provider details', async () => {
  const p = mount('InstagramConnect', { forbidden: true }); p.render(); await p.load();
  assert.match(text(p.render()), /Solo lectura/); assert.equal(nodes(p.render()).filter(n => n.type === 'button').length, 0);
  assert.doesNotMatch(text(p.render()), /private provider/);
});
test('IG callback removes the code from the address and consumes it only once', async () => {
  const p = mount('InstagramCallback', { callback: '?code=synthetic-code&state=synthetic-state' });
  p.render(); const firstEffect = p.effects[0]; await p.load(); firstEffect(); await settle();
  assert.equal(p.calls.length, 1); assert.equal(JSON.parse(p.calls[0].options.body).code, 'synthetic-code');
  assert.equal(p.history[0][2], '/integrations/instagram/callback');
  assert.match(text(p.render()), /@synthetic_business/); assert.doesNotMatch(text(p.render()), /synthetic-code|synthetic-state/);
});
test('IG callback cancellation and provider failure never report a successful connection', async () => {
  for (const options of [{ callback: '?error=access_denied&state=synthetic-state' }, { callback: '?code=synthetic-code&state=synthetic-state', fail: true }, { callback: '' }]) {
    const p = mount('InstagramCallback', options); p.render(); await p.load();
    assert.doesNotMatch(text(p.render()), /Instagram conectado|private provider details/);
    assert.ok(nodes(p.render()).some(n => n.props?.href === '/admin/settings#instagram'));
  }
});
