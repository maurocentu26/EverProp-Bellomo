import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = path => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const labels = { exports: {} }; vm.runInNewContext(compile('../src/lib/inventory-labels.ts'), labels);
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const properties = ['12','12A','12B','14','15','16','17'].map((code,index) => ({ id:code,unitNumber:code,title:`Unidad ${code}`,sectorName:'Manzana B',status:['available','reserved','sold','rented','not_sellable','not_marketed',undefined][index],inventoryPrice:null,inventoryCurrency:null }));
function matrix() {
  const state = [null, '']; let cursor = 0;
  const context = { exports:{}, require(name) {
    if (name === 'react') return { useId:()=> 'sector', useState(value) { const i=cursor++; if (!(i in state)) state[i]=value; return [state[i],v=>{state[i]=v;}]; } };
    if (name === 'react/jsx-runtime') return { jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props}) };
    if (name === '@/lib/inventory-labels') return labels.exports;
    if (name === 'lucide-react') return new Proxy({}, {get:(_,key)=>key});
    if (name === 'next/link') return {default:'Link'};
    return new Proxy({}, {get:(_,key)=>key});
  }};
  vm.runInNewContext(compile('../src/components/admin/InventoryMatrix.tsx'),context);
  return (props={properties})=>{cursor=0; return context.exports.default(props);};
}
test('EVP-75 exact codes, accessible native buttons, complete legend and singular counts',()=>{
  const render=matrix(),tree=render(),all=nodes(tree);
  for(const code of ['12','12A','12B']) {
    const cell=all.find(n=>n.type==='button' && n.props['aria-label']?.startsWith(`${code} ·`));
    assert.ok(cell); assert.equal(cell.props.type,'button'); assert.match(cell.props['aria-label'],/Manzana B.*Precio a consultar/);
    assert.equal(text(cell.props.children[0]),code);
  }
  for(const label of ['Disponible','Reservado','Vendido','Alquilado','No vendible','No comercializado','Sin estado informado','1 reservada','1 vendida','1 disponible']) assert.ok(text(tree).includes(label),label);
  all.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('12A ·')).props.onClick();
  const sheet=render(); assert.ok(text(sheet).includes('12A')); assert.ok(text(sheet).includes('Precio a consultar')); assert.ok(text(sheet).includes('Frente sin informar')); assert.ok(text(sheet).includes('Sin servicios informados'));
  assert.equal(nodes(sheet).find(n=>n.type==='Link').props.href,'/admin/properties/12A');
  assert.equal((text(sheet).match(/Atrás/g)||[]).length,1);
  assert.doesNotMatch(text(sheet),/Manzana Manzana|Datos de muestra|QA/);
});
test('EVP-75 sector filter, plural counts, missing sector and supplied details',()=>{
 const render=matrix(); let tree=render({properties:[...properties, {...properties[0],id:'extra'}, {...properties[0],id:'no-sector',sectorName:undefined}]});
 assert.match(text(tree),/2 disponibles/);
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'Sin manzana informada'}});
 tree=render({properties:[...properties,{...properties[0],id:'no-sector',sectorName:undefined}]});
 assert.equal(nodes(tree).filter(n=>n.type==='button'&&n.props['aria-label']).length,1);
 const detailed=matrix(); tree=detailed({properties:[{...properties[0],area_m2:300,commercialFeatures:{land:{frente_m:12,fondo_m:25,ochava_m2:4}},services:{water:true,internet:true}}]});
 nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']).props.onClick();
 tree=detailed({properties:[]});
 for(const label of ['300 m²','Frente: 12 m','Fondo: 25 m','Ochava: 4 m²','Agua potable · Internet'])assert.ok(text(tree).includes(label),label);
});
test('EVP-75 existing routes, loading, error and responsive containment',()=>{
 const page=read('../src/app/admin/inventory-matrix/page.tsx'),css=read('../src/app/admin-design.css');
 assert.match(page,/isReady && !isAdvisor/); assert.match(page,/confirmBeforeSave/); assert.match(page,/if \(!isMockDataMode\)/); assert.doesNotMatch(page,/rendimiento|window.confirm|Datos de muestra/);
 assert.match(css,/\.lots-scroll \{[^}]*overflow-x: auto/); assert.match(css,/min-height: 72px; min-width: 44px/); assert.match(css,/\.lots-sheet\[data-slot="sheet-content"\] \{ inset: 0; width: 100%; max-width: none/);
 assert.match(text(matrix()({properties:[],isLoading:true})),/Cargando lotes/);
 assert.match(text(matrix()({properties:[]})),/No hay unidades/);
});

test('EVP-75 initial selection skips empty projects and respects project URL in API and mock', async()=>{
  for (const mock of [false,true]) for (const query of ['', '?project=empty', '?projectId=third']) {
    const state=[],effects=[],calls=[];let cursor=0;
    const projects=[{id:'empty'},{id:'second'},{id:'third'}];
    const context={exports:{},window:{location:{search:query}},URLSearchParams,require(name){
      if(name==='react') return {useState(value){const i=cursor++;state[i]=value;return [value,v=>{state[i]=v;}];},useEffect(fn){effects.push(fn);}};
      if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
      if(name==='@/lib/data-mode')return {isMockDataMode:mock};
      if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({isAdvisor:true,isReady:true})};
      if(name==='@/lib/everprop-api')return {loadEverpropProjects:async()=>projects,loadEverpropPropertiesByProject:async id=>{calls.push(id);return id==='second'?[{projectId:id}]:[];}};
      if(name==='@/lib/admin-storage')return {loadProjectList:()=>projects,loadPropertyList:()=>[{projectId:'second'}]};
      return new Proxy({}, {get:(_,key)=>key});
    }};
    vm.runInNewContext(compile('../src/app/admin/inventory-matrix/page.tsx'),context);
    context.exports.default();effects[0]();
    for(let i=0;i<10;i++)await Promise.resolve();
    assert.equal(state[6],query.includes('third')?'third':query?'empty':'second');
    assert.equal(state[3],true);
    assert.deepEqual(calls,mock||query?[]:['empty','second']);
  }
});

test('EVP-75 375px wraps four cells; 1440px keeps ten columns; Sheet price is prominent',()=>{
  const css=read('../src/app/admin-design.css');
  const desktop=css.match(/\.lots-grid \{([^}]+)\}/)[1];
  const mobile=css.slice(css.lastIndexOf('@media (max-width: 767px)'));
  assert.match(desktop,/repeat\(10,minmax\(64px,1fr\)\)/);
  assert.ok(375<=767 && 1440>767);
  assert.match(mobile,/\.lots-grid \{ grid-template-columns: repeat\(4,minmax\(0,1fr\)\); min-width: 0/);
  assert.match(mobile,/\.lots-scroll \{ overflow-x: visible/);
  assert.match(mobile,/\.lots-cell \{[^}]*min-height: 52px/);
  assert.match(css,/\.lots-sheet-body \.inventory-price \{ font-size: 30px; font-weight: 750/);
});
