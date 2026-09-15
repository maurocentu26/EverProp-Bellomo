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
const property={public_id:'property-a',version:8,title:'Unidad',operation:'SALE',category:'LOT',status:'RESERVED',price:0,currency_code:'ARS'};
test('standalone inventory does not assign project one and preserves zero prices and temporary operation',async()=>{
 let payload;
 const api=client((url,init)=>{payload=JSON.parse(init.body);return {data:property};});
 await api.createEverpropProperty({title:'Unidad',propertyType:'Lote',operation:'temporal',price:0,currency:'ARS',city:'Jujuy'});
 assert.equal(payload.project_id,null);assert.equal(payload.operation,'TEMPORARY');assert.equal(payload.price,0);assert.equal(payload.currency_code,'ARS');
});
test('selected project is resolved from the real tenant resource',async()=>{
 let payload;
 const api=client((url,init)=>{if(url.endsWith('/projects/project-selected')) return {data:{id:42}}; payload=JSON.parse(init.body);return {data:property};});
 await api.createEverpropProperty({title:'Unidad',projectId:'project-selected',price:10});
 assert.equal(payload.project_id,42);
});
test('inventory state changes use the current revision and the update endpoint',async()=>{
 let request;
 const api=client((url,init)=>{request={url,body:JSON.parse(init.body)};return {data:property};});
 const result=await api.updateEverpropPropertyStatus('property-a','reserved',7);
 assert.match(request.url,/properties\/property-a$/);assert.equal(request.body.version,7);assert.equal(request.body.status,'RESERVED');assert.equal(result.version,8);
 await assert.rejects(api.updateEverpropPropertyStatus('property-a','sold'),/versión actual/);
});

test('rented inventory is not presented as available',async()=>{
 const api=client(()=>({data:{...property,status:'RENTED'}}));
 const result=await api.updateEverpropProperty('property-a',{version:8,status:'rented'});
 assert.equal(result.status,'rented');
});

test('technical lot fields survive the create payload and response',async()=>{
 const land={frente_m:10,fondo_m:25,ochava_m2:0,padron:'QA-123',curb:true,lighting:true};
 const api=client((url,init)=>{const body=JSON.parse(init.body);assert.deepEqual(body.commercial_features_json.land,land);return {data:{...property,commercial_features:body.commercial_features_json}};});
 const saved=await api.createEverpropProperty({title:'Lote QA',city:'Jujuy',commercialFeatures:{land}});
 assert.equal(saved.commercialFeatures.land.padron,'QA-123');
 assert.equal(saved.commercialFeatures.land.ochava_m2,0);
});
test('editing only currency does not silently drop the change or overwrite price',async()=>{
 let payload;const api=client((url,init)=>{payload=JSON.parse(init.body);return {data:property};});
 await api.updateEverpropProperty('property-a',{version:8,currency:'ARS'});
 assert.equal(payload.currency_code,'ARS');assert.equal('price' in payload,false);
});
test('cleared optional fields are explicitly sent as null',async()=>{
 let payload;const api=client((url,init)=>{payload=JSON.parse(init.body);return {data:property};});
 await api.updateEverpropProperty('property-a',{version:8,description:null,sectorName:null,unitNumber:null,area_m2:null});
 assert.equal(payload.description,null);assert.equal(payload.sector_name,null);assert.equal(payload.unit_number,null);assert.equal(payload.area_m2,null);
});
