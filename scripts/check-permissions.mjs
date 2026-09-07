import assert from 'node:assert/strict';
const panel='http://127.0.0.1:3001/api/demo';
const web='http://127.0.0.1:3002/api/demo';
async function call(path, cookie='', method='GET', body, extra={}) {
  return fetch(path.startsWith('http')?path:panel+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
}
async function login(email){const r=await call('/session','','POST',{email,role:'ADMIN',permissions:['full_access']});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);return r.headers.get('set-cookie').split(';')[0];}
const cookies=[];
try {
  for(const [path,method] of [['/properties','GET'],['/properties','POST'],['/properties','PATCH'],['/site','GET'],['/site','PUT'],['/site?view=preview','GET']]) assert.equal((await call(path,'',method,method==='GET'?undefined:{})).status,401,`${method} ${path} requires session`);
  assert.equal((await call('/properties','','PATCH',{}, {'x-user-role':'ADMIN'})).status,401);
  assert.equal((await call('/properties','everprop_local_session=forged','PATCH',{})).status,401);
  assert.equal((await call('/properties?public=1')).status,200);
  assert.equal((await call('/site?view=published')).status,200);
  assert.equal((await call(web+'/site?preview=1')).status,401);
  const advisor=await login('lucas.albarracin@bellomo.com');cookies.push(advisor);
  assert.equal((await (await call('/session',advisor)).json()).user.role,'ADVISOR','Client-supplied role is ignored');
  assert.equal((await call('/properties',advisor)).status,200);
  for(const method of ['POST','PATCH'])assert.equal((await call('/properties',advisor,method,{})).status,403);
  assert.equal((await call('/site',advisor,'PUT',{})).status,403);
  assert.equal((await call('/site',advisor)).status,403);
  assert.equal((await call(web+'/site?preview=1',advisor)).status,403);
  const engineer=await login('sofia@bellomo.com');cookies.push(engineer);
  assert.equal((await call('/site',engineer,'PUT',{})).status,403);
  assert.equal((await call(web+'/site?preview=1',engineer)).status,403);
  const admin=await login('admin@bellomo.com');cookies.push(admin);
  assert.equal((await call('/site',admin)).status,200);
  assert.equal((await call(web+'/site?preview=1',admin)).status,200);
  const list=await (await call('/properties',admin)).json();assert.ok(list.length);
  for(const cookie of [admin,engineer]) {
    assert.equal((await call('/properties',cookie,'POST',{})).status,400,'Authorized request reaches field validation');
    assert.equal((await call('/properties',cookie,'PATCH',{id:list[0].id,published:list[0].published})).status,200,'Authorized role can change inventory');
  }
  assert.equal((await call('/properties',admin,'PATCH',{}, {origin:'https://example.com'})).status,404);
  assert.equal((await call('/session',admin,'DELETE')).status,200);
  assert.equal((await call('/properties',admin,'PATCH',{})).status,401,'Logout revokes token on server');
  console.log('PASS: public reads; session required; advisor writes denied; engineer inventory allowed; website admin only; private preview; forged roles/tokens denied; origin guard; logout revocation.');
} finally { for(const cookie of cookies)await call('/session',cookie,'DELETE'); }
