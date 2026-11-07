import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function shell(pathname, authenticated = true) {
  const jsx = (type, props) => ({ type, props });
  const deps = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: { useEffect() {} },
    'next/link': { default: 'Link' },
    'next/navigation': { usePathname: () => pathname, useRouter: () => ({}) },
    sonner: { toast: {} }, 'lucide-react': { Loader2: 'Loader', ShieldAlert: 'Shield' },
    '@/lib/auth-context': { useAuth: () => ({ isLoaded: true, currentUser: authenticated ? { id: 'advisor', role: 'ADVISOR', source: 'api' } : null }) },
    '@/lib/data-mode': { isMockDataMode: false },
    '../ui/sidebar': { SidebarProvider: 'SidebarProvider' },
    '@/components/sidebar/Sidebar': { AppSidebar: 'Sidebar' },
    '@/components/admin/AdminNavbar': { AdminNavbar: 'Navbar' },
    '@/components/theme/PanelTextSize': { PanelTextSizeProvider: 'TextProvider' },
  };
  const context = { exports: {}, require: name => deps[name] };
  const source = fs.readFileSync(new URL('../src/components/admin/MainLayout.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText, context);
  const nodes = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    nodes.push(node); walk(node.props?.children);
  }
  walk(context.exports.default({children:'Page content'}));
  return nodes;
}
test('only exact Conversations route removes peripheral chrome, retaining provider and content', () => {
  const nodes = shell('/admin/conversaciones');
  assert.equal(nodes.some(node => ['Sidebar','Navbar'].includes(node.type)), false);
  assert.ok(nodes.some(node => node.type === 'TextProvider'));
  assert.ok(nodes.some(node => node.props?.['data-admin-scroll-container'] === 'true'));
  for (const route of ['/admin','/admin/leads','/admin/conversaciones/other']) {
    const other = shell(route);
    assert.ok(other.some(node => node.type === 'Sidebar'), route);
    assert.ok(other.some(node => node.type === 'Navbar'), route);
  }
});
test('unauthenticated Conversations retains session gate instead of rendering workspace', () => {
  const nodes = shell('/admin/conversaciones',false);
  assert.ok(nodes.some(node => node.props?.role === 'status'));
  assert.equal(nodes.some(node => node.type === 'TextProvider'),false);
});
