import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = path => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
const button = (tree, label) => nodes(tree).find(n => n.type === 'button' && text(n) === label);
const settle = async () => { for(let i=0;i<20;i++) await Promise.resolve(); };
function component(name, { mock=true, role='TENANT_ADMIN', forbidden=false, fail=false }={}) {
 const state=[], refs=[], effects=[], calls=[]; let cursor=0, refCursor=0;
 class ApiError extends Error { constructor(status) { super('private-secret VAPID endpoint tenant'); this.status=status; } }
 const data = name==='AiSettings' ? {mode:'COPILOT',ai_enabled:false,copilot_enabled:true,ai_available:true,copilot_available:true} : name==='BusinessHoursSettings' ? { business_hours:null,away_message:null,holidays:[],timezone:'America/Argentina/Buenos_Aires',summary:null,open_now:true } : { enabled:false,app_id:'private-secret',config_id:'private-secret',graph_version:'private-secret',connections:[{id:'private-id',display_phone_number:'private-secret',status:'ACTIVE'}] };
 const jsx=(type,props)=>typeof type==='function'?type(props):({type,props});
 const confirmation=props=>props.open?jsx('dialog',{children:[props.title,jsx('dt',{children:'Valor anterior'}),props.before,jsx('dt',{children:'Valor nuevo'}),props.after,jsx('button',{children:'Cancelar',onClick:props.onCancel}),jsx('button',{children:'Confirmar',onClick:props.onConfirm})]}):null;
 const context={exports:{},Date,window:{addEventListener(){},removeEventListener(){}},require(module){
  if(module==='react')return {useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useRef(value){const i=refCursor++; return refs[i]??=( {current:value} );},useState(value){const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return [state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];}};
  if(module==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(module==='@/lib/data-mode')return {isMockDataMode:mock};
  if(module==='@/hooks/use-current-session')return {useCurrentSession:()=>({user:{apiRole:role}})};
  if(module==='./SettingsConfirmation')return {SettingsConfirmation:confirmation};
  if(module==='@/lib/everprop-api')return {EverpropApiError:ApiError,async apiFetch(path,options){calls.push({path,options});if(forbidden)throw new ApiError(403);if(fail)throw new ApiError(500);return {data:options?.body?{...data,...JSON.parse(options.body)}:data};}};
  return new Proxy({}, {get:(_,key)=>key});
 }};
 vm.runInNewContext(compile(`../src/components/admin/${name}.tsx`),context);
 return {state,calls,render(){cursor=0;refCursor=0;effects.length=0;return context.exports[name]();},async load(){for(const effect of [...effects]) effect();await settle();}};
}
test('EVP-78 company cards preserve denied access with no actions in real and mock modes',async()=>{
 for(const name of ['AiSettings','BusinessHoursSettings','WhatsAppConnect'])for(const mock of [true,false]){
  const p=component(name,{mock,role:'READ_ONLY',forbidden:true});p.render();await p.load();const tree=p.render();
  assert.match(text(tree),/Solo lectura/);assert.equal(nodes(tree).filter(n=>n.type==='button'||n.type==='input').length,0);
  assert.equal(p.calls.length,mock?0:1);assert.doesNotMatch(text(tree),/private-secret|tenant|VAPID|endpoint/);
 }
});
test('EVP-78 AI changes wait for confirmation and cancellation never writes',async()=>{
 for(const mock of [true,false]){
  const p=component('AiSettings',{mock});p.render();await p.load();let tree=p.render();
  const choose=()=>nodes(p.render()).find(n=>n.type==='input'&&n.props.value==='AUTONOMOUS').props.onChange();
  choose();tree=p.render();assert.match(text(tree),/Valor anteriorSolo sugerencias.*Valor nuevoRespuestas automáticas/);
  assert.equal(p.calls.filter(c=>c.options).length,0);button(tree,'Cancelar').props.onClick();assert.equal(p.calls.filter(c=>c.options).length,0);
  choose();await button(p.render(),'Confirmar').props.onClick();await settle();assert.equal(p.calls.filter(c=>c.options).length,mock?0:1);
  assert.ok(nodes(p.render()).find(n=>n.type==='input'&&n.props.value==='AUTONOMOUS').props.checked);
 }
});
test('EVP-78 hours confirmation includes original and new hours, message and holidays',async()=>{
 const p=component('BusinessHoursSettings',{mock:false});p.render();await p.load();button(p.render(),'Definir horario').props.onClick();
 nodes(p.render()).find(n=>n.type==='textarea').props.onChange({target:{value:'Volvemos el lunes'}});
 nodes(p.render()).find(n=>n.props?.id==='new-holiday').props.onChange({target:{value:'2026-12-25'}});button(p.render(),'Agregar feriado').props.onClick();
 button(p.render(),'Guardar horario').props.onClick();let tree=p.render();assert.match(text(tree),/Valor anteriorSiempre abierto/);assert.match(text(tree),/Valor nuevoLunes: 09:00 a 18:00/);assert.match(text(tree),/Volvemos el lunes/);assert.match(text(tree),/25 de diciembre/);
 assert.equal(p.calls.length,1);button(tree,'Cancelar').props.onClick();assert.equal(p.calls.length,1);
 button(p.render(),'Guardar horario').props.onClick();button(p.render(),'Confirmar').props.onClick();await settle();assert.equal(p.calls.length,2);assert.equal(JSON.parse(p.calls[1].options.body).holidays[0],'2026-12-25');
});
test('EVP-78 WhatsApp disconnect confirms and sensitive response fields never render',async()=>{
 const p=component('WhatsAppConnect',{mock:false});p.render();await p.load();let tree=p.render();
 assert.match(text(tree),/Configurado/);assert.doesNotMatch(JSON.stringify(tree),/private-secret|private-id/);
 button(tree,'Desconectar').props.onClick();tree=p.render();assert.match(text(tree),/Valor anteriorConectado.*Valor nuevoDesconectado/);assert.equal(p.calls.length,1);button(tree,'Cancelar').props.onClick();assert.equal(p.calls.length,1);
 button(p.render(),'Desconectar').props.onClick();button(p.render(),'Confirmar').props.onClick();await settle();assert.equal(p.calls[1].options.method,'POST');
});
test('EVP-78 mock samples stay local and connection opening also confirms',async()=>{
 for(const name of ['AiSettings','BusinessHoursSettings','WhatsAppConnect']){const p=component(name);p.render();await p.load();assert.ok(text(p.render()).length>50);assert.equal(p.calls.length,0);}
 const p=component('WhatsAppConnect');p.render();await p.load();button(p.render(),'Conectar WhatsApp').props.onClick();assert.match(text(p.render()),/¿Conectar WhatsApp\?/);button(p.render(),'Confirmar').props.onClick();assert.equal(p.calls.length,0);
});
test('EVP-78 failures use simple copy, with no provider error or credentials',async()=>{
 for(const name of ['AiSettings','BusinessHoursSettings','WhatsAppConnect']){const p=component(name,{mock:false,fail:true});p.render();await p.load();assert.match(text(p.render()),/No pudimos/);assert.doesNotMatch(text(p.render()),/private-secret|VAPID|endpoint|tenant|API/);}
 const css=read('../src/app/admin-design.css');assert.match(css,/\.settings-view \{[^}]*font-size: 17px/);assert.match(css,/\.settings-view \.grid \{ grid-template-columns: minmax\(0,1fr\)/);assert.match(css,/\.settings-actions \{ width: 100%/);
 for(const name of ['AiSettings','BusinessHoursSettings','WhatsAppConnect'])assert.doesNotMatch(read(`../src/components/admin/${name}.tsx`),/window.confirm|error.message|parsed.message/);
 assert.match(read('../src/components/admin/SettingsConfirmation.tsx'),/DialogTitle/);
 assert.match(read('../src/app/admin/settings/page.tsx'),/!isAdvisor && <Link.*Atrás/);
});

test('EVP-78 personal notification preferences state their value and stay local in mock',async()=>{
 const p=component('PushPreferences');p.render();await p.load();let tree=p.render();assert.match(text(tree),/No activados en este dispositivo/);
 button(tree,'Activar avisos en este dispositivo').props.onClick();tree=p.render();assert.match(text(tree),/Activados: este dispositivo/);
 button(tree,'Desactivar en este dispositivo').props.onClick();await settle();assert.match(text(p.render()),/No activados en este dispositivo/);assert.equal(p.calls.length,0);
});
