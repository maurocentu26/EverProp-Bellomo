import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = path => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
function page({mock=true,role='READ_ONLY',advisor=false,fail=false}={}) {
 const sample={exports:{}};vm.runInNewContext(compile('../src/data/knowledge-sample.ts'),sample);
 const state=[],effects=[],calls=[];let cursor=0;
 const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
 const context={exports:{},Date,require(name){
  if(name==='react')return {useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useState(value){const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];}};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(name==='@/lib/data-mode')return {isMockDataMode:mock};
  if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({user:{apiRole:role},isAdvisor:advisor})};
  if(name==='@/data/knowledge-sample')return sample.exports;
  if(name==='@/lib/assistant-api')return {async listKnowledge(){calls.push('list');if(fail)throw Error();return {data:sample.exports.knowledgeSample};},async approveKnowledge(id){calls.push(['approve',id]);},async revokeKnowledge(id){calls.push(['revoke',id]);},async createKnowledge(data){calls.push(['create',data]);}};
  if(name==='sonner')return {toast:{success(){},error(){}}};
  return new Proxy({}, {get:(_,key)=>key});
 }};
 vm.runInNewContext(compile('../src/components/admin/assistant/KnowledgeManager.tsx'),context);
 return {state,calls,render(){cursor=0;effects.length=0;return context.exports.KnowledgeManager();},async load(){effects[0]();for(let i=0;i<12;i++)await Promise.resolve();}};
}
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label);
test('EVP-77 mock loads realistic samples without API, with correct singular and plural',async()=>{
 const p=page();assert.match(text(p.render()),/Cargando documentos/);await p.load();let tree=p.render();
 assert.match(text(tree),/4 documentos/);assert.match(text(tree),/Las Moras/);assert.match(text(tree),/23\/10\/2026/);assert.match(text(tree),/Versión3/);assert.equal(p.calls.length,0);
 p.state[0]=p.state[0].slice(0,1);assert.match(text(p.render()),/1 documento/);
});
test('EVP-77 READ_ONLY and advisor have no write controls, admins keep writer gate',async()=>{
 for(const role of ['READ_ONLY','SALES_ADVISOR','TENANT_ADMIN','SALES_MANAGER','SUPER_ADMIN']){
  const p=page({role,advisor:role==='SALES_ADVISOR'});p.render();await p.load();const tree=p.render();
  const writer=['TENANT_ADMIN','SALES_MANAGER','SUPER_ADMIN'].includes(role);
  assert.equal(Boolean(button(tree,'Agregar documento')),writer);assert.equal(Boolean(button(tree,'Publicar')),writer);assert.equal(Boolean(button(tree,'Archivar')),writer);
  assert.equal((text(tree).match(/Atrás/g)||[]).length,role==='SALES_ADVISOR'?0:1);
 }
});
test('EVP-77 publish/archive require panel confirmation; cancelling does not mutate',async()=>{
 const p=page({mock:false,role:'TENANT_ADMIN'});p.render();await p.load();let tree=p.render();
 button(tree,'Publicar').props.onClick();tree=p.render();assert.match(text(tree),/¿Publicar este documento\?/);assert.match(text(tree),/Preguntas frecuentes de Torre Sur/);
 assert.equal(p.calls.length,1);button(tree,'Cancelar').props.onClick();assert.equal(p.calls.length,1);
 button(p.render(),'Publicar').props.onClick();button(p.render(),'Confirmar').props.onClick();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(p.calls[1][0],'approve');
 button(p.render(),'Archivar').props.onClick();assert.match(text(p.render()),/¿Archivar este documento\?/);button(p.render(),'Confirmar').props.onClick();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(p.calls.at(-2)[0],'revoke');
});
test('EVP-77 document body is a text child, never interpreted as HTML',async()=>{
 const p=page();p.render();await p.load();const payload='<img src=x onerror=alert(1)>';p.state[0][0].body=payload;const tree=p.render();
 assert.ok(nodes(tree).some(n=>n.type==='p'&&n.props.children===payload));assert.ok(nodes(tree).every(n=>!n.props?.dangerouslySetInnerHTML));
 assert.doesNotMatch(read('../src/components/admin/assistant/KnowledgeManager.tsx'),/dangerouslySetInnerHTML|window.confirm/);
});
test('EVP-77 empty, error and missing fields are understandable; retry and mobile containment',async()=>{
 const p=page({mock:false,fail:true});p.render();await p.load();assert.match(text(p.render()),/No pudimos cargar/);assert.ok(button(p.render(),'Reintentar'));
 p.state[1]='';p.state[0]=[];assert.match(text(p.render()),/Todavía no hay documentos/);
 p.state[0]=[{id:'private-id',title:'Documento',status:'DRAFT',audience:'PUBLIC',version:1,updated_at:'2026-10-23T14:00:00Z',valid_until:null,approved_at:null}];
 const tree=p.render();assert.match(text(tree),/Sin informar/);assert.match(text(tree),/contenido de este documento no está disponible/);assert.doesNotMatch(text(tree),/private-id|chunks|embeddings|FULLTEXT|tenant|sesión de la API|Datos de muestra|QA/);
 const css=read('../src/app/admin-design.css');assert.match(css,/\.knowledge-grid, \.knowledge-meta \{ grid-template-columns: minmax\(0,1fr\)/);assert.match(css,/\.knowledge-view :is\(button,\.knowledge-button\), \.knowledge-actions \{ width: 100%/);
 assert.match(read('../src/app/admin/conocimiento/page.tsx'),/<KnowledgeManager/);
});



test('EVP-77 saving a draft confirms all input before mutation and stays local in mock',async()=>{
 const p=page({role:'TENANT_ADMIN'});p.render();await p.load();button(p.render(),'Agregar documento').props.onClick();
 p.state[5]={title:'Condiciones de visita',body:'<b>Coordinar con un asesor</b>',audience:'INTERNAL',validUntil:'2026-12-31'};
 let tree=p.render();nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=p.render();
 assert.match(text(tree),/¿Guardar este borrador\?/);assert.match(text(tree),/Condiciones de visita/);assert.match(text(tree),/<b>Coordinar con un asesor<\/b>/);assert.match(text(tree),/31\/12\/2026/);assert.match(text(tree),/Solo el equipo/);
 assert.equal(p.state[0].length,4);button(tree,'Confirmar').props.onClick();for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(p.state[0].length,5);assert.equal(p.state[0].at(-1).status,'DRAFT');assert.equal(p.calls.length,0);
});
