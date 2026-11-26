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

test('EVP-73 operation and category filters survive every requested page',async()=>{
 const requests=[];
 const api=client(url=>{requests.push(new URL(url));return {data:[property]};});
 for(const [operation,expected] of [['sale','SALE'],['rent','RENT'],['temporal','TEMPORARY']]) {
  for(const category of ['LOT','APARTMENT','LOCAL','GARAGE','HOUSE']) {
   for(const page of [1,2]) {
    await api.loadEverpropPropertiesPage(page,{projectId:'project-a',status:'reserved',category,operation});
    const query=requests.at(-1).searchParams;
    assert.equal(query.get('page'),String(page)); assert.equal(query.get('category'),category);
    assert.equal(query.get('operation'),expected); assert.equal(query.get('status'),'RESERVED');
    assert.equal(query.get('project'),'project-a');
   }
  }
 }
 await api.loadEverpropPropertiesPage(1,{category:'all',operation:'all'});
 assert.equal(requests.at(-1).searchParams.has('category'),false);
 assert.equal(requests.at(-1).searchParams.has('operation'),false);
});
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

test('lot edits send measures, services and a paired cleared price',async()=>{
 let payload;
 const api=client((url,init)=>{payload=JSON.parse(init.body);return {data:{...property,price:null,currency_code:null,services:payload.services_json,commercial_features:payload.commercial_features_json}};});
 const land={frente_m:10,fondo_m:24,ochava_m2:0,padron:'A-123'};
 const saved=await api.updateEverpropProperty('property-a',{version:8,price:null,currency:null,services:{water:true,electricity:false},commercialFeatures:{land}});
 assert.equal(payload.price,null);assert.equal(payload.currency_code,null);
 assert.equal(payload.services_json.water,true);assert.equal(payload.services_json.electricity,false);
 assert.equal(payload.commercial_features_json.land.padron,'A-123');
 assert.equal(payload.commercial_features_json.land.ochava_m2,0);
 assert.equal(saved.services.water,true);
 assert.equal(saved.commercialFeatures.land.padron,'A-123');
});

test('a batch-generated lot keeps every service when edited',async()=>{
 const raw={...property,services:['agua','luz','alumbrado','cordon','gas']};
 let batchBody, editBody;
 const api=client((url,init)=>{
  if(url.includes('batch-generate')){batchBody=JSON.parse(init.body);return {data:[raw],message:'ok'};}
  if(init?.method==='PATCH'){editBody=JSON.parse(init.body);return {data:{...raw,services:editBody.services_json}};}
  return {data:[raw]};
 });
 const [lot]=await api.loadEverpropPropertiesPage(1);
 assert.deepEqual({...lot.services},{water:true,electricity:true,lighting:true,curb:true,gas:true});
 await api.updateEverpropProperty(lot.id,{version:8,services:{...lot.services,water:false}});
 assert.deepEqual(editBody.services_json,{water:false,electricity:true,lighting:true,curb:true,gas:true});
 assert.equal(Object.hasOwn(editBody.services_json,'0'),false);
 await api.generateLotsBatch({projectId:1,sectorName:'B',lotFrom:1,lotTo:1,area_m2:300,services:['agua','luz','alumbrado','cordon','gas']});
 assert.deepEqual(batchBody.services,{water:true,electricity:true,lighting:true,curb:true,gas:true});
 const mixed=client(()=>({data:[{...raw,services:{0:'agua',1:'alumbrado',water:false,curb:true}}]}));
 const [previouslyEdited]=await mixed.loadEverpropPropertiesPage(1);
 assert.deepEqual({...previouslyEdited.services},{water:false,lighting:true,curb:true});
});

test('not marketed status and deletion use the existing property endpoint',async()=>{
 const requests=[];
 const api=client((url,init)=>{requests.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});return {data:{...property,status:'NOT_MARKETED'}};});
 const updated=await api.updateEverpropPropertyStatus('property-a','not_marketed',8);
 assert.equal(requests[0].body.status,'NOT_MARKETED');assert.equal(updated.status,'not_marketed');
 await api.deleteEverpropProperty('property-a');
 assert.match(requests[1].url,/properties\/property-a$/);assert.equal(requests[1].method,'DELETE');
});

