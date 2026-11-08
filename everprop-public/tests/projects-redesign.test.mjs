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
const properties = ['12','12A','12B'].map((code,index)=>({id:code,unitNumber:code,title:`Unidad ${code}`,projectId:'p1',status:['available','reserved','sold'][index],operation:'sale',propertyType:'Lote',sectorName:'Manzana B',inventoryPrice:index===0?null:38500,inventoryCurrency:index===1?null:'USD'}));
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

test('EVP-109 project row shows every state from loaded units or API counters',()=>{
  const Card=loadComponent('../src/components/admin/ProjectCard.tsx');
  const html=renderToStaticMarkup(React.createElement(Card,{project,properties:[...properties,{...properties[0],id:'other',projectId:'p2'}]}));
  for(const value of ['Proyecto prueba','Salta','Comercial','Preventa','1</strong> en venta','1</strong> reservada','1</strong> vendida','/admin/desarrollos/p1','Ver proyecto'])assert.ok(html.includes(value),value);
  assert.equal((html.match(/<article/g)||[]).length,1);
  assert.doesNotMatch(html,/mock|QA|uppercase|Datos de muestra/);
  assert.equal(labels.exports.projectLocationLabel({...project,location:{city:'',province:'Sin provincia informada'}}),'Ubicación sin informar');
  assert.match(html,/role="img"[^>]*aria-label="3 unidades: 1 en venta, 1 reservada, 1 vendida"/);
  assert.match(html,/width:33\.33333333333333%/);
  const emptyHtml=renderToStaticMarkup(React.createElement(Card,{project,properties:[]}));
  assert.match(emptyHtml,/Sin unidades cargadas/);assert.match(emptyHtml,/sin disponibles/);
  assert.doesNotMatch(emptyHtml,/project-state-bar|NaN|Infinity/);
  const coverHtml=renderToStaticMarkup(React.createElement(Card,{project:{...project,coverImage:'/project-cover.jpg'},properties}));
  assert.match(coverHtml,/role="img"[^>]*aria-label="Portada de Proyecto prueba"/);
  assert.match(coverHtml,/project-cover.jpg/);
  const counters={...project,propertiesCount:100,availableUnitsCount:10,availableSaleUnitsCount:10,availableRentUnitsCount:0,reservedUnitsCount:1,soldUnitsCount:49,rentedUnitsCount:0,notSellableUnitsCount:40,notMarketedUnitsCount:0};
  const counted=renderToStaticMarkup(React.createElement(Card,{project:counters,properties:[]}));
  for(const value of ['100 unidades','10</strong> en venta','1</strong> reservada','49</strong> vendidas','40</strong> no vendibles'])assert.ok(counted.includes(value),value);
  assert.doesNotMatch(counted,/en alquiler|sin estado/);
});

test('EVP-109 unit names keep the code, read a lot block only for lots, and sort naturally',()=>{
  const {unitDisplay,compareUnits}=labels.exports;
  const lot=unitDisplay({unitNumber:'12A',title:'t',propertyType:'Lote',sectorName:'AP18',description:' LOTE DE 386 M2 '});
  assert.equal(lot.name,'Lote 12A');assert.equal(lot.detail,'Manzana AP18 · LOTE DE 386 M2');
  assert.equal(unitDisplay({unitNumber:'1',title:'t',propertyType:'Lote',sectorName:'1P'}).detail,'1P');
  assert.equal(unitDisplay({unitNumber:'1',title:'t',propertyType:'Lote',sectorName:'Manzana B'}).detail,'Manzana B');
  assert.equal(unitDisplay({unitNumber:'10',title:'t',propertyType:'Departamento',sectorName:'COCH',description:'COCHERA 15 M2'}).detail,'COCH · COCHERA 15 M2');
  assert.equal(unitDisplay({unitNumber:'3',title:'t',propertyType:'Sin tipo',sectorName:'AP3'}).name,'Unidad 3');
  assert.equal(unitDisplay({title:'Registro 59 sin unidad informada',propertyType:'Sin tipo'}).name,'Registro 59 sin unidad informada');
  const codes=[['AP10','2'],['AP9','19'],['AP9','9'],['AP9','12B'],['AP9','12'],['AP9','12A']].map(([sectorName,unitNumber])=>({sectorName,unitNumber,title:'t'}));
  assert.deepEqual(codes.sort(compareUnits).map(u=>`${u.sectorName} ${u.unitNumber}`),['AP9 9','AP9 12','AP9 12A','AP9 12B','AP9 19','AP10 2']);
});

test('EVP-109 unit summary never hides units: leasing stays available and the remainder is unknown',()=>{
  const {projectUnitSummary,unitState,availableUnitsLabel}=labels.exports;
  assert.equal(unitState({status:'available',operation:'leasing'}),'available');
  assert.equal(unitState({status:'available',operation:'rent'}),'rent');
  assert.equal(unitState({status:undefined,operation:'sale'}),'unknown');
  const api=projectUnitSummary({...project,propertiesCount:10,availableUnitsCount:4,availableSaleUnitsCount:2,availableRentUnitsCount:1,soldUnitsCount:3,rentedUnitsCount:1});
  assert.deepEqual([api.total,api.available,api.counts.available,api.counts.unknown],[10,4,1,2]);
  assert.equal(availableUnitsLabel(api),'disponibles');
  assert.equal(availableUnitsLabel(projectUnitSummary({...project,propertiesCount:17,availableUnitsCount:17,availableRentUnitsCount:17})),'en alquiler');
  const sum=projectUnitSummary(project,Array.from({length:150},()=>properties[0]));
  assert.deepEqual([sum.total,sum.available,sum.counts.sale],[150,150,150]);
});

