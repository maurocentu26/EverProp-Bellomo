import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function client(responder) {
 const context = {exports:{},process:{env:{}},URL,Headers,Event,DOMException,AbortSignal,document:{cookie:''},window:{location:{origin:'http://localhost:3000'},dispatchEvent(){}},fetch:async(url,init)=>({ok:true,status:200,json:async()=>responder(String(url),init)}),require(){throw Error('Unexpected runtime import');}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/everprop-api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return context.exports;
}
test('lead creation preserves zero budget, optional assignment and commercial fields', async () => {
 let request;
 const api = client((url, init) => {
  request = {url, body: JSON.parse(init.body)};
  return {data: {id: 'lead-a', name: 'Nuevo lead', stage: 'NEW', property_ids: []}};
 });
 await api.createEverpropLead({name: 'Nuevo lead', phone: '+5493881234567', origin: 'WhatsApp', priority: 'HIGH', budget: 0, currency: 'ARS', notes: 'Consulta', agentId: null});
 assert.match(request.url, /\/api\/v1\/admin\/leads$/);
 assert.deepEqual(request.body, {name: 'Nuevo lead', source_channel: 'WHATSAPP', email: null, phone: '+5493881234567', stage: 'NEW', priority: 'HIGH', budget: 0, currency: 'ARS', notes: 'Consulta', agent_id: null, property_id: null});
 await api.createEverpropLead({name: 'Nuevo lead', agentId: 'advisor-a'});
 assert.equal(request.body.agent_id, 'advisor-a');
 assert.equal(request.body.budget, null);
});
