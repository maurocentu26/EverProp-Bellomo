import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const labels = { exports: {} };
vm.runInNewContext(compile('../src/lib/inventory-labels.ts'), labels);
const card = { exports: {}, require(name) {
  if (name === 'react/jsx-runtime') return jsx;
  if (name === 'next/link') return { default: ({children,...props}) => React.createElement('a',props,children) };
  if (name === '@/lib/inventory-labels') return labels.exports;
  if (name === 'lucide-react') return new Proxy({}, { get: () => () => React.createElement('svg') });
  throw Error(name);
} };
vm.runInNewContext(compile('../src/components/admin/PropertyList.tsx'), card);

test('EVP-73 renders 12, 12A and 12B as separate cards and preserves Inventory nulls', () => {
  const properties = ['12','12A','12B'].map((code,index) => ({ id: code, unitNumber: code, title: `Unidad ${code}`, propertyType: 'Lote', projectId: 'p1', status: index === 1 ? 'reserved' : 'available', area_m2: 280, price: 0, currency: 'USD', inventoryPrice: index === 2 ? null : 38500, inventoryCurrency: index === 1 ? null : 'USD' }));
  const html = renderToStaticMarkup(React.createElement(card.exports.default, { properties, projects: [{id:'p1',name:'Proyecto prueba'}] }));
  assert.equal((html.match(/<article/g) || []).length, 3);
  for (const code of ['12','12A','12B']) { assert.ok(html.includes(`<h3>${code}</h3>`)); assert.ok(html.includes(`href="/admin/properties/${code}"`)); }
  assert.match(html, /Moneda sin confirmar/);
  assert.match(html, /Precio a consultar/);
  assert.match(html, /USD 38.500/);
  assert.match(html, /Reservado/);
  assert.match(html, /280 m²/);
  assert.doesNotMatch(html, /<table/);
  assert.equal(labels.exports.inventoryPriceLabel({price:0,currency:'ARS'}), 'ARS 0');
});

test('EVP-73 editing reviews all fields, preserves null currency and writes only once after confirmation', async () => {
  const states = []; let cursor = 0, writes = 0, saved;
  const jsxTree = (type, props) => ({type,props});
  const components = new Proxy({}, {get: (_, key) => key});
  const context = {exports:{}, require(name) {
    if(name === 'react') return {useState(initial) {const index=cursor++; if(!(index in states)) states[index]=initial; return [states[index], value=>{states[index]=value;}];},useRef(initial) {const index=cursor++; return states[index] ??= {current:initial};}};
    if(name === 'react/jsx-runtime') return {jsx:jsxTree,jsxs:jsxTree};
    if(name === '@/lib/inventory-labels') return labels.exports;
    if(name === '@/lib/data-mode') return {isMockDataMode:false};
    if(name === '@/lib/everprop-api') return {async updateEverpropProperty(id,payload) {writes++; saved=payload; return {id,...payload};}};
    if(name === '@/data/admin-sample') return {JUJUY_CITIES:[]};
    if(name === 'sonner') return {toast:{success(){},error(message){throw Error(message);}}};
    return components;
  }};
  vm.runInNewContext(compile('../src/components/admin/EditPropertyModal.tsx'),context);
  const property={id:'12A',title:'Unidad 12A',unitNumber:'12A',inventoryPrice:38500,inventoryCurrency:null,price:38500,currency:'USD',propertyType:'Lote',operation:'sale',status:'reserved',version:8};
  const render=()=>{cursor=0;return context.exports.EditPropertyModal({open:true,property,onOpenChange(){},onSuccess(){}});};
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree,...nodes(tree.props?.children)];
  const text = tree => tree == null ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree.props?.children);
  let tree=render();
  await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(writes,0);
  tree=render();
  const review=nodes(tree).find(n=>n.props?.['aria-label']==='Confirmación completa');
  assert.ok(review);
  for(const value of ['Unidad 12A','38.500','Moneda sin confirmar','Reservado','Superficie (m²)','Descripción']) assert.ok(text(review).includes(value),value);
  nodes(review).find(n=>n.type==='Button').props.onClick();
  tree=render(); assert.equal(nodes(tree).find(n=>n.type==='fieldset').props.hidden,false);
  await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  tree=render();
  const submit=nodes(tree).find(n=>n.type==='form').props.onSubmit;
  await Promise.all([submit({preventDefault(){}}),submit({preventDefault(){}})]);
  assert.equal(writes,1); assert.equal('currency' in saved,false); assert.equal('price' in saved,false);
  assert.equal(saved.unitNumber,'12A'); assert.equal(saved.version,8);
});


