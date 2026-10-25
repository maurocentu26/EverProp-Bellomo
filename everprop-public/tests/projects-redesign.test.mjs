import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const labels = { exports: {} }, inventory = { exports: {} };
vm.runInNewContext(compile('../src/lib/project-labels.ts'), labels);
vm.runInNewContext(compile('../src/lib/inventory-labels.ts'), inventory);
const project = { id:'p1', name:'Proyecto prueba', type:'commercial', status:'pre_sale', location:{city:'Salta',province:'',address:''} };
const properties = ['12','12A','12B'].map((code,index)=>({id:code,unitNumber:code,title:`Unidad ${code}`,projectId:'p1',status:['available','reserved','sold'][index],propertyType:'Lote',sectorName:'Manzana B',inventoryPrice:index===0?null:38500,inventoryCurrency:index===1?null:'USD'}));
const loadComponent = path => {
  const context = {exports:{},require(name){
    if(name==='react/jsx-runtime')return jsx;
    if(name==='next/link')return {default:({children,...props})=>React.createElement('a',props,children)};
    if(name==='@/lib/project-labels')return labels.exports;
    if(name==='@/lib/inventory-labels')return inventory.exports;
    if(name==='lucide-react')return new Proxy({}, {get:()=>()=>React.createElement('svg')});
    throw Error(name);
  }};
  vm.runInNewContext(compile(path),context);return context.exports.default;
};
const PropertyList=loadComponent('../src/components/admin/PropertyList.tsx');

test('EVP-74 project card counts every state and only joins existing location parts',()=>{
  const Card=loadComponent('../src/components/admin/ProjectCard.tsx');
  const html=renderToStaticMarkup(React.createElement(Card,{project,properties:[...properties,{...properties[0],id:'other',projectId:'p2'}]}));
  for(const value of ['Proyecto prueba','Salta','Comercial','Preventa','1</strong> disponible','1</strong> reservada','1</strong> vendida','/admin/desarrollos/p1'])assert.ok(html.includes(value),value);
  assert.equal((html.match(/<article/g)||[]).length,1);
  assert.doesNotMatch(html,/Salta,|mock|QA|uppercase|Datos de muestra/);
  assert.equal(labels.exports.projectLocationLabel({...project,location:{city:'',province:'Sin provincia informada'}}),'Ubicación sin informar');
  assert.deepEqual(Array.from(labels.exports.projectUnitCounts([])),[0,0,0]);
  assert.deepEqual(Array.from(labels.exports.projectUnitCounts(Array.from({length:150},()=>properties[0]))),[150,0,0]);
});

const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const text=t=>t==null?'':typeof t==='string'||typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
test('EVP-74 detail preserves 12, 12A, 12B and null price/currency; advisor has no write action',()=>{
  let advisor=true,cursor=0;
  const states=[project,properties,'overview',false,null,0];
  const jsxTree=(type,props)=>({type,props});
  const context={exports:{},require(name){
    if(name==='react')return {useState:()=>[states[cursor++],()=>{}],useEffect(){}};
    if(name==='react/jsx-runtime')return {jsx:jsxTree,jsxs:jsxTree};
    if(name==='next/navigation')return {useParams:()=>({id:'p1'})};
    if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({isAdvisor:advisor})};
    if(name==='@/lib/auth-context')return {useAuth:()=>({invalidateSession(){}})};
    if(name==='@/lib/project-labels')return labels.exports;
    if(name==='@/components/admin/PropertyList')return {default:PropertyList};
    if(name==='@/lib/utils')return {cn:()=>''};
    return new Proxy({}, {get:(_,key)=>key});
  }};
  vm.runInNewContext(compile('../src/app/admin/desarrollos/[id]/page.tsx'),context);
  let tree=context.exports.default(),all=nodes(tree);
  assert.equal(text(all.find(n=>n.type==='h1')),'Proyecto prueba');
  assert.equal(all.filter(n=>n.type==='GenerateLotsModal').length,0);
  assert.doesNotMatch(text(tree),/Atrás|Cargar manzana|QA|Datos de muestra/);
  const list=all.find(n=>n.type===PropertyList);
  assert.equal(list.props.readOnly,true);
  const html=renderToStaticMarkup(React.createElement(PropertyList,list.props));
  for(const code of ['12','12A','12B'])assert.ok(html.includes(`<h3>${code}</h3>`));
  assert.match(html,/Precio a consultar/);assert.match(html,/Moneda sin confirmar/);assert.doesNotMatch(html,/Manzana Manzana/);
  advisor=false;cursor=0;tree=context.exports.default();
  assert.equal(nodes(tree).find(n=>n.type==='GenerateLotsModal').props.confirmBeforeSave,true);
});

test('EVP-74 lot creation shows all data, cancellation never writes, acceptance writes once',async()=>{
  const states=[],lock={current:false};let cursor=0,writes=0,allow=false,review='';
  const context={exports:{},window:{confirm(message){review=message;return allow;}},require(name){
    if(name==='react')return {useState(value){const i=cursor++;if(!(i in states))states[i]=value;return [states[i],v=>{states[i]=v;}];},useEffect(){},useMemo:fn=>fn(),useId:()=> 'lots',useRef:()=>lock};
    if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
    if(name==='@/lib/data-mode')return {isMockDataMode:false};
    if(name==='@/lib/everprop-api')return {async generateLotsBatch(){writes++;return {properties:[]};}};
    if(name==='sonner')return {toast:{success(){},error(message){throw Error(message);}}};
    return new Proxy({}, {get:(_,key)=>key});
  }};
  vm.runInNewContext(compile('../src/components/admin/GenerateLotsModal.tsx'),context);
  const render=()=>{cursor=0;return context.exports.GenerateLotsModal({open:true,onOpenChange(){},defaultProjectId:'p1',confirmBeforeSave:true});};
  render();assert.equal(states[7],'');assert.equal(states[9],'');assert.deepEqual(Array.from(states[15]),[]);states[0]=[project];states[2]='Manzana B';states[4]=20;states[5]='10';states[6]='25';states[7]='250';states[9]='15000';states[10]=true;states[11]='1, 20';states[12]='280';states[13]='4.79';states[14]='17000';states[16]='Descripción completa';
  await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(writes,0);
  for(const value of ['Proyecto prueba','Manzana B','1 a 20','Disponible','Venta','10 m','25 m','250 m²','USD 15000','1, 20','280 m²','4.79','USD 17000','Descripción completa'])assert.ok(review.includes(value),value);
  assert.equal(states[2],'Manzana B');
  allow=true;const submit=nodes(render()).find(n=>n.type==='form').props.onSubmit;await Promise.all([submit({preventDefault(){}}),submit({preventDefault(){}})]);assert.equal(writes,1);
});

test('EVP-74 list loads complete project inventory, advisors cannot create, and mobile uses one column',()=>{
  const page=fs.readFileSync(new URL('../src/app/admin/desarrollos/page.tsx',import.meta.url),'utf8');
  assert.match(page,/loadEverpropPropertiesByProject\(project.id\)/);
  assert.match(page,/!isAdvisor && canCreate/);
  assert.doesNotMatch(page,/No se.*mock|Matriz mock/);
  const css=fs.readFileSync(new URL('../src/app/admin-design.css',import.meta.url),'utf8');
  assert.match(css,/\.inventory-view, \.inventory-cards \{ font-size: 17px/);
  assert.match(css,/\.inventory-cards \{ grid-template-columns: minmax\(0,1fr\)/);
  assert.match(css,/\.projects-view button, \.projects-view \.inventory-cta \{ width: 100%/);
});


