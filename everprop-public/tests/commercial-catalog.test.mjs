import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const labels = { exports: {} };
vm.runInNewContext(compile('../src/lib/inventory-labels.ts'), labels);
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree !== 'object' ? String(tree)
  : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);

async function screen(rows, { advisor = false, error = false } = {}) {
  const state = [], effects = [], routes = [];
  let cursor = 0;
  const components = new Proxy({}, { get: (_, name) => name });
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, require(name) {
    if (name === 'react') return {
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
      useEffect(effect) { effects.push(effect); },
    };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'next/navigation') return { useRouter: () => ({ push: route => routes.push(route) }) };
    if (name === 'next/link') return { default: 'Link' };
    if (name === '@/lib/data-mode') return { isMockDataMode: !error };
    if (name === '@/lib/admin-storage') return { loadPropertyList: () => rows };
    if (name === '@/lib/everprop-api') return { loadEverpropCatalog: async () => { throw Error('Unavailable'); } };
    if (name === '@/hooks/use-current-session') return { useCurrentSession: () => ({ isAdvisor: advisor }) };
    if (name === '@/lib/inventory-labels') return labels.exports;
    if (name === '@/lib/utils') return { cn: (...classes) => classes.join(' ') };
    return components;
  } };
  vm.runInNewContext(compile('../src/app/admin/comercial/page.tsx'), context);
  const render = () => { cursor = 0; return context.exports.default(); };
  render(); effects[0](); await new Promise(setImmediate);
  return { tree: render(), routes };
}

test('EVP-73 commercial rows retain every label, live price, status and keyboard link', async () => {
  const { tree, routes } = await screen([
    { id: 'local', propertyType: 'Local', unitNumber: '12A', status: 'sold', price: 1, currency: 'USD', inventoryPrice: 42000, inventoryCurrency: 'ARS' },
    { id: 'garage', propertyType: 'Cochera', unitNumber: '12B', price: 1, currency: 'USD', inventoryCurrency: null },
  ]);
  const cells = nodes(tree).filter(n => n.type === 'td');
  assert.deepEqual(cells.map(n => n.props['data-label']), [
    'ID / Ubicación', 'Dimensiones', 'Renta mensual', 'Características', 'Estado',
    'Unidad', 'Nivel / Sector', 'Valor mensual', 'Tipo', 'Estado',
  ]);
  assert.ok(text(tree).includes('ARS 42.000'));
  assert.ok(text(tree).includes('Precio a confirmar'));
  assert.equal(text(cells[4]), 'Vendido');
  assert.equal(text(cells[9]), 'Sin estado informado');
  for (const id of ['local', 'garage']) assert.ok(nodes(tree).some(n => n.type === 'Link' && n.props.href === `/admin/properties/${id}` && text(n).startsWith('Ver ')));
  nodes(tree).find(n => n.type === 'tr' && n.props.onClick).props.onClick();
  assert.deepEqual(routes, ['/admin/properties/local']);
});

test('EVP-73 empty catalog has two standalone empty states and preserves advisor permissions', async () => {
  const { tree } = await screen([], { advisor: true });
  assert.equal(nodes(tree).filter(n => n.type === 'table').length, 0);
  assert.deepEqual(nodes(tree).filter(n => n.props?.role === 'status').map(text), ['No hay locales registrados.', 'No hay cocheras registradas.']);
  assert.equal(nodes(tree).filter(n => n.type === 'Button').length, 0);
  const admin = await screen([]);
  assert.equal(nodes(admin.tree).filter(n => n.type === 'Button').length, 4);
  const failed = await screen([], { error: true });
  assert.equal(failed.tree.props.role, 'alert');
  assert.ok(text(failed.tree).includes('No se pudo cargar el catálogo'));
});
