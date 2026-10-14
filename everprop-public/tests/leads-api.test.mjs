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
test('lead creation supports linking propertyId and mapLead maps full commercial profile', async () => {
 let request;
 const api = client((url, init) => {
  request = {url, body: JSON.parse(init.body)};
  return {data: {
   id: 'lead-b',
   name: 'Lead con inmueble',
   source_channel: 'WHATSAPP',
   stage: 'NEW',
   budget: 150000,
   currency: 'USD',
   priority: 'HIGH',
   properties: [{
    id: 'prop-1',
    title: 'Depto Centro',
    price: 120000,
    currency: 'USD',
    project_name: 'Torre Central',
    unit_number: '4B',
    sector_name: 'Torre 1',
   }],
  }};
 });
 const lead = await api.createEverpropLead({
  name: 'Lead con inmueble',
  propertyId: 'prop-1',
  budget: 150000,
  currency: 'USD',
  priority: 'HIGH',
 });
 assert.equal(request.body.property_id, 'prop-1');
 assert.equal(request.body.budget, 150000);
 assert.equal(request.body.currency, 'USD');
 assert.equal(lead.budget, 150000);
 assert.equal(lead.currency, 'USD');
 assert.equal(lead.priority, 'HIGH');
 assert.equal(lead.interests[0].price, 120000);
 assert.equal(lead.interests[0].projectName, 'Torre Central');
 assert.equal(lead.interests[0].unitNumber, '4B');
 assert.equal(lead.interests[0].sectorName, 'Torre 1');
 assert.equal(lead.interests[0].unitId, 'prop-1');
});
