import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = path => ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => tree == null ? '' : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
function charts() {
 const grouping = {exports:{}}; vm.runInNewContext(compile('../src/lib/statistics-series.ts'),grouping);
 const state=[]; let cursor=0;
 const context={exports:{},Intl,require(name){
  if(name==='react')return {useState(value){const i=cursor++;if(!(i in state))state[i]=value;return [state[i],v=>state[i]=v];}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/statistics-series')return grouping.exports;
  throw Error(name);
 }};
 vm.runInNewContext(compile('../src/components/admin/statistics/StatisticsCharts.tsx'),context);
 return {...context.exports,render(name,props){cursor=0;return context.exports[name](props);}};
}
test('EVP-76 es-AR, singular, plural and missing metrics',()=>{
 const c=charts();assert.equal(c.formatNumber(12345),'12.345');
 assert.equal(c.countLabel(1,'lead nuevo','leads nuevos'),'1 lead nuevo');
 assert.equal(c.countLabel(2,'lead nuevo','leads nuevos'),'2 leads nuevos');
 assert.equal(c.formatDuration(null),'Sin datos');assert.equal(c.formatPercent(null),'Sin datos');
});
test('EVP-76 evolution has one scale, direct values, accessible text and working range filter',()=>{
 const c=charts(),ranges=[];
 const series=Array.from({length:90},(_,i)=>({date:new Date(Date.UTC(2026,7,i+1)).toISOString().slice(0,10),leads:i===0?1000:0,period_won:0}));
 let tree=c.render('EvolutionChart',{series,onRange:(...range)=>ranges.push(range)});
 assert.doesNotMatch(text(tree),/Escala/); assert.match(text(tree),/Ver valores de la evolución/);
 assert.equal(nodes(tree).filter(n=>n.type==='dt').length,13);
 nodes(tree).find(n=>n.type==='button').props.onClick();assert.deepEqual(ranges[0],['2026-08-01','2026-08-07']);
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'period_won'}});
 tree=c.render('EvolutionChart',{series,onRange:()=>{}});assert.match(text(tree),/cierres con fecha registrada/);
 assert.match(text(c.render('EvolutionChart',{series:[],onRange:()=>{}})),/Sin datos/);
});
test('EVP-76 advisor labels remain readable without color and unavailable averages stay missing',()=>{
 const c=charts(),chosen=[];
 const tree=c.render('AdvisorChart',{advisors:[{id:'one',name:'Responsable',period_won:1},{id:null,name:'Sin asignar',period_won:0}],onAdvisor:id=>chosen.push(id)});
 assert.match(text(tree),/Responsable1/);assert.match(text(tree),/Sin asignar0/);
 nodes(tree).find(n=>n.type==='button').props.onClick(); assert.deepEqual(chosen,['one']);
 assert.equal(nodes(tree).filter(n=>n.type==='button')[1].props.disabled,true);
 const attention=charts().render('AdvisorChart',{advisors:[{id:'one',name:'Responsable',response_minutes:null,answered:0}],onAdvisor:()=>{},attention:true});
 assert.match(text(attention),/Sin datos/);
});
test('EVP-76 existing route and permission gate, no internal notice or fabricated metrics, responsive containment',()=>{
 const page=read('../src/app/admin/estadisticas/page.tsx'),css=read('../src/app/admin-design.css');
 assert.match(page,/user.source === "api" && \["TENANT_ADMIN", "SALES_MANAGER"\]/);
 assert.match(page,/loadCommercialStatistics\(filters, controller.signal\)/);
 assert.match(page,/Reservas del período<\/dt><dd>Sin datos/);
 assert.match(page,/Montos y moneda de operaciones<\/dt><dd>Sin datos/);
 assert.doesNotMatch(page,/Base con datos de prueba|Datos de muestra|QA|total.simulated_leads/);
 assert.match(css,/\.stats-view :is\(input,select,button,summary\) \{ font-size: 17px/);
 const mobile=css.slice(css.lastIndexOf('@media (max-width: 767px)'));
 assert.match(mobile,/\.stats-kpis, \.stats-charts \{ grid-template-columns: minmax\(0,1fr\)/);
 assert.match(mobile,/content: attr\(data-label\)/);
 assert.doesNotMatch(read('../src/components/admin/statistics/StatisticsCharts.tsx'),/minWidth|overflow-x-auto/);
 assert.equal((page.match(/Atrás/g)||[]).length,1);
});

test('EVP-76 page renders four period-aware KPIs and preserves loading, retry and custom period controls',()=>{
 const chart=charts(),state=[];let cursor=0;
 const total={leads:1,period_won:1,won:1,active:0,lost:0,attended:1,conversion:100,close_rate:100,response_minutes:null,resolution_minutes:null,conversations:1,answered:0,resolved:0,undated_won:0};
 const data={total,from:'2026-10-01',to:'2026-10-25',advisor_options:[],advisors:[],series:[],has_simulated_data:true};
 const context={exports:{},Intl,require(name){
  if(name==='react')return {useEffect:()=>{},useState(value){const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return [state[i],v=>state[i]=v];}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/data-mode')return {isMockDataMode:false};
  if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({isReady:true,user:{source:'api',apiRole:'TENANT_ADMIN'}})};
  if(name==='@/components/admin/statistics/StatisticsCharts')return chart;
  return new Proxy({}, {get:(_,key)=>key});
 }};
 vm.runInNewContext(compile('../src/app/admin/estadisticas/page.tsx'),context);
 const render=()=>{cursor=0;return context.exports.default();};
 assert.match(text(render()),/Consultando métricas/);
 state[4]=data;state[7]=false;let tree=render();
 assert.equal(nodes(tree).filter(n=>n.props?.className?.startsWith('stats-kpi ')).length,4);
 assert.match(text(tree),/1 lead nuevo del 1\/10\/2026 al 25\/10\/2026/);
 assert.match(text(tree),/1 cierre ganado con fecha registrada/);
 assert.doesNotMatch(text(tree),/simulados|prueba|Datos de muestra/);
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Personalizado').props.onClick();
 tree=render();assert.equal(nodes(tree).filter(n=>n.type==='input'&&n.props.type==='date').length,2);
 state[6]='Falló la carga';tree=render();assert.match(text(tree),/Reintentar/);
 assert.equal(nodes(tree).filter(n=>n.props?.className?.startsWith('stats-kpi ')).length,0);
});

function statisticsPage({mock,user}) {
 const sample={exports:{}};vm.runInNewContext(compile('../src/data/statistics-sample.ts'),sample);
 const state=[],effects=[],calls=[];let cursor=0;
 const context={exports:{},Intl,AbortController,require(name){
  if(name==='react')return {useEffect:fn=>effects.push(fn),useState(value){const i=cursor++;if(!(i in state))state[i]=typeof value==='function'?value():value;return [state[i],v=>state[i]=v];}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='@/lib/data-mode')return {isMockDataMode:mock};
  if(name==='@/hooks/use-current-session')return {useCurrentSession:()=>({isReady:true,isAdvisor:user.role==='ADVISOR',user})};
  if(name==='@/components/admin/statistics/StatisticsCharts')return charts();
  if(name==='@/data/statistics-sample')return sample.exports;
  if(name==='@/lib/commercial-statistics-api')return {loadCommercialStatistics(){calls.push('api');return Promise.resolve({data:null});}};
  return new Proxy({}, {get:(_,key)=>key});
 }};
 vm.runInNewContext(compile('../src/app/admin/estadisticas/page.tsx'),context);
 return {state,calls,render(){cursor=0;effects.length=0;return context.exports.default();},async load(){effects[0]();for(let i=0;i<10;i++)await Promise.resolve();}};
}
test('EVP-76 real data still denies advisors and local users; only API admins/managers can load',async()=>{
 for(const [source,apiRole,allowed] of [['api','SALES_ADVISOR',false],['local','TENANT_ADMIN',false],['api','TENANT_ADMIN',true],['api','SALES_MANAGER',true]]){
  const page=statisticsPage({mock:false,user:{source,apiRole,role:allowed?'ADMIN':'ADVISOR'}});
  const tree=page.render();await page.load();
  assert.equal(page.calls.length,allowed?1:0);
  if(!allowed){assert.equal(text(tree),'Estadísticas está disponible para gerentes y administradores.');assert.doesNotMatch(text(tree),/sesión de la API/);}
 }
});
test('EVP-76 mock renders sample without API calls, filters dates/advisors and shows missing averages',async()=>{
 const page=statisticsPage({mock:true,user:{source:'local',role:'ADVISOR'}});
 page.render();await page.load();let tree=page.render();
 assert.match(text(tree),/Estadísticas/);assert.match(text(tree),/Sofía Ríos/);
 assert.ok(page.state[4].total.leads>0);const monthTotal=page.state[4].total.leads;
 assert.equal(nodes(tree).filter(n=>n.props?.className?.startsWith('stats-kpi ')).length,4);
 assert.equal((text(tree).match(/Atrás/g)||[]).length,0); // Advisor shell already provides Back.
 nodes(tree).find(n=>n.type==='button'&&text(n)==='Hoy').props.onClick();
 page.render();await page.load();tree=page.render();
 assert.equal(page.state[4].series.length,1);assert.ok(page.state[4].total.leads<monthTotal);
 nodes(tree).find(n=>n.type==='select').props.onChange({target:{value:'stats-lucia'}});
 page.render();await page.load();tree=page.render();const data=page.state[4];
 assert.equal(data.advisors.length,1);assert.equal(data.advisors[0].name,'Lucía Fernández');
 assert.equal(data.total.response_minutes,null);assert.match(text(tree),/Sin datos/);
 assert.equal(data.total.leads,data.series.reduce((sum,row)=>sum+row.leads,0));
 assert.equal(data.total.leads,data.total.active+data.total.won+data.total.lost);
 assert.equal(data.total.leads,data.advisors[0].leads);assert.equal(page.calls.length,0);
 assert.doesNotMatch(text(tree),/Datos de muestra|QA|sesión de la API/);
 const sample={exports:{}};vm.runInNewContext(compile('../src/data/statistics-sample.ts'),sample);
 const empty=sample.exports.loadSampleCommercialStatistics({from:'2000-01-01',to:'2000-01-02',advisor:''}).data;
 assert.equal(empty.total.leads,0);assert.equal(empty.total.conversion,null);assert.equal(empty.series.length,0);
 const menu=read('../src/components/admin/AdminNavigationMenu.tsx');
 assert.match(menu,/canViewCommercialStats: isMockDataMode \|\| \(user\?\.source === "api" && \["TENANT_ADMIN", "SALES_MANAGER"\]/);
 const navigation={exports:{},require(name){if(name==='@/lib/release-visibility')return {isReleaseRouteVisible:()=>true};return new Proxy({}, {get:(_,key)=>key});}};
 vm.runInNewContext(compile('../src/components/sidebar/navigation.ts'),navigation);
 for(const mock of [false,true]){
  const groups=navigation.exports.getAvailableNavigationGroups({isEngineer:false,isAdvisor:true,isMockMode:mock,canViewCommercialStats:mock});
  assert.equal(groups.some(group=>group.items.some(item=>item.href==='/admin/estadisticas')),mock);
 }
});
