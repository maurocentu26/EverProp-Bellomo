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

test('catalog loads only the initial property page and further pages are requested explicitly', async () => {
 const requests = [];
 const api = client((url) => {
  const request = new URL(url);
  requests.push(request);
  const page = Number(request.searchParams.get('page'));
  if (request.pathname.endsWith('/projects')) return {data: [{public_id: `project-${page}`, name: `Project ${page}`, project_type: 'LAND_DEVELOPMENT', status: 'AVAILABLE'}], meta: {last_page: 3}};
  return {data: Array.from({length: page === 3 ? 5 : 100}, (_, i) => ({public_id: `property-${(page - 1) * 100 + i}`, title: `Property ${page}-${i}`, operation: 'SALE', category: page === 1 ? 'LOT' : page === 2 ? 'LOCAL' : 'APARTMENT', status: 'AVAILABLE', project: {public_id: `project-${page}`}})), meta: {last_page: 3}};
 });
 const catalog = await api.loadEverpropCatalog();
 assert.equal(catalog.properties.length, 100);
 assert.equal(catalog.projects.length, 3);
 assert.equal(catalog.properties.at(-1).id, 'property-99');
 assert.equal(requests.filter(url => url.pathname.endsWith('/properties')).length, 1);
 const nextPage = await api.loadEverpropPropertiesPage(2, {projectId: 'project-2', status: 'available'});
 assert.equal(nextPage.length, 100);
 assert.equal(nextPage[0].id, 'property-100');
 assert.equal(nextPage[0].propertyType, 'Local');
 const nextRequest = requests.at(-1);
 assert.equal(nextRequest.searchParams.get('page'), '2');
 assert.equal(nextRequest.searchParams.get('per_page'), '100');
 assert.equal(nextRequest.searchParams.get('project'), 'project-2');
 assert.equal(nextRequest.searchParams.get('status'), 'AVAILABLE');
});
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
