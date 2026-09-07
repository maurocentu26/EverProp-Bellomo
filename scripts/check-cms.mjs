import assert from 'node:assert/strict';
const api='http://127.0.0.1:3001/api/demo/site',pub='http://127.0.0.1:3002/api/demo/site';
const original=await (await fetch(api)).json();let current=original;
const clone=x=>JSON.parse(JSON.stringify(x));
async function change(action,content){const r=await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,action,content})});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));current=data;return data;}
const read=async url=>(await (await fetch(url)).json());
try {
  const draft=clone(original.draft);draft.texts['texto-24'].value='Prueba controlada del editor';
  await change('save',draft);
  assert.notEqual((await read(pub)).content.texts['texto-24'].value,'Prueba controlada del editor','Draft must not affect public website');
  assert.equal((await read(pub+'?preview=1')).content.texts['texto-24'].value,'Prueba controlada del editor','Preview reads draft');
  await change('publish',draft);
  assert.equal((await read(pub)).content.texts['texto-24'].value,'Prueba controlada del editor','Publish changes public website');
  const hidden=clone(draft);hidden.sections.find(s=>s.id==='catalogo-demo').enabled=false;
  await change('publish',hidden);
  assert.deepEqual(await read('http://127.0.0.1:3002/api/demo/properties'),[],'Hidden catalog exposes no listings to web or bot');
  const chat=await readChat('Casa');assert.ok(chat.text.includes('No hay propiedades publicadas'));
  const disabled=clone(hidden);disabled.bot.enabled=false;await change('publish',disabled);
  assert.equal((await fetch('http://127.0.0.1:3002/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Casa'}]})})).status,404,'Disabled bot is disabled server side');
  const invalid=clone(draft);invalid.links[Object.keys(invalid.links)[0]].value='javascript:alert(1)';
  assert.equal((await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.revision,action:'publish',content:invalid})})).status,400,'Reject unsafe link');
  assert.equal((await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:0,action:'save',content:draft})})).status,409,'Prevent overwrite by stale editor');
  console.log('PASS: draft isolation, preview, publish, catalog visibility, bot visibility, URL validation, stale revision protection.');
} finally {
  await change('publish',original.published);
  await change('save',original.draft);
  console.log('Original public content and draft restored.');
}
async function readChat(content){return(await fetch('http://127.0.0.1:3002/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content}]})})).json();}
