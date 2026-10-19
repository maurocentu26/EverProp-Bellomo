// Isolated reproductions: no browser data, network, or business records are modified.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function extract(file, name) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  let found;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(found, name);
  return ts.transpile(found, {target:ts.ScriptTarget.ES2022});
}
test('a failed interest update must not display a successful stage-and-interest save', async () => {
  const successes = [];
  const context = {
    leads:[{id:'fixture',stage:'new',interests:[{propertyId:'asset',status:'new'}]}],
    followUps:[],hasRecordedContact:()=>true,selectedPropertyByLead:{},
    STAGE_OPTIONS:[{id:'contacted',apiCode:'CONTACTED',label:'Contactado'}],
    setUpdatingStageLeadId:()=>{},isMockDataMode:false,
    updateEverpropLead:async()=>{},updateEverpropLeadProperty:async()=>{throw new Error('Simulated network failure');},
    setLeads:()=>{},window:{dispatchEvent:()=>{}},Event:class {},
    BroadcastChannel:class {postMessage(){} close(){}},console:{warn(){},error(){}},
    toast:{success:x=>successes.push(x),error:()=>{}},
  };
  vm.createContext(context);
  vm.runInContext(extract('src/components/admin/advisor/AdvisorCockpit.tsx','handleStageChange'),context);
  await context.handleStageChange('fixture','contacted','asset');
  assert.equal(successes.length,0,'A failed property PATCH is swallowed and the success toast is displayed');
});
test('READ_ONLY must not be mapped to a sales advisor', () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(extract('src/lib/everprop-api.ts','mapRole'),context);
  assert.notEqual(context.mapRole('READ_ONLY'),'ADVISOR');
});
test('successful API login must survive blocked localStorage', async () => {
  const react = {createContext:()=>({Provider:{}}),useCallback:f=>f,useContext:()=>{},useEffect:()=>{},
    useMemo:f=>f(),useState:initial=>[initial,()=>{}],createElement:(_,props)=>props.value};
  react.default = react;
  const mocks = {'react':react,'@/data/auth-sample':{MOCK_USERS:[]},'@/lib/data-mode':{isMockDataMode:false},
    '@/lib/everprop-api':{loginEverprop:async()=>({id:'fixture',source:'api'})}};
  const context = {exports:{},require:n=>{assert.ok(mocks[n],n);return mocks[n];},
    localStorage:{removeItem(){throw new Error('Storage unavailable');}}};
  vm.createContext(context);
  const code = ts.transpile(fs.readFileSync(path.join(root,'src/lib/auth-context.tsx'),'utf8'),
    {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true});
  vm.runInContext(code,context);
  const auth = context.exports.AuthProvider({children:null});
  await assert.doesNotReject(auth.login('fixture@example.invalid','fixture'));
});
