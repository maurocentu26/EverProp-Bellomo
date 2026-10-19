import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

test('password is hidden initially and toggles without changing its value or submitting', () => {
  const state = [];
  let cursor = 0;
  let submissions = 0;
  const context = {
    exports: {}, process: { env: { NODE_ENV: 'production' } },
    require(name) {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'react') return {
        useEffect() {},
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
      };
      if (name === 'next/navigation') return { useRouter: () => ({}) };
      if (name === 'next/link') return { default: 'a' };
      if (name === '@/lib/auth-context') return { useAuth: () => ({ isLoaded: true, currentUser: null, login: () => { submissions++; } }) };
      if (name === '@/lib/data-mode') return { isMockDataMode: false };
      if (name === '@/data/auth-sample') return { MOCK_USERS: [] };
      if (name === '@/lib/utils') return { cn: () => '' };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => String(key) });
      throw Error(`Unexpected dependency ${name}`);
    },
  };
  const source = fs.readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function render() { cursor = 0; return context.exports.default(); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const result = find(child, predicate);
      if (result) return result;
    }
  }
  const input = tree => find(tree, node => node.props?.id === 'login-password');
  const toggle = tree => find(tree, node => node.props?.['aria-controls'] === 'login-password');
  let tree = render();
  assert.equal(input(tree).props.type, 'password');
  input(tree).props.onChange({ target: { value: 'test-only-password' } });
  for (const [type, label, pressed] of [['text', 'Ocultar contraseña', true], ['password', 'Mostrar contraseña', false]]) {
    assert.equal(toggle(tree).props.type, 'button');
    toggle(tree).props.onClick();
    tree = render();
    assert.equal(input(tree).props.type, type);
    assert.equal(input(tree).props.value, 'test-only-password');
    assert.equal(toggle(tree).props['aria-label'], label);
    assert.equal(toggle(tree).props['aria-pressed'], pressed);
  }
  assert.equal(submissions, 0);
});