test('EVP-73 detail: single identity, location without empty parts, advisor read-only and full visit review', async () => {
  const property = {id:'12A', unitNumber:'12A', title:'Unidad 12A', city:'San Salvador de Jujuy', neighborhood:'', projectId:'p1', propertyType:'Lote', operation:'sale', status:'reserved', inventoryPrice:null, inventoryCurrency:null, visits:[]};
  const initial = ['Proyecto prueba', '', false, false, property, [property], [], false];
  let cursor=0, confirmation='', advisor=true;
  const jsxTree=(type,props)=>({type,props});
  const components=new Proxy({}, {get:(_,key)=>key});
  const context={exports:{},window:{confirm(message){confirmation=message;return false;}},require(name){
    if(name==='react') return {useState(){return [initial[cursor++],()=>{}];},useRef(){return {current:null};},useEffect(){}};
    if(name==='react/jsx-runtime') return {jsx:jsxTree,jsxs:jsxTree};
    if(name==='@/hooks/use-current-session') return {useCurrentSession:()=>({isEngineer:false,isAdvisor:advisor,user:{name:'Asesor prueba'}})};
    if(name==='@/lib/inventory-labels') return labels.exports;
    if(name==='@/lib/utils') return {cn:()=>''};
    return components;
  }};
  vm.runInNewContext(compile('../src/components/admin/PropertyDetailView.tsx'),context);
  const tree=context.exports.default({propertyId:'12A'});
  const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
  const text=t=>t==null?'':typeof t==='string'||typeof t==='number'?String(t):Array.isArray(t)?t.map(text).join(''):text(t.props?.children);
  const all=nodes(tree);
  assert.equal(all.filter(n=>n.type==='h1').length,1);
  assert.equal(text(all.find(n=>n.type==='h1')),'Unidad 12A');
  assert.ok(text(tree).includes('San Salvador de Jujuy'));
  assert.ok(!text(tree).includes(', San Salvador'));
  assert.ok(text(tree).includes('Precio a consultar'));
  assert.equal(all.filter(n=>n.props?.['aria-pressed']!==undefined).length,0);
  const manager=all.find(n=>n.props?.title==='Calendario de Visitas');
  assert.equal(manager.props.confirmSchedule({leadName:'Visitante prueba',phone:'555',email:'prueba@example.test',scheduledAt:'2099-01-01T15:00:00Z',notes:'Nota prueba'}),false);
  for(const value of ['12A','Proyecto prueba','Visitante prueba','555','prueba@example.test','2099','12:00','Asesor prueba','Nota prueba']) assert.ok(confirmation.includes(value),value);
  advisor=false;cursor=0;
  const adminNodes=nodes(context.exports.default({propertyId:'12A'}));
  await adminNodes.find(n=>n.props?.['aria-pressed']===false).props.onClick();
  for(const value of ['12A','Actual: Reservado','Nueva: Disponible']) assert.ok(confirmation.includes(value),value);
});

test('EVP-73 visit cancellation preserves draft and confirmation precedes scheduling', async () => {
  const states=[];let cursor=0,writes=0,allow=false,reviews=0;
  const jsxTree=(type,props)=>({type,props});const components=new Proxy({}, {get:(_,key)=>key});
  const context={exports:{},Date,require(name){
    if(name==='react') return {useState(value){const i=cursor++;if(!(i in states))states[i]=value;return [states[i],v=>{states[i]=v;}];},useRef:()=>({current:null}),useEffect(){},useMemo:fn=>fn()};
    if(name==='react/jsx-runtime')return {jsx:jsxTree,jsxs:jsxTree};
    if(name==='@/lib/utils')return {cn:()=>''};
    if(name==='sonner')return {toast:{success(){}}};
    return components;
  }};
  vm.runInNewContext(compile('../src/components/admin/VisitManager.tsx'),context);
  const render=()=>{cursor=0;return context.exports.default({title:'Visitas',subtitle:'',visits:[],onSchedule:async()=>{writes++;},confirmSchedule(visit){reviews++;assert.equal(visit.leadName,'Visitante prueba');return allow;}});};
  const nodes=t=>!t||typeof t!=='object'?[]:Array.isArray(t)?t.flatMap(nodes):[t,...nodes(t.props?.children)];
  render(); states[0]='Visitante prueba';states[1]='2099-01-01T12:00';states[2]='Conservar notas';
  await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(reviews,1);assert.equal(writes,0);assert.equal(states[1],'2099-01-01T12:00');assert.equal(states[2],'Conservar notas');
  allow=true;
  await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(writes,1);assert.equal(states[1],'');
});