test('Inventory adapter preserves exact codes, null currency and missing prices for the redesigned view',async()=>{
 const rows=['12','12A','12B'].map((code,index)=>({...property,public_id:code,unit_number:code,currency_code:index===1?null:'ARS',price:index===2?null:0}));
 const api=client(()=>({data:rows}));
 const mapped=await api.loadEverpropPropertiesPage(1);
 assert.deepEqual(Array.from(mapped,p=>p.unitNumber),['12','12A','12B']);
 assert.equal(mapped[1].inventoryCurrency,null);
 assert.equal(mapped[2].inventoryPrice,null);
 assert.equal(mapped[0].inventoryPrice,0);
 const projectApi=client(()=>({data:[{public_id:'proj-1',name:'LOTEO SAN PABLO 1',project_type:'LAND_DEVELOPMENT',status:'PRE_SALE',properties_count:123,available_units_count:32,reserved_units_count:0,sold_units_count:91}]}));
 const [mappedProject]=await projectApi.loadEverpropProjects();
 assert.equal(mappedProject.propertiesCount,123);
 assert.equal(mappedProject.availableUnitsCount,32);
 assert.equal(mappedProject.reservedUnitsCount,0);
 assert.equal(mappedProject.soldUnitsCount,91);
});

test('residential details preserve rooms separately from bedrooms and map feature values',async()=>{
 const api=client(()=>({data:[{...property,category:'APARTMENT',rooms:3,bedrooms:2,bathrooms:1,covered_area_m2:'62.5',uncovered_area_m2:'8',floor:4,orientation:'NORTE',disposition:'FRENTE',parking_spaces:1,expenses:'25000',expenses_currency_code:'ARS',features:[{id:7,feature_group:'AMENITY',feature_code:'BALCON',label:'Balcón',value:true,is_filterable:true,sort_order:0}]}]}));
 const [unit]=await api.loadEverpropPropertiesPage(1);
 assert.equal(unit.rooms,3);assert.equal(unit.bedrooms,2);assert.equal(unit.coveredAreaM2,62.5);
 assert.equal(unit.uncoveredAreaM2,8);assert.equal(unit.floor,4);assert.equal(unit.parkingSpaces,1);
 assert.equal(unit.expenses,25000);assert.equal(unit.expensesCurrency,'ARS');
 assert.equal(unit.features[0].value,true);assert.equal(unit.features[0].label,'Balcón');
});

test('residential update sends expenses and currency as a pair and feature CRUD uses property endpoint',async()=>{
 const requests=[];
 const api=client((url,init)=>{requests.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});return {data:property};});
 await api.updateEverpropProperty('property-a',{version:8,rooms:3,bedrooms:2,expenses:25000,expensesCurrency:'ARS'});
 assert.equal(requests[0].body.rooms,3);assert.equal(requests[0].body.bedrooms,2);
 assert.equal(requests[0].body.expenses,25000);assert.equal(requests[0].body.expenses_currency_code,'ARS');
 await api.createEverpropPropertyFeature('property-a',{group:'AMENITY',code:'BALCON',label:'Balcón',value:true});
 await api.updateEverpropPropertyFeature('property-a',7,{label:'Balcón privado',value:'8 m²'});
 await api.deleteEverpropPropertyFeature('property-a',7);
 assert.match(requests[1].url,/properties\/property-a\/features$/);assert.equal(requests[1].method,'POST');
 assert.equal(requests[1].body.feature_group,'AMENITY');assert.equal(requests[1].body.feature_value,true);
 assert.match(requests[2].url,/properties\/property-a\/features\/7$/);assert.equal(requests[2].method,'PATCH');
 assert.equal(requests[2].body.feature_value,'8 m²');assert.equal(requests[3].method,'DELETE');
});
