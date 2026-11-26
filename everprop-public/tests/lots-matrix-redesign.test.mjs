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
    assert.ok(cell); assert.equal(cell.props.type,'button'); assert.match(cell.props['aria-label'],/Manzana B.*Precio a confirmar/);
    assert.equal(text(cell.props.children[0]),code);
  }
  for(const label of ['Disponible','Reservado','Vendido','Alquilado','No vendible','No comercializado','Sin estado informado','1 reservada','1 vendida','1 disponible']) assert.ok(text(tree).includes(label),label);
  all.find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('12A ·')).props.onClick();
  const sheet=render(); assert.ok(text(sheet).includes('12A')); assert.ok(text(sheet).includes('Precio a confirmar')); assert.ok(text(sheet).includes('Frente sin informar')); assert.ok(text(sheet).includes('Sin servicios informados'));
  assert.equal(nodes(sheet).find(n=>n.type==='Link').props.href,'/admin/properties/12A');
  assert.equal((text(sheet).match(/Atrás/g)||[]).length,1);
  assert.doesNotMatch(text(sheet),/Manzana Manzana|Datos de muestra|QA/);
  const summary=nodes(sheet).find(n=>n.props?.className==='lots-selected');
  for(const value of ['Lote seleccionado','12A','Reservado','Precio a confirmar','Ver ficha'])assert.ok(text(summary).includes(value),value);
  assert.equal(nodes(sheet).find(n=>n.type==='Sheet').props.open,false);
  nodes(summary).find(n=>n.type==='button').props.onClick();
  assert.equal(nodes(render()).find(n=>n.type==='Sheet').props.open,true);
  nodes(render()).find(n=>n.props?.className==='lots-back').props.onClick();
  assert.equal(nodes(render()).find(n=>n.type==='Sheet').props.open,false);
});
test('EVP-75 sector filter, plural counts, missing sector and supplied details',()=>{
 const render=matrix(); let tree=render({properties:[...properties, {...properties[0],id:'extra'}, {...properties[0],id:'no-sector',sectorName:undefined}]});
 assert.match(text(tree),/2 disponibles/);
 assert.match(text(nodes(tree).find(n=>n.props?.className==='lots-legend')),/Disponible · 3/);
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'Sin manzana informada'}});
 tree=render({properties:[...properties,{...properties[0],id:'no-sector',sectorName:undefined}]});
 assert.equal(nodes(tree).filter(n=>n.type==='button'&&n.props['aria-label']).length,1);
 assert.match(text(nodes(tree).find(n=>n.props?.className==='lots-legend')),/Disponible · 1/);
 const detailed=matrix(); tree=detailed({properties:[{...properties[0],area_m2:300,commercialFeatures:{land:{frente_m:12,fondo_m:25,ochava_m2:4}},services:{water:true,lighting:true,curb:true,internet:true}}]});
 nodes(tree).find(n=>n.type==='button'&&n.props['aria-label']).props.onClick();
 tree=detailed({properties:[{...properties[0],area_m2:300,commercialFeatures:{land:{frente_m:12,fondo_m:25,ochava_m2:4}},services:{water:true,lighting:true,curb:true,internet:true}}]});
 for(const label of ['300 m²','Frente: 12 m','Fondo: 25 m','Ochava: 4 m²','Agua potable · Alumbrado público · Cordón cuneta · Internet'])assert.ok(text(tree).includes(label),label);
});
test('EVP-75 existing routes, loading, error and responsive containment',()=>{
 const page=read('../src/app/admin/inventory-matrix/page.tsx'),css=read('../src/app/admin-design.css');
 assert.match(page,/isReady && canCreate/); assert.match(page,/confirmBeforeSave/); assert.match(page,/if \(!isMockDataMode\)/); assert.doesNotMatch(page,/rendimiento|Datos de muestra/);
 assert.match(page,/<InventoryMatrix[^>]*canEdit=\{canEdit\}[^>]*canDelete=\{canDelete\}[^>]*onStatusChange=\{changeUnitStatus\}[^>]*onDelete=\{removeUnit\}/);
 assert.match(css,/\.lots-scroll \{[^}]*overflow-x: auto/); assert.match(css,/min-height: 72px; min-width: 44px/); assert.match(css,/\.lots-sheet\[data-slot="sheet-content"\] \{ inset: 0; width: 100%; max-width: none/);
 assert.match(text(matrix()({properties:[],isLoading:true})),/Cargando lotes/);
 assert.match(text(matrix()({properties:[]})),/No hay unidades/);
});

test('EVP-203 matrix exposes status and delete only to permitted editors',()=>{
 const render=matrix();
 const readOnly=render();
 assert.equal(nodes(readOnly).some(n=>n.type==='select'&&/Cambiar estado/.test(text(n))),false);
 nodes(readOnly).find(n=>n.type==='button'&&n.props['aria-label']?.startsWith('12 ·')).props.onClick();
 let state='',deleted='';
 const editable=render({properties,canEdit:true,canDelete:true,onStatusChange:async(unit,next)=>{state=`${unit.id}:${next}`;},onDelete:async unit=>{deleted=unit.id;}});
 const summary=nodes(editable).find(n=>n.props?.className==='lots-selected');
 const select=nodes(summary).find(n=>n.type==='select');
 select.props.onChange({target:{value:'not_marketed'}});
 nodes(summary).find(n=>n.type==='button'&&/Eliminar lote/.test(text(n))).props.onClick();
 assert.equal(state,'12:not_marketed');assert.equal(deleted,'12');
});

test('EVP-203 global matrix saves with the current version, deletes and refreshes after a conflict',async()=>{
 const unit={...properties[0],projectId:'project-a',version:7,propertyType:'Lote'};
 const state=[];let cursor=0,conflict=false,deleted='',updatedVersion=0,refreshes=0;
 const toasts=[];
 class ApiError extends Error { constructor(status){super('API error');this.status=status;} }
 const context={exports:{},window:{location:{search:'?project=project-a'},confirm:()=>true},URLSearchParams,require(name){
  if(name==='react')return {useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}]},useEffect(){}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/data-mode')return {isMockDataMode:false};
  if(name==='@/components/admin/InventoryMatrix')return {default:'InventoryMatrix'};
  if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({isAdvisor:false,isReady:true,user:{permissions:['update','delete']}})};
  if(name==='@/lib/everprop-api')return {EverpropApiError:ApiError,updateEverpropPropertyStatus:async(id,status,version)=>{updatedVersion=version;if(conflict)throw new ApiError(409);return {...unit,status,version:version+1}},deleteEverpropProperty:async id=>{deleted=id;},loadEverpropPropertiesByProject:async()=>{refreshes++;return [{...unit,status:'reserved',version:10}];}};
  if(name==='@/lib/inventory-labels')return {propertyStatusLabel:status=>status};
  if(name==='sonner')return {toast:{success:value=>toasts.push(value),error:value=>toasts.push(value)}};
  if(name==='xlsx')return {utils:{},writeFile(){}};
  return new Proxy({}, {get:(_,key)=>key});
 }};
 vm.runInNewContext(compile('../src/app/admin/inventory-matrix/page.tsx'),context);
 state[0]=[unit];state[3]=true;state[6]='project-a';
 const render=()=>{cursor=0;return context.exports.default();};
 const matrixProps=()=>nodes(render()).find(node=>node.type==='InventoryMatrix').props;
 assert.equal(matrixProps().canEdit,true);assert.equal(matrixProps().canDelete,true);
 await matrixProps().onStatusChange(unit,'sold');
 assert.equal(updatedVersion,7);assert.equal(state[0][0].status,'sold');
 conflict=true;
 await matrixProps().onStatusChange(unit,'not_marketed');
 assert.equal(refreshes,1);assert.equal(state[0][0].version,10);assert.ok(toasts.some(value=>value.includes('otra sesión')));
 await matrixProps().onDelete(unit);
 assert.equal(deleted,unit.id);assert.equal(state[0].length,0);
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

test('EVP-75 current catalog stylesheet keeps flexible cells and moves selected summary below on phone',()=>{
  const css=read('../src/app/admin-catalog.css');
  const mobile=css.slice(css.indexOf('@media (width < 768px)'));
  assert.match(css,/\.lots-grid \{ grid-template-columns: repeat\(auto-fit,minmax\(64px,1fr\)\); min-width: 0/);
  assert.match(css,/\.lots-content \{ display: grid; grid-template-columns: minmax\(0,1fr\) minmax\(260px,\.45fr\)/);
  assert.match(mobile,/\.lots-content \{ grid-template-columns: minmax\(0,1fr\)/);
  assert.match(mobile,/\.lots-page \.lots-cell \{ min-width: 0; width: 100%/);
  assert.match(css,/\.lots-selected \.inventory-price \{ font-size: 30px; font-weight: 800/);
});
