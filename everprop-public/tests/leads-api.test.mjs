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
test('loadEverpropLeads fetches all CRM pages so admin advisor filter matches advisor totals above 200 leads', async () => {
 const requestedUrls = [];
 const page1 = Array.from({length: 200}, (_, i) => ({
  id: `lead-${i + 1}`,
  name: `Cliente ${i + 1}`,
  stage: i < 79 ? 'NEW' : i < 94 ? 'CONTACTED' : 'NEW',
  agent_id: i < 94 ? 'advisor-jimena' : 'advisor-sebastian',
  property_ids: [],
 }));
 const page2 = Array.from({length: 66}, (_, i) => ({
  id: `lead-${201 + i}`,
  name: `Cliente ${201 + i}`,
  stage: 'NEW',
  agent_id: 'advisor-jimena',
  property_ids: [],
 }));
 const api = client((url) => {
  requestedUrls.push(url);
  if (url.includes('/api/v1/admin/visits/today')) {
   return {data: [], meta: {total: 0, date: '2026-11-11', timezone: 'America/Argentina/Buenos_Aires'}};
  }
  if (url.endsWith('page=1')) return {data: page1, meta: {next_page: 2}};
  if (url.endsWith('page=2')) return {data: page2, meta: {next_page: null}};
  throw new Error(`Unexpected URL: ${url}`);
 });
 const allLeads = await api.loadEverpropLeads();
 assert.equal(allLeads.length, 266);
 const jimenaLeads = allLeads.filter((l) => l.agentId === 'advisor-jimena');
 const jimenaNewLeads = jimenaLeads.filter((l) => l.stage === 'new');
 assert.equal(jimenaLeads.length, 160);
 assert.equal(jimenaNewLeads.length, 145);
 await api.loadEverpropTodayVisits('advisor-jimena');
 assert.ok(requestedUrls.some((u) => u.endsWith('/api/v1/admin/visits/today?agent_id=advisor-jimena')));
});