const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
const text=t=>t==null?'':typeof t==='string'||typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
test('EVP-109 detail starts on what is offered, preserves 12, 12A, 12B and null price; advisor has no write action',()=>{
  let advisor=true,cursor=0;
  const states=[project,properties,'units',false,null,0,null,24];
  const jsxTree=(type,props)=>({type,props});
  const context={exports:{},require(name){
    if(name==='react')return {useState:()=>[states[cursor++],()=>{}],useEffect(){}};
    if(name==='react/jsx-runtime')return {jsx:jsxTree,jsxs:jsxTree};
    if(name==='next/navigation')return {useParams:()=>({id:'p1'})};
    if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({isAdvisor:advisor})};
    if(name==='@/lib/auth-context')return {useAuth:()=>({invalidateSession(){}})};
    if(name==='@/lib/project-labels')return labels.exports;
    if(name==='@/lib/inventory-labels')return inventory.exports;
    return new Proxy({}, {get:(_,key)=>key});
  }};
  vm.runInNewContext(compile('../src/app/admin/desarrollos/[id]/page.tsx'),context);
  const render=()=>{cursor=0;return context.exports.default();};
  const rows=tree=>nodes(tree).filter(n=>n.props?.className==='project-unit');
  let tree=render(),all=nodes(tree);
  assert.equal(text(all.find(n=>n.type==='h1')),'Proyecto prueba');
  assert.equal(all.filter(n=>n.type==='GenerateLotsModal').length,0);
  assert.doesNotMatch(text(tree),/Cargar manzana|QA|Datos de muestra/);
  assert.match(text(tree),/Solo lectura/);
  assert.equal(rows(tree).length,1);
  assert.equal(text(nodes(rows(tree)[0]).find(n=>n.type==='h2')),'Lote 12');
  assert.equal(all.find(n=>n.type==='button'&&n.props['aria-pressed']===true&&/en venta/.test(text(n)))!==undefined,true);
  states[6]='all';tree=render();
  assert.deepEqual(rows(tree).map(row=>text(nodes(row).find(n=>n.type==='h2'))),['Lote 12','Lote 12A','Lote 12B']);
  assert.doesNotMatch(text(tree),/Manzana Manzana/);
  assert.equal((text(tree).match(/Precio a confirmar/g)||[]).length,2);
  assert.doesNotMatch(text(tree),/Moneda sin confirmar|Precio a consultar/);
  states[7]=2;assert.equal(rows(render()).length,2);assert.match(text(render()),/Mostrando 2 de 3/);assert.match(text(render()),/Ver más/);
  states[6]=null;states[7]=24;advisor=false;tree=render();
  assert.equal(nodes(tree).find(n=>n.type==='GenerateLotsModal').props.confirmBeforeSave,true);
  assert.match(text(tree),/Cargar manzana y lotes/);
  states[1]=[properties[0],{...properties[0],id:'r',unitNumber:'R1',operation:'rent'}];tree=render();
  assert.equal(rows(tree).length,2);
  assert.ok(nodes(tree).some(n=>n.type==='button'&&n.props['aria-pressed']===true&&/2.*disponibles/.test(text(n))));
  states[1]=properties;states[2]='materials';tree=render();
  assert.equal(rows(tree).length,0);
});

test('EVP-74 lot creation shows all data, cancellation never writes, acceptance writes once',async()=>{
  const states=[],lock={current:false};let cursor=0,writes=0,review='';
  const context={exports:{},require(name){
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
  review=states[18];
  for(const value of ['Proyecto prueba','Manzana B','1 a 20','Disponible','Venta','10 m','25 m','250 m²','USD 15000','1, 20','280 m²','4.79','USD 17000','Descripción completa'])assert.ok(review.includes(value),value);
  assert.equal(states[2],'Manzana B');
  assert.ok(text(nodes(render()).find(n=>n.props?.['aria-label']==='Confirmaci\u00f3n completa')).includes('Descripci\u00f3n completa'));
  nodes(render()).find(n=>n.type==='Button' && text(n)==='Volver a editar').props.onClick();
  assert.equal(states[18],'');assert.equal(writes,0);
  await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  nodes(render()).find(n=>n.type==='Button' && n.props.type==='submit').props.onClick();
  const submit=nodes(render()).find(n=>n.type==='form').props.onSubmit;await Promise.all([submit({preventDefault(){}}),submit({preventDefault(){}})]);assert.equal(writes,1);
});

test('EVP-109 list searches without accents, filters availability and keeps creation away from advisors',()=>{
  const page=fs.readFileSync(new URL('../src/app/admin/desarrollos/page.tsx',import.meta.url),'utf8');
  assert.match(page,/filter\(project => project\.availableUnitsCount == null\)/);
  assert.match(page,/!isAdvisor && canCreate/);
  assert.match(page,/normalize\("NFD"\)/);
  assert.match(page,/b\.summary\.available - a\.summary\.available/);
  assert.match(page,/aria-pressed=\{filterType === value\}/);
  assert.doesNotMatch(page,/No se.*mock|Matriz mock/);
  const css=fs.readFileSync(new URL('../src/app/admin-catalog.css',import.meta.url),'utf8');
  for(const state of labels.exports.UNIT_STATES)assert.ok(css.includes(`[data-state="${state}"]`),state);
  assert.match(css,/\.project-row \{ display: flex; flex-wrap: wrap/);
  assert.doesNotMatch(css,/\.project-card|\.project-availability/);
});
